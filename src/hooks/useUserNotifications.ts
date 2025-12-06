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
      .select('id, user_id, title, message, metadata, read, created_at')
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
      .channel(`notifications-${userId}-${Date.now()}`)
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
          setItems(prev => {
            // Éviter les doublons
            if (prev.some(p => p.id === n.id)) return prev;
            return [n, ...prev];
          });
          
          // Afficher une notification système si l'app n'est pas au premier plan
          if (document.hidden) {
            sendLocalNotification(n.title, n.message, n.metadata);
          }
        }
      )
      .subscribe((status, err) => {
        console.log('[Realtime] Subscription status:', status, err || '');
      });

    // Polling de secours toutes les 10 secondes
    const pollInterval = setInterval(async () => {
      const { data } = await supabase
        .from('notifications')
        .select('id, user_id, title, message, metadata, read, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(5);
      
      if (data && data.length > 0) {
        setItems(prev => {
          const newItems = data.filter((n: any) => !prev.some(p => p.id === n.id));
          if (newItems.length > 0) {
            console.log('[Polling] Found new notifications:', newItems.length);
            // Notification système pour les nouvelles
            if (document.hidden && newItems.length > 0) {
              const latest = newItems[0] as AppNotification;
              sendLocalNotification(latest.title, latest.message, latest.metadata);
            }
            return [...newItems, ...prev] as AppNotification[];
          }
          return prev;
        });
      }
    }, 10000);

    return () => { 
      supabase.removeChannel(channel);
      clearInterval(pollInterval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  return { items, unreadCount, loading, hasMore, fetchPage, markAsRead, markAllAsRead };
}
