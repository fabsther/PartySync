import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Calendar,
  MapPin,
  Clock,
  Users,
  Car,
  Wrench,
  UtensilsCrossed,
  ExternalLink,
  Trash2,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { GuestList } from './party-tabs/GuestList';
import { CarSharing } from './party-tabs/CarSharing';
import { Equipment } from './party-tabs/Equipment';
import { FoodBeverage } from './party-tabs/FoodBeverage';
import { GuestCount } from './GuestCount';

interface Party {
  id: string;
  title: string;
  description: string;
  address: string;
  schedule: string;
  entry_instructions: string;
  is_date_fixed: boolean;
  fixed_date: string | null;
  created_by: string;
}

interface PartyDetailProps {
  partyId: string;
  onBack: () => void;
  onDelete: () => void;
}

type Tab = 'guests' | 'carshare' | 'equipment' | 'food';

export function PartyDetail({ partyId, onBack, onDelete }: PartyDetailProps) {
  const [party, setParty] = useState<Party | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('guests');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    loadParty();
  }, [partyId]);

  const loadParty = async () => {
    try {
      const { data, error } = await supabase
        .from('parties')
        .select('*')
        .eq('id', partyId)
        .maybeSingle();

      if (error) throw error;
      setParty(data);
    } catch (error) {
      console.error('Error loading party:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Date TBD';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const openMaps = (service: 'google' | 'waze') => {
    if (!party?.address) return;
    const encoded = encodeURIComponent(party.address);
    const url =
      service === 'google'
        ? `https://www.google.com/maps/search/?api=1&query=${encoded}`
        : `https://waze.com/ul?q=${encoded}`;
    window.open(url, '_blank');
  };

  const handleDeleteParty = async () => {
    if (!party || !user || party.created_by !== user.id) return;

    setDeleting(true);
    try {
      const { error } = await supabase.from('parties').delete().eq('id', partyId);

      if (error) throw error;

      setShowDeleteModal(false);
      onDelete();
    } catch (error) {
      console.error('Error deleting party:', error);
      alert('Failed to delete party. Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  const isCreator = user?.id === party?.created_by;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
      </div>
    );
  }

  if (!party) {
    return (
      <div className="text-center py-12">
        <p className="text-neutral-400">Party not found</p>
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={onBack}
        className="flex items-center space-x-2 text-neutral-400 hover:text-white mb-6 transition"
      >
        <ArrowLeft className="w-5 h-5" />
        <span>Back to Parties</span>
      </button>

      <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
        <div className="p-6 border-b border-neutral-800">
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-white mb-2">{party.title}</h1>
              <div className="flex items-center space-x-3">
                {!party.is_date_fixed && (
                  <span className="inline-block px-3 py-1 bg-orange-500/20 text-orange-400 text-sm rounded-full">
                    Date voting open
                  </span>
                )}
                <GuestCount partyId={partyId} />
              </div>
            </div>
            {isCreator && (
              <button
                onClick={() => setShowDeleteModal(true)}
                className="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition"
                title="Delete Party"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            )}
          </div>

          {party.description && (
            <p className="text-neutral-300 mb-6">{party.description}</p>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div className="flex items-start">
                {party.is_date_fixed ? (
                  <Calendar className="w-5 h-5 text-orange-500 mr-3 mt-0.5 flex-shrink-0" />
                ) : (
                  <Clock className="w-5 h-5 text-orange-500 mr-3 mt-0.5 flex-shrink-0" />
                )}
                <div>
                  <div className="text-sm text-neutral-500 mb-1">
                    {party.is_date_fixed ? 'Date & Time' : 'Vote for Date'}
                  </div>
                  <div className="text-white">{formatDate(party.fixed_date)}</div>
                </div>
              </div>

              {party.address && (
                <div className="flex items-start">
                  <MapPin className="w-5 h-5 text-orange-500 mr-3 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <div className="text-sm text-neutral-500 mb-1">Location</div>
                    <div className="text-white mb-2">{party.address}</div>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => openMaps('google')}
                        className="text-xs text-orange-400 hover:text-orange-300 flex items-center space-x-1"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span>Google Maps</span>
                      </button>
                      <span className="text-neutral-600">•</span>
                      <button
                        onClick={() => openMaps('waze')}
                        className="text-xs text-orange-400 hover:text-orange-300 flex items-center space-x-1"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span>Waze</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-3">
              {party.schedule && (
                <div>
                  <div className="text-sm text-neutral-500 mb-1">Schedule</div>
                  <div className="text-white whitespace-pre-line">{party.schedule}</div>
                </div>
              )}

              {party.entry_instructions && (
                <div>
                  <div className="text-sm text-neutral-500 mb-1">Entry Instructions</div>
                  <div className="text-white whitespace-pre-line">{party.entry_instructions}</div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="border-b border-neutral-800">
          <div className="flex overflow-x-auto">
            <button
              onClick={() => setActiveTab('guests')}
              className={`flex items-center space-x-2 px-6 py-4 font-medium transition whitespace-nowrap ${
                activeTab === 'guests'
                  ? 'text-orange-500 border-b-2 border-orange-500'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <Users className="w-5 h-5" />
              <span>Guests</span>
            </button>
            <button
              onClick={() => setActiveTab('carshare')}
              className={`flex items-center space-x-2 px-6 py-4 font-medium transition whitespace-nowrap ${
                activeTab === 'carshare'
                  ? 'text-orange-500 border-b-2 border-orange-500'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <Car className="w-5 h-5" />
              <span>Car Sharing</span>
            </button>
            <button
              onClick={() => setActiveTab('equipment')}
              className={`flex items-center space-x-2 px-6 py-4 font-medium transition whitespace-nowrap ${
                activeTab === 'equipment'
                  ? 'text-orange-500 border-b-2 border-orange-500'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <Wrench className="w-5 h-5" />
              <span>Equipment</span>
            </button>
            <button
              onClick={() => setActiveTab('food')}
              className={`flex items-center space-x-2 px-6 py-4 font-medium transition whitespace-nowrap ${
                activeTab === 'food'
                  ? 'text-orange-500 border-b-2 border-orange-500'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <UtensilsCrossed className="w-5 h-5" />
              <span>Food & Drinks</span>
            </button>
          </div>
        </div>

        <div className="p-6">
          {activeTab === 'guests' && <GuestList partyId={partyId} creatorId={party.created_by} />}
          {activeTab === 'carshare' && <CarSharing partyId={partyId} />}
          {activeTab === 'equipment' && <Equipment partyId={partyId} creatorId={party.created_by} />}
          {activeTab === 'food' && <FoodBeverage partyId={partyId} creatorId={party.created_by} />}
        </div>
      </div>

      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 max-w-md w-full">
            <div className="flex items-center space-x-3 mb-4">
              <div className="p-2 bg-red-500/20 rounded-lg">
                <Trash2 className="w-6 h-6 text-red-400" />
              </div>
              <h3 className="text-xl font-bold text-white">Delete Party</h3>
            </div>
            <p className="text-neutral-300 mb-6">
              Are you sure you want to delete this party? This action cannot be undone and will remove all associated data including guests, equipment, and food items.
            </p>
            <div className="flex space-x-3">
              <button
                onClick={() => setShowDeleteModal(false)}
                disabled={deleting}
                className="flex-1 px-4 py-2 bg-neutral-800 text-white rounded-lg hover:bg-neutral-700 transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteParty}
                disabled={deleting}
                className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition disabled:opacity-50 flex items-center justify-center space-x-2"
              >
                {deleting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span>Deleting...</span>
                  </>
                ) : (
                  <span>Delete Party</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
