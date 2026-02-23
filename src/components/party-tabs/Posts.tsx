import { useEffect, useState } from 'react';
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

interface PostsProps {
  partyId: string;
  creatorId: string;
  partyTitle?: string;
}

export function Posts({ partyId, creatorId, partyTitle }: PostsProps) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [newPost, setNewPost] = useState('');
  const [submitting, setSubmitting] = useState(false);
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

  const loadPosts = async () => {
    const { data, error } = await supabase
      .from('party_posts')
      .select('id, content, created_at, user_id, profiles(full_name, email, avatar_url)')
      .eq('party_id', partyId)
      .order('created_at', { ascending: true });

    if (!error) setPosts((data as any) || []);
    setLoading(false);
  };

  const submitPost = async () => {
    if (!newPost.trim() || !user) return;
    setSubmitting(true);
    try {
      const content = newPost.trim();

      await supabase.from('party_posts').insert({
        party_id: partyId,
        user_id: user.id,
        content,
      });

      setNewPost('');

      // Notify all confirmed guests (except the poster)
      const { data: confirmedGuests } = await supabase
        .from('party_guests')
        .select('user_id')
        .eq('party_id', partyId)
        .eq('status', 'confirmed')
        .neq('user_id', user.id);

      // Also notify creator if they didn't post
      const recipientIds = new Set<string>();
      (confirmedGuests || []).forEach((g) => recipientIds.add(g.user_id));
      if (creatorId !== user.id) recipientIds.add(creatorId);

      const posterName =
        (user as any).user_metadata?.full_name ||
        user.email?.split('@')[0] ||
        'Quelqu\'un';

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

  if (loading) return <div className="text-center text-neutral-400 py-8">Chargement...</div>;

  return (
    <div className="space-y-4">
      {/* Composer */}
      <div className="bg-neutral-800 rounded-xl p-4">
        <textarea
          value={newPost}
          onChange={(e) => setNewPost(e.target.value)}
          placeholder="Ecris quelque chose..."
          rows={3}
          maxLength={1000}
          className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-white placeholder-neutral-500 focus:outline-none focus:border-orange-500 resize-none text-sm"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submitPost();
            }
          }}
        />
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
              <div key={post.id} className="bg-neutral-800 rounded-xl p-4">
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
                      {post.content}
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
