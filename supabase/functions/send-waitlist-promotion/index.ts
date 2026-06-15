import { serve } from 'https://deno.land/std@0.203.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import nodemailer from 'npm:nodemailer@6.9.9';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, authorization, apikey',
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris',
  });
}

function buildEmailHtml(opts: {
  partyTitle: string;
  partyDate: string | null;
  partyAddress: string;
  partyBannerUrl: string | null;
  guestName: string;
  partyUrl: string;
}): string {
  const { partyTitle, partyDate, partyAddress, partyBannerUrl, guestName, partyUrl } = opts;

  const bannerHtml = partyBannerUrl
    ? `<img src="${partyBannerUrl}" alt="${partyTitle}" style="width:100%;max-height:220px;object-fit:cover;display:block;" />`
    : `<div style="width:100%;height:100px;background:linear-gradient(135deg,#e8640c,#f97316);"></div>`;

  const dateHtml = partyDate
    ? `<tr><td style="padding:6px 0;color:#888;font-size:13px;width:80px;">📅 Date</td><td style="padding:6px 0;font-size:14px;color:#222;">${formatDate(partyDate)}</td></tr>`
    : '';

  const addressHtml = partyAddress
    ? `<tr><td style="padding:6px 0;color:#888;font-size:13px;width:80px;">📍 Lieu</td><td style="padding:6px 0;font-size:14px;color:#222;">${partyAddress}</td></tr>`
    : '';

  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width,initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
        <tr><td style="background:#e8640c;padding:18px 28px;">
          <span style="color:white;font-size:22px;font-weight:bold;letter-spacing:-0.5px;">🎉 PartySync</span>
        </td></tr>
        <tr><td style="padding:0;">${bannerHtml}</td></tr>
        <tr><td style="padding:28px 28px 0 28px;">
          <div style="background:#22c55e1a;border:1px solid #22c55e33;border-radius:10px;padding:16px 20px;margin-bottom:24px;">
            <p style="margin:0;font-size:18px;font-weight:700;color:#16a34a;">🎊 Une place s'est libérée !</p>
            <p style="margin:8px 0 0 0;font-size:14px;color:#15803d;">Tu passes de la liste d'attente à la liste des invités pour :</p>
          </div>
          <h1 style="margin:0 0 12px 0;font-size:24px;color:#111;font-weight:800;">${partyTitle}</h1>
          <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:24px;">
            ${dateHtml}
            ${addressHtml}
          </table>
          <p style="font-size:15px;color:#444;margin:0 0 20px 0;">
            Hé <strong>${guestName}</strong> ! Ta patience a payé 🙌 Confirme ta présence dès maintenant.
          </p>
          <table cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
            <tr>
              <td>
                <a href="${partyUrl}" style="display:inline-block;background:#e8640c;color:white;font-weight:700;font-size:15px;text-decoration:none;padding:14px 32px;border-radius:8px;">Voir la soirée →</a>
              </td>
            </tr>
          </table>
        </td></tr>
        <tr><td style="background:#1c1c1e;padding:24px 28px;">
          <p style="margin:0;color:#aaa;font-size:13px;">Reçu via <strong style="color:#e8640c;">PartySync</strong> — l'app pour organiser tes soirées entre amis.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const GMAIL_USER = Deno.env.get('GMAIL_USER')!;
    const GMAIL_APP_PASSWORD = Deno.env.get('GMAIL_APP_PASSWORD')!;
    const APP_URL = Deno.env.get('APP_URL') || 'https://partysync.app';

    const { guestUserId, partyId } = await req.json();
    if (!guestUserId || !partyId) {
      return new Response(JSON.stringify({ error: 'Missing guestUserId or partyId' }), { status: 400, headers: corsHeaders });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Verify the guest was actually just promoted (status = invited)
    const { data: guestRow } = await admin
      .from('party_guests')
      .select('status')
      .eq('party_id', partyId)
      .eq('user_id', guestUserId)
      .maybeSingle();
    if (guestRow?.status !== 'invited') {
      return new Response(JSON.stringify({ error: 'Guest not eligible' }), { status: 400, headers: corsHeaders });
    }

    // Get party details
    const { data: party } = await admin
      .from('parties')
      .select('title, fixed_date, address, banner_url')
      .eq('id', partyId)
      .maybeSingle();
    if (!party) return new Response(JSON.stringify({ error: 'Party not found' }), { status: 404, headers: corsHeaders });

    // Get guest profile
    const { data: profile } = await admin
      .from('profiles')
      .select('full_name, email')
      .eq('id', guestUserId)
      .maybeSingle();
    if (!profile?.email) return new Response(JSON.stringify({ error: 'Guest not found' }), { status: 404, headers: corsHeaders });

    const guestName = profile.full_name || profile.email.split('@')[0];
    const partyUrl = `${APP_URL}/party/${partyId}`;
    const notifTitle = `🎊 Une place s'est libérée — ${party.title}`;
    const notifBody = `Tu passes de la liste d'attente à la liste des invités !`;

    // Check for push subscription
    const { data: pushSubs } = await admin
      .from('push_subscriptions')
      .select('user_id')
      .eq('user_id', guestUserId)
      .limit(1);
    const hasPush = (pushSubs?.length ?? 0) > 0;

    // Insert notification record
    await admin.from('notifications').insert({
      user_id: guestUserId,
      title: notifTitle,
      message: notifBody,
      metadata: { partyId, action: 'waitlist_promotion' },
    });

    if (hasPush) {
      // Send push
      await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
        body: JSON.stringify({ userId: guestUserId, title: notifTitle, body: notifBody, url: partyUrl }),
      }).catch(() => {});
    }

    // Always send email
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
    });

    const html = buildEmailHtml({
      partyTitle: party.title,
      partyDate: party.fixed_date,
      partyAddress: party.address || '',
      partyBannerUrl: party.banner_url,
      guestName,
      partyUrl,
    });

    await transporter.sendMail({
      from: `"PartySync" <${GMAIL_USER}>`,
      to: profile.email,
      subject: `🎊 Une place s'est libérée pour « ${party.title} » !`,
      html,
    });

    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('send-waitlist-promotion error:', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders });
  }
});
