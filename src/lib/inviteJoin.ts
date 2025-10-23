import { supabase } from '../lib/supabase';

// S'assure que: (1) l'user est abonné au créateur du code, (2) il est ajouté à la party
export async function ensureSubscriptionAndJoinParty(params: {
  inviteCode: string;
  joinPartyId: string;
  currentUserId: string;
}) {
  const { inviteCode, joinPartyId, currentUserId } = params;
  const trimmedCode = inviteCode.trim().toUpperCase();

  // 1) Trouver le créateur du code
  const { data: codeData, error: codeErr } = await supabase
    .from('invite_codes')
    .select('created_by')
    .eq('code', trimmedCode)
    .maybeSingle();

  if (codeErr) throw codeErr;
  if (!codeData) throw new Error('Invalid invite code');

  const ownerId = codeData.created_by;

  // Sécurité anti auto-subscribe (ne devrait pas arriver pour un invité, mais on garde)
  if (ownerId === currentUserId) {
    // Rien à faire, pas de self-subscribe
    return { subscribed: false, joined: false, reason: 'self' };
  }

  // 2) S'abonner si pas déjà
  const { data: existingSub, error: exSubErr } = await supabase
    .from('subscribers')
    .select('id')
    .eq('user_id', ownerId)
    .eq('subscriber_id', currentUserId)
    .maybeSingle();
  if (exSubErr && exSubErr.code !== 'PGRST116') throw exSubErr;

  if (!existingSub) {
    const { error: insSubErr } = await supabase
      .from('subscribers')
      .insert({ user_id: ownerId, subscriber_id: currentUserId });
    if (insSubErr && (insSubErr as any).code !== '23505') throw insSubErr; // idempotent
  }

  // 3) Ajouter comme guest à la party (statut "invited" par défaut), si pas déjà présent
  const { data: existingGuest, error: exGuestErr } = await supabase
    .from('party_guests')
    .select('id')
    .eq('party_id', joinPartyId)
    .eq('user_id', currentUserId)
    .maybeSingle();
  if (exGuestErr && exGuestErr.code !== 'PGRST116') throw exGuestErr;

  if (!existingGuest) {
    const { error: insGuestErr } = await supabase
      .from('party_guests')
      .insert({ party_id: joinPartyId, user_id: currentUserId, status: 'invited' });
    if (insGuestErr && (insGuestErr as any).code !== '23505') throw insGuestErr;
  }

  return { subscribed: !existingSub, joined: !existingGuest };
}