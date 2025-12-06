import { supabase } from './supabase';

/**
 * Envoie une notification DISTANTE à un utilisateur :
 * 1) insère une entrée dans `notifications` (historique + Realtime)
 * 2) déclenche l’Edge Function `/functions/v1/send-push` (Web Push hors app)
 *
 * @param userId   Destinataire (UUID)
 * @param title    Titre de la notif
 * @param body     Corps de la notif
 * @param metadata Données additionnelles (ex: { partyId, action, url })
 * @param deepLink URL à ouvrir au clic (ex: '/carsharing?partyId=...' )
 */
export async function sendRemoteNotification(
  userId: string,
  title: string,
  body: string,
  metadata: Record<string, any> = {},
  deepLink?: string
) {
  // 1) Persistance (historique + Realtime côté destinataire)
  const { error: insertErr } = await supabase.from('notifications').insert({
    user_id: userId,
    title,
    message: body,
    metadata, // ex: { partyId, action, offerId, ... }
  });
  if (insertErr) console.error('[remoteNotify] insert notifications error', insertErr);

  // 2) Web Push (Edge Function) - envoie les notifications natives
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (supabaseUrl) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(`${supabaseUrl}/functions/v1/send-push`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify({
          userId,
          title,
          body,
          url: deepLink,
        }),
      });
      if (!resp.ok) {
        console.debug('[remoteNotify] send-push response:', resp.status);
      }
    } catch (e) {
      console.debug('[remoteNotify] send-push error:', e);
    }
  }
}
