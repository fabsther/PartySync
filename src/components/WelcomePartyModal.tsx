import { useState } from 'react';
import { Calendar, Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export interface WelcomePartyInfo {
  id: string;
  title: string;
  fixed_date: string | null;
  is_date_fixed: boolean;
  creator_name: string | null;
}

interface Props {
  party: WelcomePartyInfo;
  onClose: () => void;
}

export function WelcomePartyModal({ party, onClose }: Props) {
  const { t, i18n } = useTranslation('party');
  const { user } = useAuth();
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const formatDate = (dateString: string | null) => {
    if (!dateString) return t('date_tbd');
    const locale = i18n.resolvedLanguage ?? 'fr';
    return new Date(dateString).toLocaleDateString(locale, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleConfirm = async () => {
    if (!user) return;
    setConfirming(true);
    try {
      await supabase
        .from('party_guests')
        .update({ status: 'confirmed' })
        .eq('party_id', party.id)
        .eq('user_id', user.id);
      setConfirmed(true);
      setTimeout(onClose, 800);
    } catch (e) {
      console.error('Error confirming attendance:', e);
      onClose();
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 max-w-md w-full shadow-2xl">
        <div className="text-center mb-6">
          <div className="text-5xl mb-3">{confirmed ? '🎊' : '🎉'}</div>
          <h2 className="text-2xl font-bold text-white mb-1">
            {confirmed ? t('invited_see_you') : t('invited_title')}
          </h2>
          {party.creator_name && !confirmed && (
            <p className="text-neutral-400 text-sm">
              <span className="text-orange-400 font-medium">{party.creator_name}</span>{' '}
              {t('invited_by', { name: '' }).replace('<1></1> ', '')}
            </p>
          )}
        </div>

        <div className="bg-neutral-800 rounded-xl p-4 mb-6 border border-neutral-700">
          <h3 className="text-xl font-semibold text-white mb-2">{party.title}</h3>
          <div className="flex items-center gap-2 text-neutral-300">
            {party.is_date_fixed ? (
              <Calendar className="w-4 h-4 text-orange-400 flex-shrink-0" />
            ) : (
              <Clock className="w-4 h-4 text-orange-400 flex-shrink-0" />
            )}
            <span className="text-sm capitalize">{formatDate(party.fixed_date)}</span>
          </div>
        </div>

        {!confirmed && (
          <>
            <p className="text-neutral-400 text-center text-sm mb-6">
              {t('want_to_join')}
            </p>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-3 bg-neutral-800 text-neutral-300 rounded-xl hover:bg-neutral-700 transition font-medium border border-neutral-700"
              >
                {t('maybe')}
              </button>
              <button
                onClick={handleConfirm}
                disabled={confirming}
                className="flex-1 px-4 py-3 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl hover:from-orange-600 hover:to-orange-700 transition font-semibold disabled:opacity-50"
              >
                {confirming ? t('joining') : t('join')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
