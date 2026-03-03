import { useEffect, useState } from 'react';
import { Trash2, Bell } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { sendRemoteNotification } from '../../lib/remoteNotify';

export interface PollData {
  id: string;
  party_id: string;
  user_id: string;
  question: string;
  options: string[];
  deadline: string | null;
  created_at: string;
  profiles: {
    full_name: string | null;
    email: string;
  };
}

interface PollCardProps {
  poll: PollData;
  partyTitle: string;
  partyCreatorId: string;
  onDelete: (pollId: string) => void;
}

export function PollCard({ poll, partyTitle, partyCreatorId, onDelete }: PollCardProps) {
  const { t } = useTranslation('activity');
  const { user } = useAuth();
  const [votes, setVotes] = useState<{ user_id: string; option_index: number }[]>([]);
  const [myVote, setMyVote] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [voting, setVoting] = useState(false);
  const [timeLeft, setTimeLeft] = useState('');
  const [showNotifyModal, setShowNotifyModal] = useState(false);
  const [notifyMessage, setNotifyMessage] = useState('');
  const [notifying, setNotifying] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const deadlineDate = poll.deadline ? new Date(poll.deadline) : null;
  const isDeadlinePassed = deadlineDate ? deadlineDate <= new Date() : false;
  const isPollCreator = user?.id === poll.user_id;
  const canDelete = user?.id === poll.user_id || user?.id === partyCreatorId;

  const formatTimeLeft = (deadline: Date): string => {
    const diff = deadline.getTime() - Date.now();
    if (diff <= 0) return t('finished');
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    if (days > 0) return `${days}j ${hours}h`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  };

  const formatTimeAgo = (dateString: string): string => {
    const diff = Date.now() - new Date(dateString).getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (mins < 1) return t('time_now');
    if (mins < 60) return t('time_min_ago_one', { count: mins });
    if (hours < 24) return t('time_hours_ago_one', { count: hours });
    return t('time_days_ago_one', { count: days });
  };

  const loadVotes = async () => {
    const { data } = await supabase
      .from('party_poll_votes')
      .select('user_id, option_index')
      .eq('poll_id', poll.id);
    setVotes(data || []);
    const mine = (data || []).find(v => v.user_id === user?.id);
    setMyVote(mine !== undefined ? mine.option_index : null);
    setLoading(false);
  };

  useEffect(() => {
    loadVotes();
    const channel = supabase
      .channel(`poll-${poll.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'party_poll_votes',
        filter: `poll_id=eq.${poll.id}`,
      }, loadVotes)
      .subscribe();
    const interval = setInterval(loadVotes, 30000);
    return () => { supabase.removeChannel(channel); clearInterval(interval); };
  }, [poll.id]);

  useEffect(() => {
    if (!deadlineDate) return;
    setTimeLeft(formatTimeLeft(deadlineDate));
    if (isDeadlinePassed) return;
    const timer = setInterval(() => setTimeLeft(formatTimeLeft(deadlineDate)), 30000);
    return () => clearInterval(timer);
  }, [poll.deadline]);

  const castVote = async (optionIndex: number) => {
    if (!user || voting || isDeadlinePassed) return;
    setVoting(true);
    try {
      await supabase
        .from('party_poll_votes')
        .upsert(
          { poll_id: poll.id, user_id: user.id, option_index: optionIndex },
          { onConflict: 'poll_id,user_id' }
        );
      await loadVotes();
    } finally {
      setVoting(false);
    }
  };

  const openResultsNotify = () => {
    const counts = poll.options.map((_, i) => votes.filter(v => v.option_index === i).length);
    const maxCount = Math.max(...counts, 0);
    const total = votes.length;
    let defaultMsg: string;
    if (maxCount === 0 || total === 0) {
      defaultMsg = t('poll_results_no_votes', { question: poll.question });
    } else {
      const winners = poll.options.filter((_, i) => counts[i] === maxCount);
      if (winners.length === 1) {
        defaultMsg = t('poll_results_winner', { count: maxCount, question: poll.question, winner: winners[0], total });
      } else {
        defaultMsg = t('poll_results_tie', { count: maxCount, question: poll.question, winners: winners.join('" et "') });
      }
    }
    setNotifyMessage(defaultMsg);
    setShowNotifyModal(true);
  };

  const sendResultsNotification = async () => {
    if (!user) return;
    setNotifying(true);
    try {
      const { data: guests } = await supabase
        .from('party_guests')
        .select('user_id')
        .eq('party_id', poll.party_id);
      await Promise.allSettled(
        (guests || []).map(g =>
          sendRemoteNotification(
            g.user_id,
            t('poll_results_notif_title', { partyTitle }),
            notifyMessage,
            { partyId: poll.party_id, pollId: poll.id, action: 'poll_results' },
            `/party/${poll.party_id}?tab=posts`
          )
        )
      );
    } finally {
      setNotifying(false);
      setShowNotifyModal(false);
    }
  };

  const deletePoll = async () => {
    await supabase.from('party_polls').delete().eq('id', poll.id);
    onDelete(poll.id);
    setConfirmDelete(false);
  };

  if (loading) return null;

  const counts = poll.options.map((_, i) => votes.filter(v => v.option_index === i).length);
  const totalVotes = votes.length;
  const maxCount = Math.max(...counts, 0);
  const showResults = myVote !== null || isDeadlinePassed;
  const authorName = poll.profiles.full_name || poll.profiles.email.split('@')[0];

  return (
    <>
      <div className="bg-neutral-800 rounded-xl p-4 border border-neutral-700/50">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="text-xs font-bold text-orange-400 uppercase tracking-wide">{t('poll_label')}</span>
              {deadlineDate && (
                <span className={`text-xs tabular-nums ${isDeadlinePassed ? 'text-neutral-600' : 'text-orange-400'}`}>
                  · {isDeadlinePassed ? t('finished') : `⏱ ${timeLeft}`}
                </span>
              )}
            </div>
            <p className="text-white font-semibold text-sm leading-snug">{poll.question}</p>
            <p className="text-neutral-500 text-xs mt-0.5">{authorName} · {formatTimeAgo(poll.created_at)}</p>
          </div>
          {canDelete && (
            <button
              onClick={() => setConfirmDelete(true)}
              className="p-1.5 text-neutral-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition flex-shrink-0 ml-2"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Options */}
        <div className="space-y-2 mb-3">
          {poll.options.map((option, i) => {
            const count = counts[i];
            const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
            const isMyChoice = myVote === i;
            const isWinner = isDeadlinePassed && count === maxCount && maxCount > 0;

            return (
              <button
                key={i}
                onClick={() => castVote(i)}
                disabled={voting || isDeadlinePassed}
                className={`w-full text-left rounded-xl border px-3 py-2.5 transition ${
                  isWinner
                    ? 'border-green-500/50 bg-green-500/10'
                    : isMyChoice
                    ? 'border-orange-500/50 bg-orange-500/10'
                    : 'border-neutral-700 bg-neutral-900/60 hover:border-neutral-600'
                } ${!isDeadlinePassed ? 'cursor-pointer' : 'cursor-default'}`}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className={`text-sm leading-snug ${
                    isWinner ? 'text-green-300 font-medium' : isMyChoice ? 'text-orange-300' : 'text-neutral-200'
                  }`}>
                    {isWinner && '🏆 '}{option}
                  </span>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {isMyChoice && !isDeadlinePassed && (
                      <span className="text-orange-400 text-xs">✓</span>
                    )}
                    {showResults && (
                      <span className="text-xs text-neutral-400 tabular-nums">
                        {count} · {pct}%
                      </span>
                    )}
                  </div>
                </div>
                {showResults && (
                  <div className="h-1 bg-neutral-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${
                        isWinner ? 'bg-green-400' : isMyChoice ? 'bg-orange-500' : 'bg-neutral-600'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-neutral-600">
            {t('votes', { count: totalVotes })}
            {!showResults && !isDeadlinePassed && ` · ${t('vote_to_see')}`}
            {myVote !== null && !isDeadlinePassed && ` · ${t('can_change_vote')}`}
          </span>
          {isPollCreator && isDeadlinePassed && (
            <button
              onClick={openResultsNotify}
              className="flex items-center gap-1.5 text-xs text-orange-400 hover:text-orange-300 transition px-2 py-1 rounded-lg hover:bg-orange-500/10"
            >
              <Bell className="w-3 h-3" />
              {t('announce_results')}
            </button>
          )}
        </div>
      </div>

      {/* Results notify modal */}
      {showNotifyModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-1">{t('announce_results_title')}</h3>
            <p className="text-neutral-500 text-sm mb-4">
              {t('announce_results_hint')}
            </p>
            <textarea
              value={notifyMessage}
              onChange={e => setNotifyMessage(e.target.value)}
              rows={4}
              maxLength={300}
              className="w-full px-3 py-2.5 bg-neutral-800 border border-neutral-700 rounded-xl text-white text-sm resize-none focus:outline-none focus:border-orange-500 mb-4"
            />
            <div className="flex gap-3">
              <button
                onClick={() => setShowNotifyModal(false)}
                disabled={notifying}
                className="flex-1 px-4 py-2.5 bg-neutral-800 text-white rounded-xl hover:bg-neutral-700 transition text-sm font-medium disabled:opacity-50"
              >
                {t('cancel', { ns: 'common' })}
              </button>
              <button
                onClick={sendResultsNotification}
                disabled={notifying || !notifyMessage.trim()}
                className="flex-1 px-4 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl transition text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {notifying
                  ? <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /><span>{t('notifying')}</span></>
                  : <><Bell className="w-4 h-4" /><span>{t('notify_all')}</span></>
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <h3 className="text-white font-semibold text-lg mb-2">{t('delete_poll')}</h3>
            <p className="text-neutral-400 text-sm mb-5">{t('delete_poll_hint')}</p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDelete(false)}
                className="flex-1 px-4 py-2 bg-neutral-700 hover:bg-neutral-600 text-white rounded-xl text-sm font-medium transition"
              >
                {t('cancel', { ns: 'common' })}
              </button>
              <button
                onClick={deletePoll}
                className="flex-1 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-xl text-sm font-medium transition"
              >
                {t('delete', { ns: 'common' })}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
