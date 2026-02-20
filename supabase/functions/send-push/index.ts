// Deno Edge Function: envoie du Web Push aux abonnements d'un user
// Utilise npm:web-push avec la compatibilité npm native de Deno
import { serve } from 'https://deno.land/std@0.203.0/http/server.ts';
import webpush from 'npm:web-push@3.6.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, authorization, apikey',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC');
    const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
      return new Response(
        JSON.stringify({ error: 'Missing VAPID secrets' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    webpush.setVapidDetails('mailto:admin@partysync.app', VAPID_PUBLIC, VAPID_PRIVATE);

    const { userId, title, body, url } = await req.json();

    if (!userId || !title) {
      return new Response(
        JSON.stringify({ error: 'Missing userId or title' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const dbHeaders = {
      apikey: SUPABASE_SERVICE_ROLE_KEY!,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    };

    // Récupère les abonnements push du user
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/push_subscriptions?user_id=eq.${userId}&select=endpoint,p256dh,auth`,
      { headers: dbHeaders }
    );

    if (!resp.ok) {
      return new Response(await resp.text(), { status: resp.status, headers: corsHeaders });
    }

    const subs = await resp.json() as Array<{ endpoint: string; p256dh: string; auth: string }>;

    if (subs.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, sent: 0, reason: 'no subscriptions' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const payload = JSON.stringify({ title, body, url });

    const results = await Promise.allSettled(
      subs.map((s) =>
        webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } } as any,
          payload
        )
      )
    );

    // Nettoyer les endpoints expirés (410 Gone ou 404 Not Found)
    const staleEndpoints: string[] = [];
    results.forEach((result, i) => {
      if (result.status === 'rejected') {
        const err = result.reason as any;
        const status = err?.statusCode ?? err?.status;
        if (status === 410 || status === 404) {
          staleEndpoints.push(subs[i].endpoint);
          console.log(`[send-push] Stale subscription (${status})`);
        } else {
          console.warn('[send-push] Send failed:', err?.message || err);
        }
      }
    });

    if (staleEndpoints.length > 0) {
      for (const endpoint of staleEndpoints) {
        await fetch(
          `${SUPABASE_URL}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`,
          { method: 'DELETE', headers: dbHeaders }
        ).catch((e) => console.warn('[send-push] Delete stale error:', e));
      }
      console.log(`[send-push] Removed ${staleEndpoints.length} stale subscription(s)`);
    }

    const sent = results.filter((r) => r.status === 'fulfilled').length;

    return new Response(
      JSON.stringify({ ok: true, sent, total: subs.length, staleRemoved: staleEndpoints.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    console.error('[send-push] Error:', e);
    return new Response(
      JSON.stringify({ error: (e as Error)?.message || String(e) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
