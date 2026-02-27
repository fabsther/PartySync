import { supabase } from './supabase';
import { sendRemoteNotification } from './remoteNotify';

/**
 * Check and send food reminders (24h and 1h before a party).
 * Called once at app load for the logged-in user.
 * Uses the notifications table for deduplication.
 */
export async function checkAndSendFoodReminders(userId: string) {
  try {
    const now = new Date();
    const in25h = new Date(now.getTime() + 25 * 60 * 60 * 1000);

    // Fetch confirmed parties for this user with a date in the next 25 hours
    const { data: guests } = await supabase
      .from('party_guests')
      .select('party_id, parties(id, title, fixed_date, is_date_fixed)')
      .eq('user_id', userId)
      .eq('status', 'confirmed');

    if (!guests || guests.length === 0) return;

    for (const g of guests) {
      const party = (g as any).parties;
      if (!party?.is_date_fixed || !party.fixed_date) continue;

      const partyDate = new Date(party.fixed_date);
      if (partyDate <= now || partyDate > in25h) continue;

      const msUntil = partyDate.getTime() - now.getTime();
      const hoursUntil = msUntil / (60 * 60 * 1000);

      // Check what the user is bringing
      const { data: contributions } = await supabase
        .from('food_contributions')
        .select('quantity, food_items(name)')
        .eq('user_id', userId)
        .gt('quantity', 0);

      // Filter contributions to items in this party
      const { data: partyItemIds } = await supabase
        .from('food_items')
        .select('id, name')
        .eq('party_id', party.id);

      const partyItemIdSet = new Set((partyItemIds || []).map((i: any) => i.id));

      const { data: myContribs } = await supabase
        .from('food_contributions')
        .select('quantity, food_items!inner(id, name, party_id)')
        .eq('user_id', userId)
        .eq('food_items.party_id', party.id)
        .gt('quantity', 0);

      if (!myContribs || myContribs.length === 0) continue;

      const itemList = myContribs
        .map((c: any) => `${c.quantity} × ${c.food_items.name}`)
        .join(', ');

      // 24h reminder
      if (hoursUntil <= 25 && hoursUntil > 2) {
        const alreadySent = await hasReminderBeenSent(userId, party.id, 'food_reminder_24h');
        if (!alreadySent) {
          await sendRemoteNotification(
            userId,
            `🛒 N'oublie pas d'acheter pour ${party.title} !`,
            `Tu t'es engagé(e) à apporter : ${itemList}`,
            { partyId: party.id, action: 'food_reminder_24h' },
            `/?partyId=${party.id}&tab=food`
          );
        }
      }

      // 1h reminder
      if (hoursUntil <= 2) {
        const alreadySent = await hasReminderBeenSent(userId, party.id, 'food_reminder_1h');
        if (!alreadySent) {
          await sendRemoteNotification(
            userId,
            `⏰ Dans ${Math.round(hoursUntil)}h ! Pense à emporter :`,
            itemList,
            { partyId: party.id, action: 'food_reminder_1h' },
            `/?partyId=${party.id}&tab=food`
          );
        }
      }
    }
  } catch (e) {
    console.debug('[foodReminders] error:', e);
  }
}

async function hasReminderBeenSent(userId: string, partyId: string, action: string): Promise<boolean> {
  const { data } = await supabase
    .from('notifications')
    .select('id')
    .eq('user_id', userId)
    .contains('metadata', { partyId, action })
    .limit(1);
  return (data?.length ?? 0) > 0;
}
