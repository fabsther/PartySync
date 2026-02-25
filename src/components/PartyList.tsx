import { useEffect, useState } from 'react';
import { Calendar, MapPin, Clock, Plus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface Party {
  id: string;
  title: string;
  description: string;
  address: string;
  is_date_fixed: boolean;
  fixed_date: string | null;
  created_at: string;
  created_by: string;
  cancelled_at: string | null;
  banner_url: string | null;
  icon_url: string | null;
}

interface PartyListProps {
  onSelectParty: (partyId: string) => void;
  onCreateParty: () => void;
}

export function PartyList({ onSelectParty, onCreateParty }: PartyListProps) {
  const [parties, setParties] = useState<Party[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    loadParties();
  }, [user]);

  const loadParties = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('parties')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setParties(data || []);
    } catch (error) {
      console.error('Error loading parties:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Date TBD';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Parties annulées : masquer une fois que la date est passée
  const now = new Date();
  const visibleParties = parties.filter((p) => {
    if (!p.cancelled_at) return true;
    if (!p.fixed_date) return true;
    return new Date(p.fixed_date) > now;
  });

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-white">Parties</h2>
        <button
          onClick={onCreateParty}
          className="bg-gradient-to-r from-orange-500 to-orange-600 text-white px-4 py-2 rounded-lg font-medium hover:from-orange-600 hover:to-orange-700 transition flex items-center space-x-2"
        >
          <Plus className="w-5 h-5" />
          <span>New Party</span>
        </button>
      </div>

      {loading ? (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
      </div>
      ) : visibleParties.length === 0 ? (
      <div className="text-center py-12">
        <Calendar className="w-16 h-16 text-neutral-700 mx-auto mb-4" />
        <h3 className="text-xl font-semibold text-neutral-400 mb-2">No parties yet</h3>
        <p className="text-neutral-500">Create your first party to get started</p>
      </div>
      ) : (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {visibleParties.map((party) => (
        <button
          key={party.id}
          onClick={() => onSelectParty(party.id)}
          className={`relative border rounded-xl overflow-hidden transition-all text-left group ${
            party.cancelled_at
              ? 'border-red-500/30 opacity-70 hover:border-red-500/50'
              : 'border-neutral-800 hover:border-orange-500'
          }`}
        >
          {/* Banner */}
          {party.banner_url && (
            <div className="relative h-28 w-full">
              <img src={party.banner_url} alt="" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-b from-black/20 to-black/70" />
              <div className="absolute top-2 right-2 flex gap-1">
                {party.cancelled_at ? (
                  <span className="px-2 py-0.5 bg-red-500/80 text-white text-xs rounded-full">Annulée</span>
                ) : !party.is_date_fixed ? (
                  <span className="px-2 py-0.5 bg-orange-500/80 text-white text-xs rounded-full">Vote</span>
                ) : null}
              </div>
            </div>
          )}

          <div className="bg-neutral-900 p-5">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                {party.icon_url && (
                  <img
                    src={party.icon_url}
                    alt=""
                    className={`w-8 h-8 rounded-lg object-cover flex-shrink-0 ${party.banner_url ? '-mt-10 border-2 border-neutral-900' : ''}`}
                  />
                )}
                <h3 className={`text-xl font-semibold transition truncate ${party.cancelled_at ? 'text-neutral-400 line-through' : 'text-white group-hover:text-orange-400'}`}>
                  {party.title}
                </h3>
              </div>
              {!party.banner_url && (
                <div className="flex gap-1 shrink-0 ml-2">
                  {party.cancelled_at ? (
                    <span className="px-2 py-1 bg-red-500/20 text-red-400 text-xs rounded-full">Annulée</span>
                  ) : !party.is_date_fixed ? (
                    <span className="px-2 py-1 bg-orange-500/20 text-orange-400 text-xs rounded-full">Vote</span>
                  ) : null}
                </div>
              )}
            </div>

            <p className="text-neutral-400 text-sm mb-3 line-clamp-2">{party.description}</p>

            <div className="space-y-1.5">
              <div className="flex items-center text-sm text-neutral-500">
                {party.is_date_fixed ? (
                  <Calendar className="w-4 h-4 mr-2 shrink-0" />
                ) : (
                  <Clock className="w-4 h-4 mr-2 shrink-0" />
                )}
                {formatDate(party.fixed_date)}
              </div>
              {party.address && (
                <div className="flex items-center text-sm text-neutral-500">
                  <MapPin className="w-4 h-4 mr-2 shrink-0" />
                  <span className="truncate">{party.address}</span>
                </div>
              )}
            </div>
          </div>
        </button>
      ))}
    </div>
      )}
    </div>
  );
}
