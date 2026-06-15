import { useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';

interface GuestCountProps {
  partyId: string;
}

export function GuestCount({ partyId }: GuestCountProps) {
  const { t } = useTranslation('party');
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
    <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-orange-500/10 to-orange-600/10 border border-orange-500/30 rounded-lg">
      <Users className="w-4 h-4 text-orange-400 flex-shrink-0" />
      <span className="text-white font-medium text-sm">
        {t('guests_present', { count: totalWithCompanions })}
      </span>
    </div>
  );
}
