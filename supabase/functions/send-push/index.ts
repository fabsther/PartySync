// Deno Edge Function: envoie du Web Push aux abonnements d’un user
// deno.json dans le même dossier configure l’import de web-push
import { serve } from 'https://deno.land/std@0.203.0/http/server.ts';
import webpush from 'https://esm.sh/web-push@3';

const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC')!;
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

webpush.setVapidDetails('mailto:admin@example.com', VAPID_PUBLIC, VAPID_PRIVATE);

serve(async (req) => {
  try {
    const { userId, title, body, url } = await req.json();

    // Récupère les abonnements push du user (via service role)
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?user_id=eq.${userId}&select=endpoint,p256dh,auth`, {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });

    if (!resp.ok) return new Response(await resp.text(), { status: resp.status });

    const subs = await resp.json() as Array<{ endpoint: string; p256dh: string; auth: string }>;
    const payload = JSON.stringify({ title, body, url });

    const results = await Promise.allSettled(
      subs.map((s) => webpush.sendNotification({
        endpoint: s.endpoint,
        keys: { p256dh: s.p256dh, auth: s.auth }
      } as any, payload))
    );

    // Nettoyage des endpoints invalides (optionnel)
    // …

    return new Response(JSON.stringify({ ok: true, sent: results.length }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(`send-push error: ${e?.message || e}`, { status: 500 });
  }
});
