import { useEffect, useState } from 'react';
import { Car, MapPin, Users } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface CarShareEntry {
  id: string;
  type: 'offer' | 'request';
  departure_location: string;
  available_seats: number;
  passengers: string[];
  user_id: string;
  profiles: {
    full_name: string | null;
    email: string;
  };
}

interface CarSharingProps {
  partyId: string;
}

export function CarSharing({ partyId }: CarSharingProps) {
  const [entries, setEntries] = useState<CarShareEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    type: 'offer' as 'offer' | 'request',
    departure_location: '',
    available_seats: 3,
  });
  const { user } = useAuth();

  useEffect(() => {
    loadEntries();
  }, [partyId]);

  const loadEntries = async () => {
    try {
      const { data, error } = await supabase
        .from('car_sharing')
        .select('*, profiles(full_name, email)')
        .eq('party_id', partyId);

      if (error) throw error;
      setEntries(data as CarShareEntry[] || []);
    } catch (error) {
      console.error('Error loading car sharing:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      const { error } = await supabase.from('car_sharing').insert({
        party_id: partyId,
        user_id: user.id,
        ...formData,
      });

      if (error) throw error;

      setShowForm(false);
      setFormData({ type: 'offer', departure_location: '', available_seats: 3 });
      loadEntries();
    } catch (error) {
      console.error('Error creating car share entry:', error);
    }
  };

  if (loading) {
    return <div className="text-center text-neutral-400">Loading car sharing...</div>;
  }

  const offers = entries.filter((e) => e.type === 'offer');
  const requests = entries.filter((e) => e.type === 'request');

  return (
    <div className="space-y-6">
      <button
        onClick={() => setShowForm(!showForm)}
        className="w-full md:w-auto px-6 py-3 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition flex items-center justify-center space-x-2"
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
                onChange={() => setFormData({ ...formData, type: 'offer' })}
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
              Departure Location
            </label>
            <input
              type="text"
              required
              value={formData.departure_location}
              onChange={(e) => setFormData({ ...formData, departure_location: e.target.value })}
              className="w-full px-4 py-2 bg-neutral-900 border border-neutral-700 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition"
              placeholder="Your starting location"
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
                value={formData.available_seats}
                onChange={(e) =>
                  setFormData({ ...formData, available_seats: parseInt(e.target.value) })
                }
                className="w-full px-4 py-2 bg-neutral-900 border border-neutral-700 rounded-lg text-white focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition"
              />
            </div>
          )}

          <button
            type="submit"
            className="w-full px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition"
          >
            Submit
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
              offers.map((entry) => (
                <div key={entry.id} className="bg-neutral-800 rounded-lg p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="text-white font-medium">
                      {entry.profiles.full_name || entry.profiles.email}
                    </div>
                    <div className="flex items-center space-x-1 text-sm text-green-400">
                      <Users className="w-4 h-4" />
                      <span>{entry.available_seats} seats</span>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2 text-sm text-neutral-400">
                    <MapPin className="w-4 h-4" />
                    <span>{entry.departure_location}</span>
                  </div>
                </div>
              ))
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
              requests.map((entry) => (
                <div key={entry.id} className="bg-neutral-800 rounded-lg p-4">
                  <div className="text-white font-medium mb-2">
                    {entry.profiles.full_name || entry.profiles.email}
                  </div>
                  <div className="flex items-center space-x-2 text-sm text-neutral-400">
                    <MapPin className="w-4 h-4" />
                    <span>{entry.departure_location}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
