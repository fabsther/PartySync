import { useEffect, useRef, useState } from 'react';
import { Trash2, Send, BarChart2, Plus, X, Bell } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { sendRemoteNotification } from '../../lib/remoteNotify';
import { PollCard, type PollData } from './PollCard';

interface Post {
  id: string;
  content: string;
  created_at: string;
  user_id: string;
  profiles: {
    full_name: string | null;
    email: string;
    avatar_url: string | null;
  };
}

interface MentionableUser {
  id: string;
  displayName: string;
  avatar_url: string | null;
}

const EVERYONE_ID = '__everyone__';
const EVERYONE_USER: MentionableUser = { id: EVERYONE_ID, displayName: 'everyone', avatar_url: null };

interface PostsProps {
  partyId: string;
  creatorId: string;
  partyTitle?: string;
  highlightPostId?: string;
}

const EMPTY_POLL_DRAFT = () => ({ question: '', options: ['', ''], deadline: '' });

export function Posts({ partyId, creatorId, partyTitle, highlightPostId }: PostsProps) {
  // ── posts ──────────────────────────────────────────────────────────────
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [newPost, setNewPost] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionableUsers, setMentionableUsers] = useState<MentionableUser[]>([]);
  const [mentionedUsers, setMentionedUsers] = useState<Map<string, string>>(new Map());
  const [confirmDeletePostId, setConfirmDeletePostId] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ── polls ──────────────────────────────────────────────────────────────
  const [polls, setPolls] = useState<PollData[]>([]);
  const [showCreatePoll, setShowCreatePoll] = useState(false);
  const [pollDraft, setPollDraft] = useState(EMPTY_POLL_DRAFT());
  const [creatingPoll, setCreatingPoll] = useState(false);
  // notify modal after poll creation
  const [showPollCreatedNotify, setShowPollCreatedNotify] = useState(false);
  const [pollCreatedMsg, setPollCreatedMsg] = useState('');
  const [pendingPollId, setPendingPollId] = useState<string | null>(null);
  const [notifyingPoll, setNotifyingPoll] = useState(false);

  const { user } = useAuth();
  const isCreator = user?.id === creatorId;

  // ── realtime + initial load ────────────────────────────────────────────
  useEffect(() => {
    loadPosts();
    loadPolls();

    const channel = supabase
      .channel(`party-feed-${partyId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'party_posts', filter: `party_id=eq.${partyId}`,
      }, loadPosts)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'party_polls', filter: `party_id=eq.${partyId}`,
      }, loadPolls)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [partyId]);

  // ── mentionable users ──────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      const [{ data: guests }, { data: creatorProfile }] = await Promise.all([
        supabase.from('party_guests').select('user_id, profiles(full_name, email, avatar_url)').eq('party_id', partyId).eq('status', 'confirmed'),
        supabase.from('profiles').select('id, full_name, email, avatar_url').eq('id', creatorId).single(),
      ]);
      const users: MentionableUser[] = [];
      const seen = new Set<string>();
      if (creatorProfile) {
        const p = creatorProfile as any;
        users.push({ id: p.id, displayName: p.full_name || p.email || 'Organisateur', avatar_url: p.avatar_url });
        seen.add(p.id);
      }
      (guests || []).forEach((g: any) => {
        if (seen.has(g.user_id)) return;
        const p = g.profiles as any;
        users.push({ id: g.user_id, displayName: p?.full_name || p?.email || 'Invité', avatar_url: p?.avatar_url || null });
        seen.add(g.user_id);
      });
      setMentionableUsers([EVERYONE_USER, ...users]);
    };
    load();
  }, [partyId, creatorId]);

  // ── deep-link highlight ────────────────────────────────────────────────
  useEffect(() => {
    if (!highlightPostId || posts.length === 0) return;
    const el = document.getElementById(`post-${highlightPostId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('ring-2', 'ring-orange-400');
    setTimeout(() => el.classList.remove('ring-2', 'ring-orange-400'), 3000);
  }, [highlightPostId, posts]);

  // ── loaders ────────────────────────────────────────────────────────────
  const loadPosts = async () => {
    const { data, error } = await supabase
      .from('party_posts')
      .select('id, content, created_at, user_id, profiles(full_name, email, avatar_url)')
      .eq('party_id', partyId)
      .order('created_at', { ascending: true });
    if (!error) setPosts((data as any) || []);
    setLoading(false);
  };

  const loadPolls = async () => {
    const { data } = await supabase
      .from('party_polls')
      .select('id, party_id, user_id, question, options, deadline, created_at, profiles(full_name, email)')
      .eq('party_id', partyId)
      .order('created_at', { ascending: true });
    setPolls((data as any) || []);
  };

  // ── post handlers ──────────────────────────────────────────────────────
  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setNewPost(value);
    const cursor = e.target.selectionStart;
    const beforeCursor = value.slice(0, cursor);
    const lastAt = beforeCursor.lastIndexOf('@');
    if (lastAt !== -1) {
      const query = beforeCursor.slice(lastAt + 1);
      if (!query.includes(' ') && !query.includes('\n')) { setMentionQuery(query.toLowerCase()); return; }
    }
    setMentionQuery(null);
  };

  const insertMention = (u: MentionableUser) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const cursor = textarea.selectionStart;
    const beforeCursor = newPost.slice(0, cursor);
    const lastAt = beforeCursor.lastIndexOf('@');
    const after = newPost.slice(cursor);
    const newContent = newPost.slice(0, lastAt) + `@[${u.displayName}] ` + after;
    setNewPost(newContent);
    setMentionedUsers(prev => new Map(prev).set(u.id, u.displayName));
    setMentionQuery(null);
    textarea.focus();
  };

  const submitPost = async () => {
    if (!newPost.trim() || !user) return;
    setSubmitting(true);
    try {
      const content = newPost.trim();
      const hasEveryone = mentionedUsers.has(EVERYONE_ID);
      const mentionedIds = [...mentionedUsers.keys()].filter(id => id !== EVERYONE_ID);

      const { data: insertedPost } = await supabase
        .from('party_posts')
        .insert({ party_id: partyId, user_id: user.id, content, mentions: mentionedIds })
        .select('id').single();

      setNewPost('');
      setMentionedUsers(new Map());
      setMentionQuery(null);

      const posterName = (user as any).user_metadata?.full_name || user.email?.split('@')[0] || 'Quelqu\'un';

      const { data: confirmedGuests } = await supabase
        .from('party_guests').select('user_id')
        .eq('party_id', partyId).eq('status', 'confirmed').neq('user_id', user.id);

      const recipientIds = new Set<string>();
      (confirmedGuests || []).forEach(g => recipientIds.add(g.user_id));
      if (creatorId !== user.id) recipientIds.add(creatorId);

      const notifTitle = hasEveryone
        ? (partyTitle ? `📣 @everyone — ${partyTitle}` : '📣 @everyone — Nouveau post')
        : (partyTitle ? `Nouveau post — ${partyTitle}` : 'Nouveau post sur la soirée');

      const postId = insertedPost?.id;
      await Promise.allSettled([...recipientIds].map(uid =>
        sendRemoteNotification(uid, notifTitle,
          `${posterName} : ${content.length > 80 ? content.slice(0, 80) + '...' : content}`,
          { partyId, action: 'party_post', ...(postId ? { postId } : {}) },
          `/party/${partyId}?tab=posts`
        )
      ));

      if (insertedPost) {
        await Promise.allSettled(
          mentionedIds.filter(id => id !== user.id && !recipientIds.has(id)).map(uid =>
            sendRemoteNotification(uid, `📌 ${posterName} t'a mentionné`,
              `${posterName} : ${content.slice(0, 80)}`,
              { partyId, action: 'post_mention', postId: insertedPost.id },
              `/?partyId=${partyId}&postId=${insertedPost.id}`
            )
          )
        );
      }
    } catch (e) {
      console.error('Error posting:', e);
    } finally {
      setSubmitting(false);
    }
  };

  const deletePost = async (postId: string) => {
    await supabase.from('party_posts').delete().eq('id', postId);
    setPosts(prev => prev.filter(p => p.id !== postId));
    setConfirmDeletePostId(null);
  };

  // ── poll handlers ──────────────────────────────────────────────────────
  const addPollOption = () => {
    if (pollDraft.options.length >= 9) return;
    setPollDraft(d => ({ ...d, options: [...d.options, ''] }));
  };

  const removePollOption = (i: number) => {
    if (pollDraft.options.length <= 2) return;
    setPollDraft(d => ({ ...d, options: d.options.filter((_, idx) => idx !== i) }));
  };

  const setPollOption = (i: number, value: string) => {
    setPollDraft(d => { const opts = [...d.options]; opts[i] = value; return { ...d, options: opts }; });
  };

  const createPoll = async () => {
    if (!user) return;
    const validOptions = pollDraft.options.filter(o => o.trim());
    if (validOptions.length < 2 || !pollDraft.question.trim()) return;
    setCreatingPoll(true);
    try {
      const { data: inserted } = await supabase
        .from('party_polls')
        .insert({
          party_id: partyId,
          user_id: user.id,
          question: pollDraft.question.trim(),
          options: validOptions,
          deadline: pollDraft.deadline ? new Date(pollDraft.deadline).toISOString() : null,
        })
        .select('id').single();

      setPendingPollId(inserted?.id || null);
      setShowCreatePoll(false);
      setPollDraft(EMPTY_POLL_DRAFT());
      await loadPolls();

      const defaultMsg = `📊 Nouveau sondage : "${pollDraft.question.trim()}" — donne ton avis !`;
      setPollCreatedMsg(defaultMsg);
      setShowPollCreatedNotify(true);
    } finally {
      setCreatingPoll(false);
    }
  };

  const sendPollCreatedNotification = async () => {
    if (!user || !pendingPollId) return;
    setNotifyingPoll(true);
    try {
      const { data: guests } = await supabase
        .from('party_guests').select('user_id')
        .eq('party_id', partyId).neq('user_id', user.id);
      await Promise.allSettled((guests || []).map(g =>
        sendRemoteNotification(g.user_id,
          `📊 ${partyTitle ? partyTitle + ' — ' : ''}Nouveau sondage`,
          pollCreatedMsg,
          { partyId, pollId: pendingPollId, action: 'new_poll' },
          `/party/${partyId}?tab=posts`
        )
      ));
    } finally {
      setNotifyingPoll(false);
      setShowPollCreatedNotify(false);
    }
  };

  // ── helpers ────────────────────────────────────────────────────────────
  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const diff = Date.now() - date.getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (mins < 1) return "à l'instant";
    if (mins < 60) return `il y a ${mins} min`;
    if (hours < 24) return `il y a ${hours}h`;
    if (days < 7) return `il y a ${days}j`;
    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  };

  const renderContent = (text: string) => {
    const parts = text.split(/(@\[[^\]]+\])/g);
    return parts.map((part, i) => {
      if (!part.match(/^@\[/)) return <span key={i}>{part}</span>;
      if (part === '@[everyone]') return <span key={i} className="text-violet-400 font-semibold">{part}</span>;
      return <span key={i} className="text-orange-400 font-medium">{part}</span>;
    });
  };

  const filteredMentions = mentionQuery !== null
    ? mentionableUsers.filter(u => u.displayName.toLowerCase().includes(mentionQuery!))
    : [];

  // ── combined feed ──────────────────────────────────────────────────────
  type FeedItem =
    | { kind: 'post'; data: Post }
    | { kind: 'poll'; data: PollData };

  const feedItems: FeedItem[] = [
    ...posts.map(p => ({ kind: 'post' as const, data: p })),
    ...polls.map(p => ({ kind: 'poll' as const, data: p })),
  ].sort((a, b) => new Date(a.data.created_at).getTime() - new Date(b.data.created_at).getTime());

  const pollDraftValid = pollDraft.question.trim() && pollDraft.options.filter(o => o.trim()).length >= 2;

  if (loading) return <div className="text-center text-neutral-400 py-8">Chargement...</div>;

  return (
    <div className="space-y-4">

      {/* ── Composer ── */}
      <div className="bg-neutral-800 rounded-xl p-4">
        <div className="relative">
          <textarea
            ref={textareaRef}
            value={newPost}
            onChange={handleContentChange}
            placeholder="Ecris quelque chose... (@mention pour notifier quelqu'un)"
            rows={3}
            maxLength={1000}
            className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-white placeholder-neutral-500 focus:outline-none focus:border-orange-500 resize-none text-sm"
            onKeyDown={e => {
              if (e.key === 'Escape') { setMentionQuery(null); return; }
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submitPost(); }
            }}
          />
          {mentionQuery !== null && filteredMentions.length > 0 && (
            <div className="absolute bottom-full mb-1 left-0 right-0 bg-neutral-800 border border-neutral-700 rounded-xl overflow-hidden z-20 shadow-xl max-h-48 overflow-y-auto">
              {filteredMentions.map(u => (
                <button
                  key={u.id}
                  onMouseDown={e => { e.preventDefault(); insertMention(u); }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-700 transition text-left"
                >
                  {u.id === EVERYONE_ID ? (
                    <div className="w-7 h-7 bg-gradient-to-br from-violet-500 to-violet-700 rounded-full flex items-center justify-center text-base flex-shrink-0">📣</div>
                  ) : u.avatar_url ? (
                    <img src={u.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-7 h-7 bg-gradient-to-br from-orange-500 to-orange-600 rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
                      {u.displayName[0].toUpperCase()}
                    </div>
                  )}
                  <span className={u.id === EVERYONE_ID ? 'text-violet-300 font-semibold text-sm' : 'text-white text-sm'}>
                    @{u.displayName}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex justify-between items-center mt-2 gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-600">{newPost.length}/1000</span>
            <button
              onClick={() => setShowCreatePoll(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-700 hover:bg-neutral-600 text-neutral-300 hover:text-white rounded-lg text-xs font-medium transition"
            >
              <BarChart2 className="w-3.5 h-3.5" />
              Sondage
            </button>
          </div>
          <button
            onClick={submitPost}
            disabled={!newPost.trim() || submitting}
            className="flex items-center gap-2 px-4 py-1.5 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium transition disabled:opacity-40"
          >
            <Send className="w-3.5 h-3.5" />
            {submitting ? 'Envoi...' : 'Publier'}
          </button>
        </div>
      </div>

      {/* ── Combined feed ── */}
      {feedItems.length === 0 ? (
        <div className="text-center text-neutral-500 py-12">
          <p className="text-lg mb-1">Aucun post pour le moment</p>
          <p className="text-sm">Sois le premier à poster !</p>
        </div>
      ) : (
        <div className="space-y-3">
          {feedItems.map(item => {
            if (item.kind === 'poll') {
              return (
                <PollCard
                  key={`poll-${item.data.id}`}
                  poll={item.data}
                  partyTitle={partyTitle || ''}
                  partyCreatorId={creatorId}
                  onDelete={id => setPolls(prev => prev.filter(p => p.id !== id))}
                />
              );
            }
            const post = item.data;
            const canDelete = user?.id === post.user_id || isCreator;
            const name = post.profiles.full_name || post.profiles.email;
            return (
              <div
                key={`post-${post.id}`}
                id={`post-${post.id}`}
                className="bg-neutral-800 rounded-xl p-4 transition-all duration-300"
              >
                <div className="flex items-start gap-3">
                  {post.profiles.avatar_url ? (
                    <img src={post.profiles.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-9 h-9 bg-gradient-to-br from-orange-500 to-orange-600 rounded-full flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">
                      {name[0].toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="text-white font-semibold text-sm">{name}</span>
                        <span className="text-neutral-500 text-xs">{formatTime(post.created_at)}</span>
                      </div>
                      {canDelete && (
                        <button
                          onClick={() => setConfirmDeletePostId(post.id)}
                          className="flex-shrink-0 p-1.5 text-neutral-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    <p className="text-neutral-200 text-sm mt-1 whitespace-pre-wrap break-words">
                      {renderContent(post.content)}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Poll creation modal ── */}
      {showCreatePoll && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <BarChart2 className="w-5 h-5 text-orange-400" />
                Créer un sondage
              </h3>
              <button onClick={() => setShowCreatePoll(false)} className="p-1.5 text-neutral-500 hover:text-white hover:bg-neutral-800 rounded-lg transition">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Question */}
              <div>
                <label className="block text-sm font-medium text-neutral-400 mb-1.5">Question</label>
                <input
                  type="text"
                  value={pollDraft.question}
                  onChange={e => setPollDraft(d => ({ ...d, question: e.target.value }))}
                  placeholder="Ex : Quel soir vous convient le mieux ?"
                  maxLength={200}
                  className="w-full px-3 py-2.5 bg-neutral-800 border border-neutral-700 rounded-xl text-white placeholder-neutral-500 focus:outline-none focus:border-orange-500 text-sm"
                />
              </div>

              {/* Options */}
              <div>
                <label className="block text-sm font-medium text-neutral-400 mb-2">
                  Options <span className="text-neutral-600 font-normal">({pollDraft.options.length}/9)</span>
                </label>
                <div className="space-y-2">
                  {pollDraft.options.map((opt, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-sm text-neutral-600 w-5 flex-shrink-0 text-center">{i + 1}</span>
                      <input
                        type="text"
                        value={opt}
                        onChange={e => setPollOption(i, e.target.value)}
                        placeholder={`Option ${i + 1}`}
                        maxLength={100}
                        className="flex-1 px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-xl text-white placeholder-neutral-500 focus:outline-none focus:border-orange-500 text-sm"
                      />
                      {pollDraft.options.length > 2 && (
                        <button
                          onClick={() => removePollOption(i)}
                          className="p-1.5 text-neutral-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition flex-shrink-0"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {pollDraft.options.length < 9 && (
                  <button
                    onClick={addPollOption}
                    className="mt-2 flex items-center gap-1.5 text-sm text-orange-400 hover:text-orange-300 transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Ajouter une option
                  </button>
                )}
              </div>

              {/* Deadline */}
              <div>
                <label className="block text-sm font-medium text-neutral-400 mb-1.5">
                  Date limite <span className="text-neutral-600 font-normal">(optionnel)</span>
                </label>
                <input
                  type="datetime-local"
                  value={pollDraft.deadline}
                  onChange={e => setPollDraft(d => ({ ...d, deadline: e.target.value }))}
                  className="w-full px-3 py-2.5 bg-neutral-800 border border-neutral-700 rounded-xl text-white focus:outline-none focus:border-orange-500 text-sm"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowCreatePoll(false)}
                className="flex-1 px-4 py-2.5 bg-neutral-800 text-white rounded-xl hover:bg-neutral-700 transition text-sm font-medium"
              >
                Annuler
              </button>
              <button
                onClick={createPoll}
                disabled={!pollDraftValid || creatingPoll}
                className="flex-1 px-4 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl transition text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-40"
              >
                {creatingPoll
                  ? <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /><span>Création…</span></>
                  : <><BarChart2 className="w-4 h-4" /><span>Créer le sondage</span></>
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Notify after poll creation ── */}
      {showPollCreatedNotify && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-1">
              <Bell className="w-5 h-5 inline mr-2 text-orange-400" />
              Notifier les invités ?
            </h3>
            <p className="text-neutral-500 text-sm mb-4">
              Envoie une notification pour les inviter à voter sur le sondage.
            </p>
            <textarea
              value={pollCreatedMsg}
              onChange={e => setPollCreatedMsg(e.target.value)}
              rows={3}
              maxLength={200}
              className="w-full px-3 py-2.5 bg-neutral-800 border border-neutral-700 rounded-xl text-white text-sm resize-none focus:outline-none focus:border-orange-500 mb-4"
            />
            <div className="flex gap-3">
              <button
                onClick={() => setShowPollCreatedNotify(false)}
                disabled={notifyingPoll}
                className="flex-1 px-4 py-2.5 bg-neutral-800 text-white rounded-xl hover:bg-neutral-700 transition text-sm font-medium disabled:opacity-50"
              >
                Ignorer
              </button>
              <button
                onClick={sendPollCreatedNotification}
                disabled={notifyingPoll || !pollCreatedMsg.trim()}
                className="flex-1 px-4 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl transition text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {notifyingPoll
                  ? <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /><span>Envoi…</span></>
                  : <><Bell className="w-4 h-4" /><span>Notifier tous</span></>
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete post confirmation ── */}
      {confirmDeletePostId && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-neutral-800 rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-2xl">
            <h3 className="text-white font-semibold text-lg">Supprimer ce post ?</h3>
            <p className="text-neutral-400 text-sm">Ce post sera définitivement supprimé.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDeletePostId(null)}
                className="flex-1 px-4 py-2 bg-neutral-700 hover:bg-neutral-600 text-white rounded-xl text-sm font-medium transition"
              >
                Annuler
              </button>
              <button
                onClick={() => deletePost(confirmDeletePostId)}
                className="flex-1 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-xl text-sm font-medium transition"
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
