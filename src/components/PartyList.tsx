import { useEffect, useState } from 'react';
import { Calendar, MapPin, Clock } from 'lucide-react';
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
}

interface PartyListProps {
  onSelectParty: (partyId: string) => void;
}

export function PartyList({ onSelectParty }: PartyListProps) {
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
      </div>
    );
  }

  if (parties.length === 0) {
    return (
      <div className="text-center py-12">
        <Calendar className="w-16 h-16 text-neutral-700 mx-auto mb-4" />
        <h3 className="text-xl font-semibold text-neutral-400 mb-2">No parties yet</h3>
        <p className="text-neutral-500">Create your first party to get started</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {parties.map((party) => (
        <button
          key={party.id}
          onClick={() => onSelectParty(party.id)}
          className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 hover:border-orange-500 transition-all text-left group"
        >
          <div className="flex items-start justify-between mb-4">
            <h3 className="text-xl font-semibold text-white group-hover:text-orange-400 transition">
              {party.title}
            </h3>
            {!party.is_date_fixed && (
              <span className="px-2 py-1 bg-orange-500/20 text-orange-400 text-xs rounded-full">
                Vote
              </span>
            )}
          </div>

          <p className="text-neutral-400 text-sm mb-4 line-clamp-2">{party.description}</p>

          <div className="space-y-2">
            <div className="flex items-center text-sm text-neutral-500">
              {party.is_date_fixed ? (
                <Calendar className="w-4 h-4 mr-2" />
              ) : (
                <Clock className="w-4 h-4 mr-2" />
              )}
              {formatDate(party.fixed_date)}
            </div>

            {party.address && (
              <div className="flex items-center text-sm text-neutral-500">
                <MapPin className="w-4 h-4 mr-2" />
                <span className="truncate">{party.address}</span>
              </div>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}
