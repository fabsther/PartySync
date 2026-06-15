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
  partyDescription: string;
  partyDate: string | null;
  partyAddress: string;
  partyBannerUrl: string | null;
  creatorName: string;
  creatorAvatarUrl: string | null;
  guestName: string;
  partyUrl: string;
}): string {
  const {
    partyTitle, partyDescription, partyDate, partyAddress,
    partyBannerUrl, creatorName, creatorAvatarUrl, guestName, partyUrl,
  } = opts;

  const confirmUrl = `${partyUrl}?tab=guests&rsvp=confirmed`;
  const declineUrl = `${partyUrl}?tab=guests&rsvp=declined`;
  const appUrl = partyUrl.split('/party/')[0];

  const bannerHtml = partyBannerUrl
    ? `<img src="${partyBannerUrl}" alt="${partyTitle}" style="width:100%;max-height:220px;object-fit:cover;display:block;border-radius:0;" />`
    : `<div style="width:100%;height:120px;background:linear-gradient(135deg,#e8640c,#f97316);"></div>`;

  const avatarHtml = creatorAvatarUrl
    ? `<img src="${creatorAvatarUrl}" alt="${creatorName}" style="width:44px;height:44px;border-radius:50%;object-fit:cover;border:2px solid #e8640c;margin-right:12px;vertical-align:middle;" />`
    : `<div style="width:44px;height:44px;border-radius:50%;background:#e8640c;color:white;font-size:20px;font-weight:bold;display:inline-flex;align-items:center;justify-content:center;margin-right:12px;vertical-align:middle;">${creatorName[0]?.toUpperCase() ?? '?'}</div>`;

  const dateHtml = partyDate
    ? `<tr><td style="padding:6px 0;color:#9ca3af;font-size:13px;width:80px;">📅 Date</td><td style="padding:6px 0;font-size:14px;color:#e5e7eb;">${formatDate(partyDate)}</td></tr>`
    : '';

  const addressHtml = partyAddress
    ? `<tr><td style="padding:6px 0;color:#9ca3af;font-size:13px;width:80px;">📍 Lieu</td><td style="padding:6px 0;font-size:14px;color:#e5e7eb;">${partyAddress}</td></tr>`
    : '';

  const descHtml = partyDescription
    ? `<p style="font-size:14px;color:#9ca3af;line-height:1.6;margin:0 0 20px 0;">${partyDescription}</p>`
    : '';

  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width,initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background:#111827;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#111827;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#1f2937;border-radius:12px;overflow:hidden;box-shadow:0 2px 24px rgba(0,0,0,0.4);">

        <!-- Header orange -->
        <tr><td style="background:#e8640c;padding:18px 28px;">
          <span style="color:white;font-size:22px;font-weight:bold;letter-spacing:-0.5px;">🎉 PartySync</span>
        </td></tr>

        <!-- Party banner -->
        <tr><td style="padding:0;">${bannerHtml}</td></tr>

        <!-- Content -->
        <tr><td style="padding:28px 28px 0 28px;background:#1f2937;">

          <!-- Inviter -->
          <p style="margin:0 0 20px 0;font-size:15px;color:#d1d5db;">
            <span style="vertical-align:middle;">${avatarHtml}</span>
            <strong style="vertical-align:middle;color:#f9fafb;">${creatorName}</strong>
            <span style="vertical-align:middle;color:#9ca3af;"> t'a invité·e à&nbsp;:</span>
          </p>

          <!-- Party title -->
          <h1 style="margin:0 0 12px 0;font-size:26px;color:#f9fafb;font-weight:800;">${partyTitle}</h1>

          ${descHtml}

          <!-- Details table -->
          <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:24px;">
            ${dateHtml}
            ${addressHtml}
          </table>

          <!-- CTA -->
          <p style="font-size:15px;color:#d1d5db;margin:0 0 20px 0;">
            Hé <strong style="color:#f9fafb;">${guestName}</strong> ! Tu vas venir ? Réponds directement depuis ce mail 👇
          </p>

          <table cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
            <tr>
              <td style="padding-right:12px;">
                <a href="${confirmUrl}" style="display:inline-block;background:#22c55e;color:white;font-weight:700;font-size:15px;text-decoration:none;padding:14px 28px;border-radius:8px;">✅ Je viens !</a>
              </td>
              <td>
                <a href="${declineUrl}" style="display:inline-block;background:#374151;color:#d1d5db;font-weight:600;font-size:15px;text-decoration:none;padding:14px 28px;border-radius:8px;border:1px solid #4b5563;">❌ Je ne peux pas</a>
              </td>
            </tr>
          </table>

        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#111827;padding:24px 28px;border-top:1px solid #374151;">
          <p style="margin:0 0 8px 0;color:#6b7280;font-size:13px;">Reçu via <strong style="color:#e8640c;">PartySync</strong> — l'app pour organiser tes soirées entre amis.</p>
          <p style="margin:0;font-size:12px;color:#4b5563;">
            Tu n'as pas encore l'app ?
            <a href="${appUrl}" style="color:#e8640c;text-decoration:underline;">Ouvre PartySync sur ton téléphone</a>
            et installe-la depuis ton navigateur.
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const GMAIL_USER = Deno.env.get('GMAIL_USER')!;
    const GMAIL_APP_PASSWORD = Deno.env.get('GMAIL_APP_PASSWORD')!;
    const APP_URL = Deno.env.get('APP_URL') || 'https://partysync.app';

    // Auth check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    const { partyId } = await req.json();
    if (!partyId) {
      return new Response(JSON.stringify({ error: 'Missing partyId' }), { status: 400, headers: corsHeaders });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Verify caller is party creator
    const { data: party, error: partyErr } = await admin
      .from('parties')
      .select('id, title, description, address, fixed_date, banner_url, created_by')
      .eq('id', partyId)
      .eq('created_by', user.id)
      .maybeSingle();
    if (partyErr || !party) {
      return new Response(JSON.stringify({ error: 'Party not found or unauthorized' }), { status: 403, headers: corsHeaders });
    }

    // Creator profile
    const { data: creator } = await admin
      .from('profiles')
      .select('full_name, email, avatar_url')
      .eq('id', user.id)
      .maybeSingle();
    const creatorName = creator?.full_name || creator?.email?.split('@')[0] || 'L\'organisateur';

    // Pending guests
    const { data: pendingGuests } = await admin
      .from('party_guests')
      .select('user_id, profiles(full_name, email)')
      .eq('party_id', partyId)
      .eq('status', 'invited');
    if (!pendingGuests || pendingGuests.length === 0) {
      return new Response(JSON.stringify({ pushed: 0, emailed: 0, total: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Which guests have push subscriptions
    const guestIds = pendingGuests.map((g: any) => g.user_id);
    const { data: pushSubs } = await admin
      .from('push_subscriptions')
      .select('user_id')
      .in('user_id', guestIds);
    const pushedUserIds = new Set((pushSubs || []).map((s: any) => s.user_id));

    // SMTP transporter
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
    });

    const partyBannerUrl = party.banner_url ?? null;
    const partyUrl = `${APP_URL}/party/${partyId}`;

    let pushed = 0;
    let emailed = 0;

    for (const guest of pendingGuests as any[]) {
      const profile = guest.profiles;
      if (!profile?.email) continue;
      const guestName = profile.full_name || profile.email.split('@')[0];

      if (pushedUserIds.has(guest.user_id)) {
        // Push notification via existing send-push
        await admin.from('notifications').insert({
          user_id: guest.user_id,
          title: `🎉 ${party.title}`,
          message: `${creatorName} te rappelle : tu n'as pas encore répondu à l'invitation !`,
          metadata: { partyId, action: 'party_reminder' },
        });
        // Call send-push edge function
        await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({
            userId: guest.user_id,
            title: `🎉 ${party.title}`,
            body: `${creatorName} te rappelle : tu n'as pas encore répondu à l'invitation !`,
            url: partyUrl,
          }),
        }).catch(() => {});
        pushed++;
      } else {
        // Email
        const html = buildEmailHtml({
          partyTitle: party.title,
          partyDescription: party.description || '',
          partyDate: party.fixed_date,
          partyAddress: party.address || '',
          partyBannerUrl,
          creatorName,
          creatorAvatarUrl: creator?.avatar_url ?? null,
          guestName,
          partyUrl,
        });

        await transporter.sendMail({
          from: `"${creatorName} via PartySync" <${GMAIL_USER}>`,
          replyTo: creator?.email || GMAIL_USER,
          to: profile.email,
          subject: `🎉 ${creatorName} t'invite à « ${party.title} » — tu viens ?`,
          html,
        });
        emailed++;
      }
    }

    return new Response(
      JSON.stringify({ pushed, emailed, total: pushed + emailed }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('send-party-reminder error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
