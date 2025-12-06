import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { sendLocalNotification } from '../lib/notifications';

export type AppNotification = {
  id: string;
  user_id: string;
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

    console.log('[Realtime] Setting up subscription for user:', userId);
    
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications' },
        (payload) => {
          console.log('[Realtime] Received payload:', payload);
          const n = payload.new as AppNotification;
          
          // Filtrer côté client pour ne garder que les notifications de l'utilisateur
          if (n.user_id !== userId) {
            console.log('[Realtime] Ignoring notification for other user');
            return;
          }
          
          console.log('[Realtime] Adding notification:', n);
          setItems(prev => [n, ...prev]); // prepend
          
          // Afficher une notification système si l'app n'est pas au premier plan
          if (document.hidden) {
            sendLocalNotification(n.title, n.message, n.metadata);
          }
        }
      )
      .subscribe((status, err) => {
        console.log('[Realtime] Subscription status:', status, err || '');
      });

    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  return { items, unreadCount, loading, hasMore, fetchPage, markAsRead, markAllAsRead };
}
