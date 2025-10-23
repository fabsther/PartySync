import { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { sendLocalNotification } from '../lib/notify';

export function useNotifications(userId?: string) {
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`
      }, (payload) => {
        const n: any = payload.new;
        sendLocalNotification(n.title, n.message, n.metadata);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId]);
}
