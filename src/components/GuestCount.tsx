import { useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface GuestCountProps {
  partyId: string;
}

export function GuestCount({ partyId }: GuestCountProps) {
  const [confirmedGuests, setConfirmedGuests] = useState(0);
  const [totalWithCompanions, setTotalWithCompanions] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadGuestCount();
  }, [partyId]);

  const loadGuestCount = async () => {
    try {
      const { data: guests, error } = await supabase
        .from('party_guests')
        .select('id, status, guest_companions(id)')
        .eq('party_id', partyId)
        .eq('status', 'confirmed');

      if (error) throw error;

      const confirmedCount = guests?.length || 0;
      const companionsCount = guests?.reduce((sum, guest) => {
        return sum + ((guest.guest_companions as any)?.length || 0);
      }, 0) || 0;

      setConfirmedGuests(confirmedCount);
      setTotalWithCompanions(confirmedCount + companionsCount);
    } catch (error) {
      console.error('Error loading guest count:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return null;
  }

  return (
    <div className="inline-flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-orange-500/10 to-orange-600/10 border border-orange-500/30 rounded-lg">
      <Users className="w-5 h-5 text-orange-400" />
      <div className="text-white">
        <span className="font-bold">{totalWithCompanions}</span>
        <span className="text-neutral-400 text-sm ml-1">
          total ({confirmedGuests} guest{confirmedGuests !== 1 ? 's' : ''})
        </span>
      </div>
    </div>
  );
}
