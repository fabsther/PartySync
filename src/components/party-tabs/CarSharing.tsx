import { useEffect, useState } from 'react';
import { Car, MapPin, Users, X, LogOut, UserMinus } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { sendLocalNotification } from '../../lib/notifications';

interface Passenger {
  userId: string;
  pickupLocation: string;
  joinedAt: string;
  userName?: string;
}

interface RideOffer {
  id: string;
  user_id: string;
  departure_location: string;
  capacity: number;
  status: 'active' | 'cancelled' | 'completed';
  passengers: Passenger[];
  profiles: {
    full_name: string | null;
    email: string;
  };
}

interface RideRequest {
  id: string;
  user_id: string;
  departure_location: string;
  status: 'active' | 'cancelled' | 'completed';
  profiles: {
    full_name: string | null;
    email: string;
  };
}

interface CarSharingProps {
  partyId: string;
}

function buildMapsAndWazeLinks(location: string) {
  const q = encodeURIComponent(location);
  return {
    maps: `https://www.google.com/maps/search/?api=1&query=${q}`,
    waze: `https://waze.com/ul?q=${q}`,
  };
}

export function CarSharing({ partyId }: CarSharingProps) {
  const [offers, setOffers] = useState<RideOffer[]>([]);
  const [requests, setRequests] = useState<RideRequest[]>([]);
  const [profiles, setProfiles] = useState<Map<string, any>>(new Map());
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [actionInFlight, setActionInFlight] = useState(false);
  const [formData, setFormData] = useState({
    type: 'offer' as 'offer' | 'request',
    departure_location: '',
    capacity: 3,
  });
  const { user } = useAuth();

  useEffect(() => {
    loadAll();
  }, [partyId]);

  useEffect(() => {
    if (user && formData.type === 'request') {
      loadUserProfile();
    }
  }, [user, formData.type]);

  const loadUserProfile = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('profile_location')
        .eq('id', user.id)
        .maybeSingle();

      if (error) throw error;
      if (data?.profile_location) {
        setFormData(prev => ({
          ...prev,
          departure_location: data.profile_location
        }));
      }
    } catch (error) {
      console.error('Error loading profile:', error);
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
    } catch (error) {
      console.error('Error loading car sharing:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadPassengerProfiles = async (offersList: RideOffer[]) => {
    const userIds = new Set<string>();
    offersList.forEach(offer => {
      offer.passengers.forEach(p => userIds.add(p.userId));
    });

    if (userIds.size === 0) return;

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', Array.from(userIds));

      if (error) throw error;

      const profileMap = new Map();
      (data || []).forEach(profile => {
        profileMap.set(profile.id, profile);
      });
      setProfiles(profileMap);
    } catch (error) {
      console.error('Error loading passenger profiles:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || actionInFlight) return;

    setActionInFlight(true);
    try {
      const insertData: any = {
        party_id: partyId,
        user_id: user.id,
        type: formData.type,
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

      setShowForm(false);
      setFormData({ type: 'offer', departure_location: '', capacity: 3 });
      await loadAll();
    } catch (error) {
      console.error('Error creating entry:', error);
      alert('Failed to create entry. Please try again.');
    } finally {
      setActionInFlight(false);
    }
  };

  const pickupRequester = async (offerId: string, requestId: string, request: RideRequest) => {
    if (actionInFlight) return;

    setActionInFlight(true);
    try {
      const offer = offers.find(o => o.id === offerId);
      if (!offer) {
        alert('Offer not found.');
        return;
      }

      const availableSeats = offer.capacity - offer.passengers.length;
      if (availableSeats <= 0) {
        alert('Offer is full.');
        return;
      }

      const newPassenger: Passenger = {
        userId: request.user_id,
        pickupLocation: request.departure_location,
        joinedAt: new Date().toISOString(),
      };

      // 1) Update the offer (driver owns it) — covered by cs_self_rw / own-update policy
      const updatedPassengers = [...offer.passengers, newPassenger];
      const { error: updateOfferError } = await supabase
        .from('car_sharing')
        .update({ passengers: updatedPassengers })
        .eq('id', offerId)
        .eq('type', 'offer')
        .eq('party_id', partyId)
        .eq('user_id', user!.id);

      if (updateOfferError) throw updateOfferError;

      // 2) Soft-complete the request (driver doesn't own it) — covered by cs_driver_complete_request
      const { data: completed, error: updateRequestError } = await supabase
        .from('car_sharing')
        .update({ status: 'completed' })
        .eq('id', requestId)
        .eq('type', 'request')
        .eq('party_id', partyId)
        .eq('status', 'active') // USING expects active; WITH CHECK expects completed
        .select('id, status')
        .maybeSingle();
      
      if (updateRequestError) throw updateRequestError;
      if (!completed) throw new Error('Request not active or RLS blocked');

      sendLocalNotification(
        'Ride Confirmed',
        `You've been picked up by ${offer.profiles.full_name || offer.profiles.email}!`,
        { partyId, action: 'ride_pickup' }
      );

      sendLocalNotification(
        'Passenger Added',
        `${request.profiles.full_name || request.profiles.email} has been added to your ride.`,
        { partyId, action: 'ride_confirmation' }
      );

      setRequests(prev => prev.filter(r => r.id !== requestId));
      await loadAll();
    } catch (error) {
      console.error('Error picking up requester:', error);
      alert('Failed to pick up requester. Please try again.');
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
  
      const updatedPassengers = offer.passengers.filter(p => p.userId !== passenger.userId);
      if (updatedPassengers.length === offer.passengers.length) {
        throw new Error('Passenger not found or already removed.');
      }
  
      // Update offer passengers
      const { error: updateError } = await supabase
        .from('car_sharing')
        .update({ passengers: updatedPassengers })
        .eq('id', offerId);
      if (updateError) throw updateError;
  
      // Duplicate guard: skip insert if an active request already exists for this (party, user)
      const { data: existing, error: existsErr } = await supabase
        .from('car_sharing')
        .select('id')
        .eq('party_id', partyId)
        .eq('user_id', passenger.userId)
        .eq('type', 'request')
        .eq('status', 'active')
        .maybeSingle();
      if (existsErr && existsErr.code !== 'PGRST116') { // ignore \"No rows\" pseudo-error if it shows
        throw existsErr;
      }
  
      if (!existing) {
        const { error: insertErr } = await supabase
          .from('car_sharing')
          .insert({
            party_id: partyId,
            user_id: passenger.userId,
            type: 'request',
            departure_location: passenger.pickupLocation,
            status: 'active',
            created_by: user!.id,
          });
        if (insertErr) {
          // If you created the partial unique index, duplicates may throw 23505.
          // Uncomment to ignore that case:
          // if (insertErr.code !== '23505') throw insertErr;
          throw insertErr;
        }
      }
  
      sendLocalNotification(
        'Removed from Ride',
        "You've been removed from the ride. A new ride request has been created for you.",
        { partyId, action: 'ride_kicked' }
      );
  
      sendLocalNotification(
        'Passenger Removed',
        `${passenger.userName || 'Passenger'} has been removed from your ride.`,
        { partyId, action: 'ride_kick_confirmation' }
      );
  
      await loadAll();
    } catch (error: any) {
      console.error('Error kicking passenger:', error?.message || error);
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

      const updatedPassengers = offer.passengers.filter(p => p.userId !== user?.id);

      const { error: updateError } = await supabase
        .from('car_sharing')
        .update({ passengers: updatedPassengers })
        .eq('id', offerId);

      if (updateError) throw updateError;

      const { error: insertError } = await supabase
        .from('car_sharing')
        .insert({
          party_id: partyId,
          user_id: user!.id,
          type: 'request',
          departure_location: myPassenger.pickupLocation,
          status: 'active',
          created_by: user!.id,
        });

      if (insertError) throw insertError;

      sendLocalNotification(
        'Left Ride',
        'You have left the ride. A new ride request has been created for you.',
        { partyId, action: 'ride_left' }
      );

      sendLocalNotification(
        'Passenger Left',
        `${myPassenger.userName || 'A passenger'} has left your ride.`,
        { partyId, action: 'ride_left_notification' }
      );

      await loadAll();
    } catch (error) {
      console.error('Error leaving ride:', error);
      alert('Failed to leave ride. Please try again.');
    } finally {
      setActionInFlight(false);
    }
  };
  
   const cancelRequest = async (requestId: string) => {
    if (actionInFlight) return;
    if (!confirm('Cancel this ride request?')) return;
  
    setActionInFlight(true);
    try {
      // Important: destructure *both* data and error ON THIS LINE, and only
      // reference them inside the same try block to avoid scope issues.
      const { data, error } = await supabase
        .from('car_sharing')
        .update({ status: 'cancelled' })
        .eq('id', requestId)
        .eq('type', 'request')          // helps policy match
        .eq('party_id', partyId)        // helps policy match
        .eq('user_id', user!.id)        // owner-only update
        .select('id, status')
        .maybeSingle();
  
      if (error) throw error;           // Supabase error (incl. RLS)
      if (!data) throw new Error('No row updated (RLS, wrong party, or already not active).');
  
      sendLocalNotification(
        'Request Cancelled',
        'Your ride request has been cancelled.',
        { partyId, action: 'request_cancelled' }
      );
  
      // Optimistic UI removal
      setRequests(prev => prev.filter(r => r.id !== requestId));
  
      await loadAll();
    } catch (err: any) {
      // Log full error with code to spot RLS/constraint issues
      console.error('cancelRequest error:', err?.code, err?.message, err);
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
      // 1) Soft-cancel the offer
      const { error: updateError } = await supabase
        .from('car_sharing')
        .update({ status: 'cancelled' })
        .eq('id', offer.id);
  
      if (updateError) throw updateError;
  
      // 2) Fan-out requests for passengers, but avoid duplicates
      if (offer.passengers.length > 0) {
        const passengerIds = offer.passengers.map((p) => p.userId);
  
        // Fetch existing ACTIVE requests for these passengers in this party (single round-trip)
        const { data: existingActive, error: existErr } = await supabase
          .from('car_sharing')
          .select('user_id')
          .eq('party_id', partyId)
          .eq('type', 'request')
          .eq('status', 'active')
          .in('user_id', passengerIds);
  
        if (existErr) throw existErr;
  
        const existingSet = new Set((existingActive || []).map((r: any) => r.user_id));
  
        const newRequests = offer.passengers
          .filter((p) => !existingSet.has(p.userId))
          .map((p) => ({
            party_id: partyId,
            user_id: p.userId,
            type: 'request',
            departure_location: p.pickupLocation,
            status: 'active',
            created_by: offer.user_id, // driver creates on behalf of passengers
          }));
  
        if (newRequests.length > 0) {
          const { error: insertError } = await supabase
            .from('car_sharing')
            .insert(newRequests);
          if (insertError) throw insertError;
        }
  
        // Notify all passengers (whether a new request was inserted or one already existed)
        for (const p of offer.passengers) {
          sendLocalNotification(
            'Ride Cancelled',
            'The ride you were in has been cancelled. A ride request is available for you.',
            { partyId, action: 'ride_cancelled' }
          );
        }
      }
  
      // 3) Notify driver
      sendLocalNotification(
        'Ride Cancelled',
        'Your ride offer has been cancelled.',
        { partyId, action: 'ride_cancel_confirmation' }
      );
  
      await loadAll();
    } catch (error) {
      console.error('Error cancelling offer:', error);
      alert('Failed to cancel ride. Please try again.');
    } finally {
      setActionInFlight(false);
    }
  };

  const handlePickupClick = async (request: RideRequest) => {
    const userOffers = offers.filter(o =>
      o.user_id === user?.id &&
      o.status === 'active' &&
      (o.capacity - o.passengers.length) > 0
    );

    if (userOffers.length === 0) {
      alert('You have no active ride offers with available seats.');
      return;
    }

    if (userOffers.length === 1) {
      await pickupRequester(userOffers[0].id, request.id, request);
    } else {
      const offerIndex = prompt(
        `Select offer:\n${userOffers.map((o, i) =>
          `${i + 1}. From ${o.departure_location} (${o.capacity - o.passengers.length} seats)`
        ).join('\n')}\n\nEnter number:`
      );

      if (offerIndex) {
        const index = parseInt(offerIndex) - 1;
        if (index >= 0 && index < userOffers.length) {
          await pickupRequester(userOffers[index].id, request.id, request);
        }
      }
    }
  };

  if (loading) {
    return <div className="text-center text-neutral-400">Loading car sharing...</div>;
  }

  const userHasActiveOfferWithSeats = offers.some(o =>
    o.user_id === user?.id &&
    o.status === 'active' &&
    (o.capacity - o.passengers.length) > 0
  );

  return (
    <div className="space-y-6">
      <button
        onClick={() => setShowForm(!showForm)}
        disabled={actionInFlight}
        className="w-full md:w-auto px-6 py-3 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Car className="w-5 h-5" />
        <span>{showForm ? 'Cancel' : 'Add Car Share'}</span>
      </button>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-neutral-800 rounded-lg p-6 space-y-4">
          <div className="flex space-x-4">
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="radio"
                name="type"
                value="offer"
                checked={formData.type === 'offer'}
                onChange={() => setFormData({ ...formData, type: 'offer', departure_location: '' })}
                className="text-orange-500 focus:ring-orange-500"
              />
              <span className="text-white">Offering a ride</span>
            </label>
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="radio"
                name="type"
                value="request"
                checked={formData.type === 'request'}
                onChange={() => setFormData({ ...formData, type: 'request' })}
                className="text-orange-500 focus:ring-orange-500"
              />
              <span className="text-white">Requesting a ride</span>
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-2">
              {formData.type === 'offer' ? 'Departure Location' : 'Pickup Location'}
            </label>
            <input
              type="text"
              required
              value={formData.departure_location}
              onChange={(e) => setFormData({ ...formData, departure_location: e.target.value })}
              className="w-full px-4 py-2 bg-neutral-900 border border-neutral-700 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition"
              placeholder={formData.type === 'offer' ? 'Your starting location' : 'Where you need pickup'}
            />
          </div>

          {formData.type === 'offer' && (
            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-2">
                Available Seats
              </label>
              <input
                type="number"
                min="1"
                max="10"
                required
                value={formData.capacity}
                onChange={(e) =>
                  setFormData({ ...formData, capacity: parseInt(e.target.value) })
                }
                className="w-full px-4 py-2 bg-neutral-900 border border-neutral-700 rounded-lg text-white focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={actionInFlight}
            className="w-full px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {actionInFlight ? 'Submitting...' : 'Submit'}
          </button>
        </form>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center space-x-2">
            <Car className="w-5 h-5 text-green-500" />
            <span>Offering Rides ({offers.length})</span>
          </h3>
          <div className="space-y-3">
            {offers.length === 0 ? (
              <p className="text-neutral-500 text-sm">No ride offers yet</p>
            ) : (
              offers.map((offer) => {
                const availableSeats = offer.capacity - offer.passengers.length;
                const taken = offer.passengers.length;
                const isOwner = offer.user_id === user?.id;

                return (
                  <div key={offer.id} className="bg-neutral-800 rounded-lg p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="text-white font-medium">
                        {offer.profiles.full_name || offer.profiles.email}
                      </div>
                      <div className="flex items-center space-x-1 text-sm text-green-400">
                        <Users className="w-4 h-4" />
                        <span>{taken}/{offer.capacity}</span>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2 text-sm text-neutral-400 mb-3">
                      <MapPin className="w-4 h-4" />
                      <span>{offer.departure_location}</span>
                    </div>

                    {offer.passengers.length > 0 && (
                      <div className="mt-3 space-y-2 border-t border-neutral-700 pt-3">
                        <div className="text-xs font-medium text-neutral-400 uppercase">Passengers</div>
                        {offer.passengers.map((passenger, idx) => {
                          const profile = profiles.get(passenger.userId);
                          const isMe = passenger.userId === user?.id;
                          const passengerName = profile?.full_name || profile?.email || 'Unknown';

                          return (
                            <div key={idx} className="flex items-start justify-between bg-neutral-900 p-2 rounded">
                              <div className="flex-1">
                                <div className="text-white text-sm">{passengerName}</div>
                                <div className="text-xs text-neutral-500 flex items-center space-x-2">
                                  <div className="flex items-center space-x-1">
                                    <MapPin className="w-3 h-3" />
                                    <span>{passenger.pickupLocation}</span>
                                  </div>
                                  {passenger.pickupLocation && (() => {
                                    const { maps, waze } = buildMapsAndWazeLinks(passenger.pickupLocation);
                                    return (
                                      <div className="flex items-center space-x-2">
                                        <a href={maps} target="_blank" rel="noopener noreferrer" className="underline hover:text-neutral-300">Google</a>
                                        <a href={waze} target="_blank" rel="noopener noreferrer" className="underline hover:text-neutral-300">Waze</a>
                                      </div>
                                    );
                                  })()}
                                </div>
                              </div>
                              {isOwner && !isMe && (
                                <button
                                  onClick={() => kickPassenger(offer.id, { ...passenger, userName: passengerName })}
                                  disabled={actionInFlight}
                                  className="ml-2 px-2 py-1 bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 transition text-xs flex items-center space-x-1 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  <UserMinus className="w-3 h-3" />
                                  <span>Kick</span>
                                </button>
                              )}
                              {isMe && (
                                <button
                                  onClick={() => leaveRide(offer.id, { ...passenger, userName: passengerName })}
                                  disabled={actionInFlight}
                                  className="ml-2 px-2 py-1 bg-orange-500/20 text-orange-400 rounded hover:bg-orange-500/30 transition text-xs flex items-center space-x-1 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  <LogOut className="w-3 h-3" />
                                  <span>Leave</span>
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {isOwner && (
                      <button
                        onClick={() => cancelOffer(offer)}
                        disabled={actionInFlight}
                        className="mt-3 w-full px-3 py-2 bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 transition text-sm flex items-center justify-center space-x-1 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <X className="w-4 h-4" />
                        <span>Cancel Ride</span>
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div>
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center space-x-2">
            <Car className="w-5 h-5 text-orange-500" />
            <span>Requesting Rides ({requests.length})</span>
          </h3>
          <div className="space-y-3">
            {requests.length === 0 ? (
              <p className="text-neutral-500 text-sm">No ride requests yet</p>
            ) : (
              requests.map((request) => {
                const isOwner = request.user_id === user?.id;

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
                      {request.departure_location && (() => {
                        const { maps, waze } = buildMapsAndWazeLinks(request.departure_location);
                        return (
                          <div className="flex items-center space-x-3 text-xs">
                            <a href={maps} target="_blank" rel="noopener noreferrer" className="underline hover:text-neutral-300">Google</a>
                            <a href={waze} target="_blank" rel="noopener noreferrer" className="underline hover:text-neutral-300">Waze</a>
                          </div>
                        );
                      })()}
                    </div>

                    {!isOwner && userHasActiveOfferWithSeats && (
                      <button
                        onClick={() => handlePickupClick(request)}
                        disabled={actionInFlight}
                        className="w-full px-3 py-2 bg-green-500/20 text-green-400 rounded hover:bg-green-500/30 transition text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Pick up
                      </button>
                    )}

                    {isOwner && (
                      <button
                        onClick={() => cancelRequest(request.id)}
                        disabled={actionInFlight}
                        className="w-full px-3 py-2 bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 transition text-sm flex items-center justify-center space-x-1 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <X className="w-4 h-4" />
                        <span>Cancel Request</span>
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
