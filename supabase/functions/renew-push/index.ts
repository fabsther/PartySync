// Deno Edge Function: renouvellement de push subscription depuis le Service Worker
// Appelé par sw-push.js lors de l'événement `pushsubscriptionchange`
// Sécurité : l'ancien endpoint (long URL opaque) sert d'identifiant — seul
// le vrai SW de l'appareil le connaît.
import { serve } from 'https://deno.land/std@0.203.0/http/server.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, authorization, apikey',
};

const dbHeaders = {
  apikey: SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  'Content-Type': 'application/json',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { oldEndpoint, endpoint, p256dh, auth, ua } = await req.json();

    if (!endpoint || !p256dh || !auth) {
      return new Response('Missing subscription fields', { status: 400, headers: corsHeaders });
    }

    if (!oldEndpoint) {
      return new Response('Missing oldEndpoint', { status: 400, headers: corsHeaders });
    }

    // Retrouver le user_id via l'ancien endpoint
    const findResp = await fetch(
      `${SUPABASE_URL}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(oldEndpoint)}&select=user_id`,
      { headers: dbHeaders }
    );

    if (!findResp.ok) {
      return new Response(await findResp.text(), { status: findResp.status, headers: corsHeaders });
    }

    const rows = await findResp.json() as Array<{ user_id: string }>;

    if (rows.length === 0) {
      // Ancien endpoint introuvable : on ne peut pas identifier le user
      return new Response(
        JSON.stringify({ ok: false, reason: 'old endpoint not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = rows[0].user_id;

    // Supprimer l'ancienne subscription
    await fetch(
      `${SUPABASE_URL}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(oldEndpoint)}`,
      { method: 'DELETE', headers: dbHeaders }
    );

    // Insérer la nouvelle subscription
    const insertResp = await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions`, {
      method: 'POST',
      headers: { ...dbHeaders, Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({ user_id: userId, endpoint, p256dh, auth, ua: ua || '' }),
    });

    if (!insertResp.ok) {
      const err = await insertResp.text();
      console.error('[renew-push] Insert failed:', err);
      return new Response(err, { status: insertResp.status, headers: corsHeaders });
    }

    console.log(`[renew-push] Subscription renewed for user ${userId}`);

    return new Response(
      JSON.stringify({ ok: true, userId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    console.error('[renew-push] Error:', e);
    return new Response(`renew-push error: ${(e as Error)?.message || e}`, {
      status: 500,
      headers: corsHeaders,
    });
  }
});
