import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

export type AppNotification = {
  id: string;
  title: string;
  message: string;
  metadata: any;
  created_at: string;
  read: boolean;
};

export function useUserNotifications(userId?: string) {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const unreadCount = useMemo(() => items.filter(n => !n.read).length, [items]);

  const fetchPage = async (opts?: { after?: string }) => {
    if (!userId || loading) return;
    setLoading(true);
    const query = supabase
      .from('notifications')
      .select('id, title, message, metadata, read, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(15);

    if (opts?.after) {
      // pagination naïve : récupère plus anciens que “after”
      query.lt('created_at', opts.after);
    }
    const { data, error } = await query;
    if (!error) {
      setItems(prev => (opts?.after ? [...prev, ...(data as any)] : (data as any)));
      setHasMore((data?.length ?? 0) === 15);
    } else {
      console.error('notifications fetch error', error);
    }
    setLoading(false);
  };

  const markAsRead = async (id: string) => {
    const { error } = await supabase.from('notifications').update({ read: true }).eq('id', id);
    if (error) {
      console.error('notifications mark read error', error);
      return;
    }
    setItems(prev => prev.map(n => (n.id === id ? { ...n, read: true } : n)));
  };

  const markAllAsRead = async () => {
    const ids = items.filter(n => !n.read).map(n => n.id);
    if (!ids.length) return;
    const { error } = await supabase.from('notifications').update({ read: true }).in('id', ids);
    if (error) {
      console.error('notifications mark all read error', error);
      return;
    }
    setItems(prev => prev.map(n => ({ ...n, read: true })));
  };

  useEffect(() => {
    if (!userId) return;
    fetchPage();

    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        (payload) => {
          const n = payload.new as any;
          setItems(prev => [n, ...prev]); // prepend
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  return { items, unreadCount, loading, hasMore, fetchPage, markAsRead, markAllAsRead };
}
