import { useEffect, useRef, useState } from 'react';
import { Trash2, Send } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { sendRemoteNotification } from '../../lib/remoteNotify';

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

interface PostsProps {
  partyId: string;
  creatorId: string;
  partyTitle?: string;
  highlightPostId?: string;
}

export function Posts({ partyId, creatorId, partyTitle, highlightPostId }: PostsProps) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [newPost, setNewPost] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionableUsers, setMentionableUsers] = useState<MentionableUser[]>([]);
  const [mentionedUsers, setMentionedUsers] = useState<Map<string, string>>(new Map());
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { user } = useAuth();
  const isCreator = user?.id === creatorId;

  useEffect(() => {
    loadPosts();

    const channel = supabase
      .channel(`party-posts-${partyId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'party_posts', filter: `party_id=eq.${partyId}` },
        () => loadPosts()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [partyId]);

  // Load mentionable users: confirmed guests + creator
  useEffect(() => {
    const loadMentionableUsers = async () => {
      const [{ data: guests }, { data: creatorProfile }] = await Promise.all([
        supabase
          .from('party_guests')
          .select('user_id, profiles(full_name, email, avatar_url)')
          .eq('party_id', partyId)
          .eq('status', 'confirmed'),
        supabase
          .from('profiles')
          .select('id, full_name, email, avatar_url')
          .eq('id', creatorId)
          .single(),
      ]);

      const users: MentionableUser[] = [];
      const seen = new Set<string>();

      if (creatorProfile) {
        const p = creatorProfile as any;
        const name = p.full_name || p.email || 'Organisateur';
        users.push({ id: p.id, displayName: name, avatar_url: p.avatar_url });
        seen.add(p.id);
      }

      (guests || []).forEach((g: any) => {
        if (seen.has(g.user_id)) return;
        const p = g.profiles as any;
        const name = p?.full_name || p?.email || 'Invité';
        users.push({ id: g.user_id, displayName: name, avatar_url: p?.avatar_url || null });
        seen.add(g.user_id);
      });

      setMentionableUsers(users);
    };

    loadMentionableUsers();
  }, [partyId, creatorId]);

  // Scroll to and highlight post on deep link
  useEffect(() => {
    if (!highlightPostId || posts.length === 0) return;
    const el = document.getElementById(`post-${highlightPostId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('ring-2', 'ring-orange-400');
    setTimeout(() => el.classList.remove('ring-2', 'ring-orange-400'), 3000);
  }, [highlightPostId, posts]);

  const loadPosts = async () => {
    const { data, error } = await supabase
      .from('party_posts')
      .select('id, content, created_at, user_id, profiles(full_name, email, avatar_url)')
      .eq('party_id', partyId)
      .order('created_at', { ascending: true });

    if (!error) setPosts((data as any) || []);
    setLoading(false);
  };

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setNewPost(value);

    const cursor = e.target.selectionStart;
    const beforeCursor = value.slice(0, cursor);
    const lastAt = beforeCursor.lastIndexOf('@');
    if (lastAt !== -1) {
      const query = beforeCursor.slice(lastAt + 1);
      if (!query.includes(' ') && !query.includes('\n')) {
        setMentionQuery(query.toLowerCase());
        return;
      }
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
    const mentionText = `@[${u.displayName}] `;
    const newContent = newPost.slice(0, lastAt) + mentionText + after;
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
      const mentionedIds = [...mentionedUsers.keys()];

      const { data: insertedPost } = await supabase
        .from('party_posts')
        .insert({
          party_id: partyId,
          user_id: user.id,
          content,
          mentions: mentionedIds,
        })
        .select('id')
        .single();

      setNewPost('');
      setMentionedUsers(new Map());
      setMentionQuery(null);

      const posterName =
        (user as any).user_metadata?.full_name ||
        user.email?.split('@')[0] ||
        'Quelqu\'un';

      // Notify all confirmed guests (except the poster)
      const { data: confirmedGuests } = await supabase
        .from('party_guests')
        .select('user_id')
        .eq('party_id', partyId)
        .eq('status', 'confirmed')
        .neq('user_id', user.id);

      const recipientIds = new Set<string>();
      (confirmedGuests || []).forEach((g) => recipientIds.add(g.user_id));
      if (creatorId !== user.id) recipientIds.add(creatorId);

      const notifTitle = partyTitle
        ? `Nouveau post — ${partyTitle}`
        : 'Nouveau post sur la soirée';

      await Promise.allSettled(
        [...recipientIds].map((uid) =>
          sendRemoteNotification(
            uid,
            notifTitle,
            `${posterName} : ${content.length > 80 ? content.slice(0, 80) + '...' : content}`,
            { partyId, action: 'party_post' },
            `/party/${partyId}?tab=posts`
          )
        )
      );

      // Notify mentioned users not already notified via the general post notification
      if (insertedPost) {
        await Promise.allSettled(
          mentionedIds
            .filter(id => id !== user.id && !recipientIds.has(id))
            .map(uid =>
              sendRemoteNotification(
                uid,
                `📌 ${posterName} t'a mentionné`,
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
    setPosts((prev) => prev.filter((p) => p.id !== postId));
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const diff = Date.now() - date.getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (mins < 1) return "a l'instant";
    if (mins < 60) return `il y a ${mins} min`;
    if (hours < 24) return `il y a ${hours}h`;
    if (days < 7) return `il y a ${days}j`;
    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  };

  const renderContent = (text: string) => {
    const parts = text.split(/(@\[[^\]]+\])/g);
    return parts.map((part, i) =>
      part.match(/^@\[/)
        ? <span key={i} className="text-orange-400 font-medium">{part}</span>
        : <span key={i}>{part}</span>
    );
  };

  const filteredMentions = mentionQuery !== null
    ? mentionableUsers.filter(u => u.displayName.toLowerCase().includes(mentionQuery!))
    : [];

  if (loading) return <div className="text-center text-neutral-400 py-8">Chargement...</div>;

  return (
    <div className="space-y-4">
      {/* Composer */}
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
            onKeyDown={(e) => {
              if (e.key === 'Escape') { setMentionQuery(null); return; }
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                submitPost();
              }
            }}
          />
          {mentionQuery !== null && filteredMentions.length > 0 && (
            <div className="absolute bottom-full mb-1 left-0 right-0 bg-neutral-800 border border-neutral-700 rounded-xl overflow-hidden z-20 shadow-xl max-h-48 overflow-y-auto">
              {filteredMentions.map(u => (
                <button
                  key={u.id}
                  onMouseDown={(e) => { e.preventDefault(); insertMention(u); }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-700 transition text-left"
                >
                  {u.avatar_url ? (
                    <img src={u.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-7 h-7 bg-gradient-to-br from-orange-500 to-orange-600 rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
                      {u.displayName[0].toUpperCase()}
                    </div>
                  )}
                  <span className="text-white text-sm">{u.displayName}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex justify-between items-center mt-2">
          <span className="text-xs text-neutral-600">{newPost.length}/1000</span>
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

      {/* Posts list */}
      {posts.length === 0 ? (
        <div className="text-center text-neutral-500 py-12">
          <p className="text-lg mb-1">Aucun post pour le moment</p>
          <p className="text-sm">Sois le premier a poster !</p>
        </div>
      ) : (
        <div className="space-y-3">
          {posts.map((post) => {
            const canDelete = user?.id === post.user_id || isCreator;
            const name = post.profiles.full_name || post.profiles.email;
            return (
              <div
                key={post.id}
                id={`post-${post.id}`}
                className="bg-neutral-800 rounded-xl p-4 transition-all duration-300"
              >
                <div className="flex items-start gap-3">
                  {post.profiles.avatar_url ? (
                    <img
                      src={post.profiles.avatar_url}
                      alt=""
                      className="w-9 h-9 rounded-full object-cover flex-shrink-0"
                    />
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
                          onClick={() => deletePost(post.id)}
                          className="flex-shrink-0 p-1.5 text-neutral-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition"
                          title="Supprimer"
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
    </div>
  );
}
