import { useEffect, useState } from 'react';
import { Car, MapPin, Users, X, LogOut, UserMinus, Navigation } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { sendLocalNotification } from '../../lib/notifications';
import { sendRemoteNotification } from '../../lib/remoteNotify';

interface Passenger {
  userId: string;
  pickupLocation: string;
  joinedAt: string;
  userName?: string;
}

interface RideOffer {
  id: string;
  user_id: string;
  car_type: 'personal' | 'uber';
  departure_location: string;
  capacity: number;
  status: 'active' | 'cancelled' | 'completed';
  passengers: Passenger[];
  profiles: { full_name: string | null; email: string };
}

interface RideRequest {
  id: string;
  user_id: string;
  departure_location: string;
  status: 'active' | 'cancelled' | 'completed';
  profiles: { full_name: string | null; email: string };
}

interface NearbyRequest {
  request: RideRequest;
  distanceKm: number;
  uberCompatible?: boolean; // Phase 4: detour ≤ 150% direct
}

interface CarSharingProps {
  partyId: string;
  partyAddress?: string;
  partyTitle?: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildMapsAndWazeLinks(location: string) {
  const q = encodeURIComponent(location);
  return {
    maps: `https://www.google.com/maps/search/?api=1&query=${q}`,
    waze: `https://waze.com/ul?q=${q}`,
  };
}

function buildUberDeepLink(pickup: string, dropoff: string, dropoffName?: string): string {
  const params = new URLSearchParams({
    action: 'setPickup',
    'pickup[formatted_address]': pickup,
    'dropoff[formatted_address]': dropoff,
  });
  if (dropoffName) params.set('dropoff[nickname]', dropoffName);
  return `https://m.uber.com/ul/?${params.toString()}`;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function geocode(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const { data, error } = await supabase.functions.invoke('geocode', {
      body: { address },
    });
    if (error || data?.error) return null;
    return data as { lat: number; lng: number };
  } catch {
    return null;
  }
}

// ─── Component ──────────────────────────────────────────────────────────────

export function CarSharing({ partyId, partyAddress, partyTitle }: CarSharingProps) {
  const [offers, setOffers] = useState<RideOffer[]>([]);
  const [requests, setRequests] = useState<RideRequest[]>([]);
  const [profiles, setProfiles] = useState<Map<string, any>>(new Map());
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [actionInFlight, setActionInFlight] = useState(false);
  const [hasProfileLocation, setHasProfileLocation] = useState<boolean | null>(null);
  const [saveAddress, setSaveAddress] = useState(false);
  const [nearbyModal, setNearbyModal] = useState<NearbyRequest[] | null>(null);
  const [geocoding, setGeocoding] = useState(false);

  const [formData, setFormData] = useState({
    type: 'offer' as 'offer' | 'request',
    car_type: 'personal' as 'personal' | 'uber',
    departure_location: '',
    capacity: 3,
  });

  const { user } = useAuth();

  useEffect(() => { loadAll(); }, [partyId]);

  useEffect(() => {
    if (user && formData.type === 'request') loadUserProfile();
  }, [user, formData.type]);

  const loadUserProfile = async () => {
    if (!user) return;
    try {
      const { data } = await supabase
        .from('profiles')
        .select('profile_location')
        .eq('id', user.id)
        .maybeSingle();

      if (data?.profile_location) {
        setHasProfileLocation(true);
        setFormData(prev => ({ ...prev, departure_location: data.profile_location }));
      } else {
        setHasProfileLocation(false);
      }
    } catch (err) {
      console.error('Error loading profile:', err);
    }
  };

  const loadAll = async () => {
    try {
      const { data, error } = await supabase
        .from('car_sharing')
        .select('*, profiles(full_name, email)')
        .eq('party_id', partyId)
        .in('status', ['active']);

      if (error) throw error;

      const offersList: RideOffer[] = [];
      const requestsList: RideRequest[] = [];

      (data || []).forEach((entry: any) => {
        if (entry.type === 'offer') {
          offersList.push({
            id: entry.id,
            user_id: entry.user_id,
            car_type: entry.car_type || 'personal',
            departure_location: entry.departure_location || '',
            capacity: entry.capacity || 0,
            status: entry.status,
            passengers: Array.isArray(entry.passengers) ? entry.passengers : [],
            profiles: entry.profiles,
          });
        } else if (entry.type === 'request') {
          requestsList.push({
            id: entry.id,
            user_id: entry.user_id,
            departure_location: entry.departure_location || '',
            status: entry.status,
            profiles: entry.profiles,
          });
        }
      });

      setOffers(offersList);
      setRequests(requestsList);
      await loadPassengerProfiles(offersList);
    } catch (err) {
      console.error('Error loading car sharing:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadPassengerProfiles = async (offersList: RideOffer[]) => {
    const userIds = new Set<string>();
    offersList.forEach(o => o.passengers.forEach(p => userIds.add(p.userId)));
    if (!userIds.size) return;

    try {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', Array.from(userIds));
      const map = new Map();
      (data || []).forEach(p => map.set(p.id, p));
      setProfiles(map);
    } catch (err) {
      console.error('Error loading passenger profiles:', err);
    }
  };

  // ── Phase 3 + 4 : find nearby requests after creating an offer ──────────
  const findNearbyRequests = async (
    offerLocation: string,
    carType: 'personal' | 'uber',
    currentRequests: RideRequest[]
  ) => {
    if (!currentRequests.length) return;
    setGeocoding(true);
    try {
      const offerGeo = await geocode(offerLocation);
      if (!offerGeo) return;

      // For 150% rule we also need party geo
      const partyGeo = carType === 'uber' && partyAddress
        ? await geocode(partyAddress)
        : null;

      const nearby: NearbyRequest[] = [];
      for (const req of currentRequests) {
        if (!req.departure_location) continue;
        const reqGeo = await geocode(req.departure_location);
        if (!reqGeo) continue;

        const distKm = haversineKm(offerGeo.lat, offerGeo.lng, reqGeo.lat, reqGeo.lng);

        if (carType === 'personal') {
          if (distKm <= 15) nearby.push({ request: req, distanceKm: distKm });
        } else {
          // Uber: Phase 4 — 150% rule (distance proxy)
          if (partyGeo) {
            const directKm = haversineKm(offerGeo.lat, offerGeo.lng, partyGeo.lat, partyGeo.lng);
            const detourKm =
              haversineKm(offerGeo.lat, offerGeo.lng, reqGeo.lat, reqGeo.lng) +
              haversineKm(reqGeo.lat, reqGeo.lng, partyGeo.lat, partyGeo.lng);
            const uberCompatible = detourKm <= directKm * 1.5;
            if (uberCompatible || distKm <= 15) {
              nearby.push({ request: req, distanceKm: distKm, uberCompatible });
            }
          } else {
            if (distKm <= 15) nearby.push({ request: req, distanceKm: distKm });
          }
        }
      }

      nearby.sort((a, b) => a.distanceKm - b.distanceKm);
      if (nearby.length) setNearbyModal(nearby);
    } catch (err) {
      console.error('Geocoding error:', err);
    } finally {
      setGeocoding(false);
    }
  };

  // ── Form submit ──────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || actionInFlight) return;

    setActionInFlight(true);
    try {
      const insertData: any = {
        party_id: partyId,
        user_id: user.id,
        type: formData.type,
        car_type: formData.type === 'offer' ? formData.car_type : 'personal',
        departure_location: formData.departure_location,
        status: 'active',
        created_by: user.id,
      };
      if (formData.type === 'offer') {
        insertData.capacity = formData.capacity;
        insertData.passengers = [];
      }

      const { error } = await supabase.from('car_sharing').insert(insertData);
      if (error) throw error;

      // Phase 1: Save address to profile if requested
      if (formData.type === 'request' && saveAddress && !hasProfileLocation) {
        await supabase
          .from('profiles')
          .update({ profile_location: formData.departure_location })
          .eq('id', user.id);
        setHasProfileLocation(true);
      }

      setShowForm(false);
      setFormData({ type: 'offer', car_type: 'personal', departure_location: '', capacity: 3 });
      setSaveAddress(false);

      await loadAll();

      // Phase 3+4: Find nearby requests for new offers
      if (formData.type === 'offer') {
        const { data: freshRequests } = await supabase
          .from('car_sharing')
          .select('*, profiles(full_name, email)')
          .eq('party_id', partyId)
          .eq('type', 'request')
          .eq('status', 'active');

        const reqList: RideRequest[] = (freshRequests || []).map((r: any) => ({
          id: r.id,
          user_id: r.user_id,
          departure_location: r.departure_location || '',
          status: r.status,
          profiles: r.profiles,
        }));

        findNearbyRequests(formData.departure_location, formData.car_type, reqList);
      }
    } catch (err) {
      console.error('Error creating entry:', err);
      alert('Failed to create entry. Please try again.');
    } finally {
      setActionInFlight(false);
    }
  };

  // ── Existing actions (unchanged logic) ──────────────────────────────────
  const pickupRequester = async (offerId: string, requestId: string, request: RideRequest) => {
    if (actionInFlight) return;
    setActionInFlight(true);
    try {
      const offer = offers.find(o => o.id === offerId);
      if (!offer) { alert('Offer not found.'); return; }
      if (offer.capacity - offer.passengers.length <= 0) { alert('Offer is full.'); return; }

      const newPassenger: Passenger = {
        userId: request.user_id,
        pickupLocation: request.departure_location,
        joinedAt: new Date().toISOString(),
      };

      const { error: e1 } = await supabase
        .from('car_sharing')
        .update({ passengers: [...offer.passengers, newPassenger] })
        .eq('id', offerId).eq('type', 'offer').eq('party_id', partyId).eq('user_id', user!.id);
      if (e1) throw e1;

      const { data: completed, error: e2 } = await supabase
        .from('car_sharing')
        .update({ status: 'completed' })
        .eq('id', requestId).eq('type', 'request').eq('party_id', partyId).eq('status', 'active')
        .select('id, status').maybeSingle();
      if (e2) throw e2;
      if (!completed) throw new Error('Request not active or RLS blocked');

      await sendRemoteNotification(
        request.user_id, 'Pris en charge',
        `Vous avez été pris en charge par ${offer.profiles.full_name || offer.profiles.email}.`,
        { partyId, action: 'ride_pickup', offerId: offer.id, requestId: request.id },
        `/carsharing?partyId=${partyId}`
      );
      sendLocalNotification('Passenger Added',
        `${request.profiles.full_name || request.profiles.email} has been added to your ride.`,
        { partyId, action: 'ride_confirmation' }
      );

      setRequests(prev => prev.filter(r => r.id !== requestId));
      await loadAll();
    } catch (err) {
      console.error('pickupRequester error:', err);
      alert('Failed to pick up requester.');
    } finally {
      setActionInFlight(false);
    }
  };

  const kickPassenger = async (offerId: string, passenger: Passenger) => {
    if (actionInFlight) return;
    if (!confirm(`Remove ${passenger.userName || 'this passenger'}?`)) return;
    setActionInFlight(true);
    try {
      const offer = offers.find(o => o.id === offerId);
      if (!offer) throw new Error('Offer not found');

      const updated = offer.passengers.filter(p => p.userId !== passenger.userId);
      const { error: e1 } = await supabase.from('car_sharing').update({ passengers: updated }).eq('id', offerId);
      if (e1) throw e1;

      const { data: existing } = await supabase.from('car_sharing').select('id')
        .eq('party_id', partyId).eq('user_id', passenger.userId).eq('type', 'request').eq('status', 'active').maybeSingle();

      if (!existing) {
        const { error: e2 } = await supabase.from('car_sharing').insert({
          party_id: partyId, user_id: passenger.userId, type: 'request',
          departure_location: passenger.pickupLocation, status: 'active', created_by: user!.id,
        });
        if (e2) throw e2;
      }

      await sendRemoteNotification(passenger.userId, 'Retiré du trajet',
        'Vous avez été retiré du trajet. Une nouvelle demande a été créée pour vous.',
        { partyId, action: 'ride_kicked', offerId }, `/carsharing?partyId=${partyId}`
      );
      sendLocalNotification('Passenger Removed', `${passenger.userName || 'Passenger'} has been removed.`, { partyId });
      await loadAll();
    } catch (err: any) {
      console.error('kickPassenger:', err?.message);
      alert('Failed to remove passenger.');
    } finally {
      setActionInFlight(false);
    }
  };

  const leaveRide = async (offerId: string, myPassenger: Passenger) => {
    if (actionInFlight) return;
    if (!confirm('Leave this ride?')) return;
    setActionInFlight(true);
    try {
      const offer = offers.find(o => o.id === offerId);
      if (!offer) return;

      const updated = offer.passengers.filter(p => p.userId !== user?.id);
      const { error: e1 } = await supabase.from('car_sharing').update({ passengers: updated }).eq('id', offerId);
      if (e1) throw e1;

      const { data: inserted, error: e2 } = await supabase.from('car_sharing').insert({
        party_id: partyId, user_id: user!.id, type: 'request',
        departure_location: myPassenger.pickupLocation, status: 'active', created_by: user!.id,
      }).select('id').single();
      if (e2) throw e2;

      sendLocalNotification('Left Ride', 'A new ride request has been created for you.', { partyId });
      await sendRemoteNotification(offer.user_id, 'Demande annulée', 'Le passager a annulé sa demande.',
        { partyId, action: 'request_cancelled_by_user', requestId: inserted?.id }, `/carsharing?partyId=${partyId}`
      );
      await loadAll();
    } catch (err) {
      console.error('leaveRide:', err);
      alert('Failed to leave ride.');
    } finally {
      setActionInFlight(false);
    }
  };

  const cancelRequest = async (requestId: string) => {
    if (actionInFlight) return;
    if (!confirm('Cancel this ride request?')) return;
    setActionInFlight(true);
    try {
      const { data, error } = await supabase.from('car_sharing')
        .update({ status: 'cancelled' })
        .eq('id', requestId).eq('type', 'request').eq('party_id', partyId).eq('user_id', user!.id)
        .select('id, status').maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('No row updated.');
      sendLocalNotification('Request Cancelled', 'Your ride request has been cancelled.', { partyId });
      setRequests(prev => prev.filter(r => r.id !== requestId));
      await loadAll();
    } catch (err: any) {
      console.error('cancelRequest:', err?.message);
      alert(err?.message || 'Failed to cancel request.');
    } finally {
      setActionInFlight(false);
    }
  };

  const cancelOffer = async (offer: RideOffer) => {
    if (actionInFlight) return;
    if (!confirm('Cancel this ride offer? All passengers will be notified.')) return;
    setActionInFlight(true);
    try {
      const { error: e1 } = await supabase.from('car_sharing').update({ status: 'cancelled' }).eq('id', offer.id);
      if (e1) throw e1;

      if (offer.passengers.length > 0) {
        const ids = offer.passengers.map(p => p.userId);
        const { data: existing } = await supabase.from('car_sharing').select('user_id')
          .eq('party_id', partyId).eq('type', 'request').eq('status', 'active').in('user_id', ids);
        const existingSet = new Set((existing || []).map((r: any) => r.user_id));
        const newReqs = offer.passengers.filter(p => !existingSet.has(p.userId)).map(p => ({
          party_id: partyId, user_id: p.userId, type: 'request',
          departure_location: p.pickupLocation, status: 'active', created_by: offer.user_id,
        }));
        if (newReqs.length) {
          const { error: e2 } = await supabase.from('car_sharing').insert(newReqs);
          if (e2) throw e2;
        }
        for (const p of offer.passengers) {
          await sendRemoteNotification(p.userId, 'Trajet annulé',
            'Le trajet a été annulé. Une demande a été créée pour vous.',
            { partyId, action: 'offer_cancelled', offerId: offer.id }, `/carsharing?partyId=${partyId}`
          );
        }
      }
      sendLocalNotification('Ride Cancelled', 'Your ride offer has been cancelled.', { partyId });
      await loadAll();
    } catch (err) {
      console.error('cancelOffer:', err);
      alert('Failed to cancel ride.');
    } finally {
      setActionInFlight(false);
    }
  };

  const handlePickupClick = async (request: RideRequest) => {
    const myOffers = offers.filter(o =>
      o.user_id === user?.id && o.status === 'active' && o.capacity - o.passengers.length > 0
    );
    if (!myOffers.length) { alert('You have no active ride offers with available seats.'); return; }
    if (myOffers.length === 1) {
      await pickupRequester(myOffers[0].id, request.id, request);
    } else {
      const idx = prompt(
        `Select offer:\n${myOffers.map((o, i) => `${i + 1}. From ${o.departure_location} (${o.capacity - o.passengers.length} seats)`).join('\n')}\n\nEnter number:`
      );
      if (idx) {
        const i = parseInt(idx) - 1;
        if (i >= 0 && i < myOffers.length) await pickupRequester(myOffers[i].id, request.id, request);
      }
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────

  if (loading) return <div className="text-center text-neutral-400">Loading car sharing...</div>;

  const userHasActiveOfferWithSeats = offers.some(o =>
    o.user_id === user?.id && o.status === 'active' && o.capacity - o.passengers.length > 0
  );

  return (
    <div className="space-y-6">
      {/* Add Car Share button */}
      <button
        onClick={() => setShowForm(!showForm)}
        disabled={actionInFlight}
        className="w-full md:w-auto px-6 py-3 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition flex items-center justify-center space-x-2 disabled:opacity-50"
      >
        <Car className="w-5 h-5" />
        <span>{showForm ? 'Annuler' : 'Ajouter un trajet'}</span>
      </button>

      {/* ── Form ─────────────────────────────────────────────────────────── */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-neutral-800 rounded-lg p-6 space-y-4">
          {/* Offer / Request toggle */}
          <div className="flex space-x-4">
            {(['offer', 'request'] as const).map(t => (
              <label key={t} className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="radio" name="type" value={t}
                  checked={formData.type === t}
                  onChange={() => setFormData({ ...formData, type: t, departure_location: '', car_type: 'personal' })}
                  className="text-orange-500 focus:ring-orange-500"
                />
                <span className="text-white">
                  {t === 'offer' ? 'Je propose un trajet' : 'Je cherche un trajet'}
                </span>
              </label>
            ))}
          </div>

          {/* Phase 2 — car type (offers only) */}
          {formData.type === 'offer' && (
            <div className="flex space-x-3">
              {(['personal', 'uber'] as const).map(ct => (
                <button
                  key={ct} type="button"
                  onClick={() => setFormData({ ...formData, car_type: ct })}
                  className={`flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition ${
                    formData.car_type === ct
                      ? ct === 'uber'
                        ? 'border-black bg-black text-white'
                        : 'border-orange-500 bg-orange-500/20 text-orange-400'
                      : 'border-neutral-600 text-neutral-400 hover:border-neutral-500'
                  }`}
                >
                  {ct === 'uber' ? '🚗 Via Uber' : '🚙 Voiture perso'}
                </button>
              ))}
            </div>
          )}

          {/* Departure / pickup location */}
          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-2">
              {formData.type === 'offer' ? 'Adresse de départ' : 'Adresse de ramassage'}
            </label>
            <input
              type="text" required
              value={formData.departure_location}
              onChange={e => setFormData({ ...formData, departure_location: e.target.value })}
              className="w-full px-4 py-2 bg-neutral-900 border border-neutral-700 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition"
              placeholder={formData.type === 'offer' ? 'Ton adresse de départ' : 'Où tu veux être pris'}
            />
            {/* Phase 1 — save to profile checkbox */}
            {formData.type === 'request' && hasProfileLocation === false && (
              <label className="flex items-center space-x-2 mt-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={saveAddress}
                  onChange={e => setSaveAddress(e.target.checked)}
                  className="rounded text-orange-500 focus:ring-orange-500"
                />
                <span className="text-sm text-neutral-400">Sauvegarder comme adresse par défaut</span>
              </label>
            )}
          </div>

          {/* Seats (personal offer only) */}
          {formData.type === 'offer' && formData.car_type === 'personal' && (
            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-2">Places disponibles</label>
              <input
                type="number" min="1" max="10" required
                value={formData.capacity}
                onChange={e => setFormData({ ...formData, capacity: parseInt(e.target.value) })}
                className="w-full px-4 py-2 bg-neutral-900 border border-neutral-700 rounded-lg text-white focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition"
              />
            </div>
          )}

          <button
            type="submit" disabled={actionInFlight}
            className="w-full px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition disabled:opacity-50"
          >
            {actionInFlight ? 'Envoi…' : 'Valider'}
          </button>
        </form>
      )}

      {/* Geocoding spinner */}
      {geocoding && (
        <div className="text-sm text-neutral-400 flex items-center space-x-2">
          <div className="w-4 h-4 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
          <span>Recherche des personnes à proximité…</span>
        </div>
      )}

      {/* ── Phase 3+4 Nearby modal ────────────────────────────────────────── */}
      {nearbyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
          <div className="bg-neutral-900 border border-neutral-700 rounded-xl p-6 w-full max-w-md space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold text-white">
                {nearbyModal.length} personne{nearbyModal.length > 1 ? 's' : ''} à proximité
              </h3>
              <button onClick={() => setNearbyModal(null)} className="text-neutral-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-neutral-400">Ces personnes cherchent un trajet dans ton secteur.</p>
            <div className="space-y-3 max-h-72 overflow-y-auto">
              {nearbyModal.map(({ request, distanceKm, uberCompatible }) => (
                <div key={request.id} className="bg-neutral-800 rounded-lg p-3 space-y-1">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="text-white font-medium text-sm">
                        {request.profiles.full_name || request.profiles.email}
                      </div>
                      <div className="text-xs text-neutral-400 flex items-center space-x-1">
                        <MapPin className="w-3 h-3" />
                        <span>{request.departure_location}</span>
                      </div>
                    </div>
                    <div className="text-right text-xs">
                      <div className="text-orange-400 font-medium">{distanceKm.toFixed(1)} km</div>
                      {uberCompatible !== undefined && (
                        <div className={uberCompatible ? 'text-green-400' : 'text-red-400'}>
                          {uberCompatible ? '✓ Uber compatible' : '✗ Détour trop long'}
                        </div>
                      )}
                    </div>
                  </div>
                  {userHasActiveOfferWithSeats && request.user_id !== user?.id && (
                    <button
                      onClick={async () => {
                        await handlePickupClick(request);
                        setNearbyModal(null);
                      }}
                      disabled={actionInFlight}
                      className="w-full mt-1 px-3 py-1.5 bg-green-500/20 text-green-400 rounded hover:bg-green-500/30 transition text-xs disabled:opacity-50"
                    >
                      Prendre en charge
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              onClick={() => setNearbyModal(null)}
              className="w-full py-2 text-neutral-400 hover:text-white text-sm transition"
            >
              Fermer
            </button>
          </div>
        </div>
      )}

      {/* ── Offers + Requests grid ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Offers */}
        <div>
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center space-x-2">
            <Car className="w-5 h-5 text-green-500" />
            <span>Trajets proposés ({offers.length})</span>
          </h3>
          <div className="space-y-3">
            {offers.length === 0 ? (
              <p className="text-neutral-500 text-sm">Aucune offre pour l'instant</p>
            ) : offers.map(offer => {
              const available = offer.capacity - offer.passengers.length;
              const isOwner = offer.user_id === user?.id;
              const isUber = offer.car_type === 'uber';

              return (
                <div key={offer.id} className="bg-neutral-800 rounded-lg p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      <div className="text-white font-medium">
                        {offer.profiles.full_name || offer.profiles.email}
                      </div>
                      {/* Phase 2 — car type badge */}
                      {isUber ? (
                        <span className="px-2 py-0.5 bg-black text-white text-xs rounded-full font-medium">Uber</span>
                      ) : (
                        <span className="px-2 py-0.5 bg-neutral-700 text-neutral-300 text-xs rounded-full">Perso</span>
                      )}
                    </div>
                    <div className="flex items-center space-x-1 text-sm text-green-400">
                      <Users className="w-4 h-4" />
                      <span>{offer.passengers.length}/{offer.capacity}</span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 text-sm text-neutral-400 mb-2">
                    <MapPin className="w-4 h-4" />
                    <span>{offer.departure_location}</span>
                  </div>

                  {/* Phase 2 — Uber deep link */}
                  {isUber && partyAddress && (
                    <a
                      href={buildUberDeepLink(offer.departure_location, partyAddress, partyTitle)}
                      target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-black text-white text-xs rounded-lg hover:bg-neutral-900 transition mb-3"
                    >
                      <Navigation className="w-3.5 h-3.5" />
                      <span>Ouvrir Uber</span>
                    </a>
                  )}

                  {/* Passengers list */}
                  {offer.passengers.length > 0 && (
                    <div className="mt-3 space-y-2 border-t border-neutral-700 pt-3">
                      <div className="text-xs font-medium text-neutral-400 uppercase">Passagers</div>
                      {offer.passengers.map((p, idx) => {
                        const profile = profiles.get(p.userId);
                        const name = profile?.full_name || profile?.email || 'Inconnu';
                        const isMe = p.userId === user?.id;
                        const { maps, waze } = buildMapsAndWazeLinks(p.pickupLocation);
                        return (
                          <div key={idx} className="flex items-start justify-between bg-neutral-900 p-2 rounded">
                            <div className="flex-1">
                              <div className="text-white text-sm">{name}</div>
                              <div className="text-xs text-neutral-500 flex items-center space-x-2">
                                <MapPin className="w-3 h-3" />
                                <span>{p.pickupLocation}</span>
                                <a href={maps} target="_blank" rel="noopener noreferrer" className="underline hover:text-neutral-300">Google</a>
                                <a href={waze} target="_blank" rel="noopener noreferrer" className="underline hover:text-neutral-300">Waze</a>
                              </div>
                            </div>
                            {isOwner && !isMe && (
                              <button onClick={() => kickPassenger(offer.id, { ...p, userName: name })}
                                disabled={actionInFlight}
                                className="ml-2 px-2 py-1 bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 transition text-xs flex items-center space-x-1 disabled:opacity-50"
                              >
                                <UserMinus className="w-3 h-3" /><span>Retirer</span>
                              </button>
                            )}
                            {isMe && (
                              <button onClick={() => leaveRide(offer.id, { ...p, userName: name })}
                                disabled={actionInFlight}
                                className="ml-2 px-2 py-1 bg-orange-500/20 text-orange-400 rounded hover:bg-orange-500/30 transition text-xs flex items-center space-x-1 disabled:opacity-50"
                              >
                                <LogOut className="w-3 h-3" /><span>Quitter</span>
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {isOwner && (
                    <button onClick={() => cancelOffer(offer)} disabled={actionInFlight}
                      className="mt-3 w-full px-3 py-2 bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 transition text-sm flex items-center justify-center space-x-1 disabled:opacity-50"
                    >
                      <X className="w-4 h-4" /><span>Annuler le trajet</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Requests */}
        <div>
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center space-x-2">
            <Car className="w-5 h-5 text-orange-500" />
            <span>Demandes de trajet ({requests.length})</span>
          </h3>
          <div className="space-y-3">
            {requests.length === 0 ? (
              <p className="text-neutral-500 text-sm">Aucune demande pour l'instant</p>
            ) : requests.map(request => {
              const isOwner = request.user_id === user?.id;
              const { maps, waze } = buildMapsAndWazeLinks(request.departure_location);
              return (
                <div key={request.id} className="bg-neutral-800 rounded-lg p-4">
                  <div className="text-white font-medium mb-2">
                    {request.profiles.full_name || request.profiles.email}
                  </div>
                  <div className="flex items-center justify-between text-sm text-neutral-400 mb-3">
                    <div className="flex items-center space-x-2">
                      <MapPin className="w-4 h-4" />
                      <span>{request.departure_location}</span>
                    </div>
                    <div className="flex items-center space-x-3 text-xs">
                      <a href={maps} target="_blank" rel="noopener noreferrer" className="underline hover:text-neutral-300">Google</a>
                      <a href={waze} target="_blank" rel="noopener noreferrer" className="underline hover:text-neutral-300">Waze</a>
                    </div>
                  </div>

                  {!isOwner && userHasActiveOfferWithSeats && (
                    <button onClick={() => handlePickupClick(request)} disabled={actionInFlight}
                      className="w-full px-3 py-2 bg-green-500/20 text-green-400 rounded hover:bg-green-500/30 transition text-sm disabled:opacity-50"
                    >
                      Prendre en charge
                    </button>
                  )}
                  {isOwner && (
                    <button onClick={() => cancelRequest(request.id)} disabled={actionInFlight}
                      className="w-full px-3 py-2 bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 transition text-sm flex items-center justify-center space-x-1 disabled:opacity-50"
                    >
                      <X className="w-4 h-4" /><span>Annuler la demande</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </div>
  );
}
