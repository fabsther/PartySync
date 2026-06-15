import { supabase } from './supabase';

export async function promoteFromWaitlist(partyId: string): Promise<void> {
  // Get party max_guests
  const { data: party } = await supabase
    .from('parties')
    .select('max_guests')
    .eq('id', partyId)
    .maybeSingle();
  if (!party?.max_guests) return;

  // Count non-declined non-waitlisted guests (active spots used)
  const { count } = await supabase
    .from('party_guests')
    .select('id', { count: 'exact', head: true })
    .eq('party_id', partyId)
    .in('status', ['invited', 'confirmed']);

  const spotsOpen = party.max_guests - (count ?? 0);
  if (spotsOpen <= 0) return;

  // Get first waitlisted guests in order
  const { data: waitlisted } = await supabase
    .from('party_guests')
    .select('id, user_id')
    .eq('party_id', partyId)
    .eq('status', 'waitlisted')
    .order('waitlisted_at', { ascending: true })
    .limit(spotsOpen);

  if (!waitlisted?.length) return;

  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  for (const guest of waitlisted) {
    // Promote to invited
    await supabase
      .from('party_guests')
      .update({ status: 'invited', waitlisted_at: null })
      .eq('id', guest.id);

    // Send notification + email via edge function
    await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-waitlist-promotion`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ guestUserId: guest.user_id, partyId }),
    }).catch(() => {});
  }
}
