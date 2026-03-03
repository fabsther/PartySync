import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { sendRemoteNotification } from '../../lib/remoteNotify';

interface DateVotingProps {
  partyId: string;
  partyTitle: string;
  dateOptions: string[];   // ISO date strings
  voteDeadline: string;    // ISO date string
  onVoteResolved: (winningDate: string) => void;
}

export function DateVoting({ partyId, partyTitle, dateOptions, voteDeadline, onVoteResolved }: DateVotingProps) {
  const { t, i18n } = useTranslation('party');
  const { user } = useAuth();
  const [votes, setVotes] = useState<{ user_id: string; option_index: number }[]>([]);
  const [myVote, setMyVote] = useState<number | null>(null);
  const [guestCount, setGuestCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [voting, setVoting] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  const [timeLeft, setTimeLeft] = useState('');
  const resolvingRef = useRef(false);

  const deadlineDate = new Date(voteDeadline);
  const isDeadlinePassed = deadlineDate <= new Date();

  const locale = i18n.resolvedLanguage ?? 'fr';

  const formatTimeLeft = (): string => {
    const diff = deadlineDate.getTime() - Date.now();
    if (diff <= 0) return t('vote_closed');
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    if (days > 0) return t('time_dhm', { days, hours, mins });
    if (hours > 0) return t('time_hm', { hours, mins });
    return t('time_m', { mins });
  };

  const formatDateOption = (iso: string): string => {
    const d = new Date(iso);
    const day = d.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });
    const time = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
    return `${day[0].toUpperCase()}${day.slice(1)} · ${time}`;
  };

  // Load votes + guest count
  const loadVotes = async () => {
    const [{ data: voteData }, { count }] = await Promise.all([
      supabase.from('party_date_votes').select('user_id, option_index').eq('party_id', partyId),
      supabase.from('party_guests').select('*', { count: 'exact', head: true }).eq('party_id', partyId),
    ]);
    setVotes(voteData || []);
    setGuestCount(count || 0);
    const mine = (voteData || []).find(v => v.user_id === user?.id);
    setMyVote(mine !== undefined ? mine.option_index : null);
    setLoading(false);
  };

  useEffect(() => {
    loadVotes();

    // Realtime + polling fallback
    const channel = supabase
      .channel(`date-votes-${partyId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'party_date_votes',
        filter: `party_id=eq.${partyId}`,
      }, loadVotes)
      .subscribe();
    const poll = setInterval(loadVotes, 30000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(poll);
    };
  }, [partyId]);

  // Timer countdown
  useEffect(() => {
    setTimeLeft(formatTimeLeft());
    if (isDeadlinePassed) return;
    const interval = setInterval(() => {
      const now = Date.now();
      setTimeLeft(formatTimeLeft());
      if (now >= deadlineDate.getTime() && !loading) resolveVoteIfNeeded();
    }, 30000);
    return () => clearInterval(interval);
  }, [voteDeadline, loading]);

  // Auto-collapse when user has voted
  useEffect(() => {
    if (myVote !== null) setIsExpanded(false);
  }, [myVote]);

  // Trigger resolution on load if deadline already passed
  useEffect(() => {
    if (!loading && isDeadlinePassed) resolveVoteIfNeeded();
  }, [loading]);

  const resolveVoteIfNeeded = async () => {
    if (resolvingRef.current || !user) return;
    resolvingRef.current = true;
    setResolving(true);
    try {
      // Load fresh votes to avoid stale closure
      const { data: freshVotes } = await supabase
        .from('party_date_votes')
        .select('user_id, option_index')
        .eq('party_id', partyId);

      const counts = dateOptions.map((_, i) => (freshVotes || []).filter(v => v.option_index === i).length);
      const maxCount = Math.max(...counts, 0);
      const winnerIndex = maxCount === 0 ? 0 : counts.indexOf(maxCount);
      const winnerDate = dateOptions[winnerIndex];

      // Atomic update — only runs if still is_date_fixed=false
      const { data: updated } = await supabase
        .from('parties')
        .update({ is_date_fixed: true, fixed_date: winnerDate })
        .eq('id', partyId)
        .eq('is_date_fixed', false)
        .select('id')
        .single();

      if (updated) {
        // We were first to resolve → notify all guests
        const { data: guests } = await supabase
          .from('party_guests')
          .select('user_id')
          .eq('party_id', partyId);

        const winnerLabel = formatDateOption(winnerDate);
        await Promise.allSettled(
          (guests || []).map(g =>
            sendRemoteNotification(
              g.user_id,
              t('vote_resolved_notif_title', { partyTitle }),
              t('vote_resolved_notif_body', { date: winnerLabel }),
              { partyId, action: 'vote_resolved' },
              `/party/${partyId}`
            )
          )
        );
        onVoteResolved(winnerDate);
      }
    } catch (e) {
      console.error('Error resolving vote:', e);
    } finally {
      resolvingRef.current = false;
      setResolving(false);
    }
  };

  const castVote = async (optionIndex: number) => {
    if (!user || voting || isDeadlinePassed) return;
    setVoting(true);
    try {
      await supabase
        .from('party_date_votes')
        .upsert(
          { party_id: partyId, user_id: user.id, option_index: optionIndex },
          { onConflict: 'party_id,user_id' }
        );
      await loadVotes();
    } finally {
      setVoting(false);
    }
  };

  if (loading) return null;

  const counts = dateOptions.map((_, i) => votes.filter(v => v.option_index === i).length);
  const totalVotes = votes.length;
  const maxCount = Math.max(...counts, 0);
  const showResults = myVote !== null || isDeadlinePassed;

  return (
    <div className="bg-neutral-800 rounded-xl overflow-hidden">
      {/* Header — always visible */}
      <button
        onClick={() => setIsExpanded(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-neutral-700/50 transition"
      >
        <div className="flex items-center gap-2">
          <span className="text-base">🗳️</span>
          <span className="text-white font-semibold text-sm">{t('vote_for_date')}</span>
          {myVote !== null && !isDeadlinePassed && (
            <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-xs rounded-full">{t('voted')}</span>
          )}
          {isDeadlinePassed && (
            <span className="px-2 py-0.5 bg-neutral-700 text-neutral-400 text-xs rounded-full">{t('vote_closed')}</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-xs font-medium tabular-nums ${isDeadlinePassed ? 'text-neutral-500' : 'text-orange-400'}`}>
            {isDeadlinePassed ? t('votes', { count: totalVotes }) : `⏱ ${timeLeft}`}
          </span>
          {isExpanded
            ? <ChevronUp className="w-4 h-4 text-neutral-400" />
            : <ChevronDown className="w-4 h-4 text-neutral-400" />}
        </div>
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 space-y-2.5">
          {/* Deadline info */}
          {!isDeadlinePassed ? (
            <p className="text-xs text-neutral-500 pb-1">
              {t('vote_open_until', { date: '' }).replace(' {{date}}', '')}{' '}
              <span className="text-neutral-400">
                {deadlineDate.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })}
                {' · '}
                {deadlineDate.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
              </span>
              {guestCount > 0 && (
                <span className="ml-2 text-neutral-600">· {t('participants_voted', { voted: totalVotes, total: guestCount })}</span>
              )}
            </p>
          ) : (
            <p className="text-xs text-neutral-500 pb-1">
              {t('vote_closed_count', { count: totalVotes })}
            </p>
          )}

          {/* Option cards */}
          {dateOptions.map((option, i) => {
            const count = counts[i];
            const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
            const isMyVote = myVote === i;
            const isWinner = isDeadlinePassed && count === maxCount && maxCount > 0;

            return (
              <button
                key={i}
                onClick={() => castVote(i)}
                disabled={voting || isDeadlinePassed}
                className={`w-full text-left rounded-xl border px-4 py-3 transition ${
                  isWinner
                    ? 'border-green-500/60 bg-green-500/10'
                    : isMyVote
                    ? 'border-orange-500/60 bg-orange-500/10'
                    : 'border-neutral-700 bg-neutral-900/60 hover:border-neutral-600'
                } ${isDeadlinePassed ? 'cursor-default' : 'cursor-pointer'}`}
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className={`text-sm font-medium capitalize ${isWinner ? 'text-green-300' : 'text-white'}`}>
                    {formatDateOption(option)}
                  </span>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {isWinner && <span className="text-green-400 text-xs font-semibold">🏆</span>}
                    {isMyVote && !isDeadlinePassed && <Check className="w-3.5 h-3.5 text-orange-400" />}
                    {showResults && (
                      <span className="text-xs text-neutral-400 tabular-nums">
                        {t('votes', { count })}
                      </span>
                    )}
                  </div>
                </div>

                {/* Vote bar — visible after voting or after deadline */}
                {showResults && (
                  <div className="h-1.5 bg-neutral-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${
                        isWinner ? 'bg-green-400' : isMyVote ? 'bg-orange-500' : 'bg-neutral-600'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                )}
              </button>
            );
          })}

          {/* Hints */}
          {!showResults && !isDeadlinePassed && (
            <p className="text-xs text-neutral-600 text-center pt-1">{t('click_to_vote')}</p>
          )}
          {myVote !== null && !isDeadlinePassed && (
            <p className="text-xs text-neutral-600 text-center pt-1">{t('change_vote_hint')}</p>
          )}

          {resolving && (
            <div className="flex items-center justify-center gap-2 py-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-orange-500" />
              <span className="text-xs text-neutral-400">{t('calculating')}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
