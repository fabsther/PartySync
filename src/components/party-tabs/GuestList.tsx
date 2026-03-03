import { useEffect, useState } from 'react';
import { UserPlus, Check, X, Clock, Bell } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { sendLocalNotification } from '../../lib/notifications';
import { sendRemoteNotification } from '../../lib/remoteNotify';
import { downloadICS, getGoogleCalendarUrl } from '../../lib/calendar';

interface Companion {
  id: string;
  name: string;
}

interface Guest {
  id: string;
  user_id: string;
  status: 'invited' | 'confirmed' | 'declined';
  companions?: string | null;
  guest_companions?: Companion[];
  profiles: {
    full_name: string | null;
    email: string;
    avatar_url: string | null;
  };
}

interface GuestListProps {
  partyId: string;
  creatorId: string;
  partyTitle?: string;
  partyDate?: string | null;
  partyAddress?: string;
  partyDescription?: string;
  partyDateFixed?: boolean;
}

export function GuestList({ partyId, creatorId, partyTitle, partyDate, partyAddress, partyDescription, partyDateFixed }: GuestListProps) {
  const { t } = useTranslation('party');
  const [guests, setGuests] = useState<Guest[]>([]);
  const [subscribers, setSubscribers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingGuest, setAddingGuest] = useState(false);
  const [showSubscriberList, setShowSubscriberList] = useState(false);
  const [newCompanionName, setNewCompanionName] = useState('');
  const [addingCompanion, setAddingCompanion] = useState(false);
  const [pingedGuests, setPingedGuests] = useState<Set<string>>(new Set());

  const [showCalendarPrompt, setShowCalendarPrompt] = useState(false);

  const { user } = useAuth();
  const isCreator = user?.id === creatorId;

  useEffect(() => {
    loadGuests();
    if (isCreator) {
      loadSubscribers();
    }
  }, [partyId, isCreator]);

  const loadGuests = async () => {
    try {
      const { data, error } = await supabase
        .from('party_guests')
        .select('id, user_id, status, companions, profiles(full_name, email, avatar_url), guest_companions(id, name)')
        .eq('party_id', partyId);

      if (error) throw error;
      setGuests((data as any) || []);
    } catch (error) {
      console.error('Error loading guests:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadSubscribers = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('subscribers')
        .select('subscriber_id, profiles!subscribers_subscriber_id_fkey(id, full_name, email)')
        .eq('user_id', user.id);
      if (error) throw error;
      setSubscribers(data || []);
    } catch (error) {
      console.error('Error loading subscribers:', error);
    }
  };


  const addGuestFromList = async (targetUserId: string) => {
    setAddingGuest(true);
    try {
      const { data: partyData, error: partyErr } = await supabase
        .from('parties')
        .select('title')
        .eq('id', partyId)
        .maybeSingle();
      if (partyErr) throw partyErr;

      const { error } = await supabase.from('party_guests').insert({
        party_id: partyId,
        user_id: targetUserId,
        status: 'invited',
      });

      if (error) {
        if ((error as any).code === '23505') {
          alert('This person is already invited to the party.');
        } else {
          throw error;
        }
        return;
      }

      await sendRemoteNotification(
        targetUserId,
        '🎉 Invitation à une fête',
        partyData?.title
          ? `Tu es invité·e à « ${partyData.title} ». Dis-nous si tu viens !`
          : `Tu es invité·e à une fête. Dis-nous si tu viens !`,
        { partyId, action: 'party_invitation' },
        `/party/${partyId}?tab=guests`
      );

      sendLocalNotification('Invitation envoyée', 'Le guest a été invité.', { partyId });

      setShowSubscriberList(false);
      loadGuests();
    } catch (err) {
      console.error('Error adding guest:', err);
      alert('Failed to add guest.');
    } finally {
      setAddingGuest(false);
    }
  };

  const updateStatus = async (guestId: string, status: 'confirmed' | 'declined' | 'invited') => {
    try {
      const { data: gRow, error: gErr } = await supabase
        .from('party_guests')
        .select('id, user_id, status, party_id, profiles(full_name, email)')
        .eq('id', guestId)
        .maybeSingle();

      if (gErr) throw gErr;
      if (!gRow) {
        console.error('Guest row not found for id:', guestId);
        return;
      }

      const { error: upErr } = await supabase
        .from('party_guests')
        .update({ status })
        .eq('id', guestId);
      if (upErr) throw upErr;

      const actedByGuest = user?.id === gRow.user_id;
      const actedByCreator = user?.id === creatorId;

      const guestName = gRow.profiles?.full_name || gRow.profiles?.email || 'Guest';
      const deepLink = `/party/${partyId}?tab=guests`;

      const statusTxt =
        status === 'confirmed' ? 'a confirmé sa présence'
        : status === 'declined' ? "a décliné l'invitation"
        : 'est repassé·e en attente';

      if (actedByGuest) {
        await sendRemoteNotification(
          creatorId,
          "🧾 Réponse à l'invitation",
          `${guestName} ${statusTxt}.`,
          { partyId, action: 'guest_status_update', guestId, newStatus: status },
          deepLink
        );
        if (status === 'confirmed' && partyDateFixed && partyDate) {
          setShowCalendarPrompt(true);
        }
      } else if (actedByCreator) {
        const body =
          status === 'confirmed' ? 'Votre présence a été confirmée.'
          : status === 'declined' ? 'Votre invitation a été marquée comme déclinée.'
          : 'Votre statut a été réinitialisé en attente.';

        await sendRemoteNotification(
          gRow.user_id,
          '✏️ Mise à jour de votre statut',
          body,
          { partyId, action: 'guest_status_admin_update', guestId, newStatus: status },
          deepLink
        );
      }

      loadGuests();
    } catch (error) {
      console.error('Error updating guest status:', error);
      alert('Failed to update status.');
    }
  };

  const addCompanion = async () => {
    if (!user || !newCompanionName.trim()) return;

    const myGuest = guests.find(g => g.user_id === user.id);
    if (!myGuest) return;

    setAddingCompanion(true);
    try {
      const name = newCompanionName.trim();
      const { error } = await supabase
        .from('guest_companions')
        .insert({ party_guest_id: myGuest.id, name });
      if (error) throw error;

      setNewCompanionName('');
      loadGuests();

      await sendRemoteNotification(
        creatorId,
        '➕ Nouveau accompagnant',
        `${(user?.email || 'Guest')} a ajouté « ${name} » à sa liste.`,
        { partyId, action: 'companion_added', partyGuestId: myGuest.id, name },
        `/party/${partyId}?tab=guests`
      );
    } catch (error) {
      console.error('Error adding companion:', error);
      alert('Failed to add companion.');
    } finally {
      setAddingCompanion(false);
    }
  };

  const removeCompanion = async (companionId: string) => {
    try {
      const target = guests
        .flatMap(g => g.guest_companions || [])
        .find(c => c.id === companionId);

      const { error } = await supabase
        .from('guest_companions')
        .delete()
        .eq('id', companionId);
      if (error) throw error;

      loadGuests();

      await sendRemoteNotification(
        creatorId,
        '➖ Accompagnant supprimé',
        `${(user?.email || 'Guest')} a supprimé « ${target?.name || 'un accompagnant'} ».`,
        { partyId, action: 'companion_removed', companionId },
        `/party/${partyId}?tab=guests`
      );
    } catch (error) {
      console.error('Error removing companion:', error);
      alert('Failed to remove companion.');
    }
  };

  const pingGuest = async (guest: Guest) => {
    await sendRemoteNotification(
      guest.user_id,
      `🔔 Ta réponse est attendue — ${partyTitle}`,
      `L'organisateur te demande si tu viens à « ${partyTitle} »`,
      { partyId, action: 'ping_rsvp', guestId: guest.id },
      `/?partyId=${partyId}&action=ping_rsvp`
    );
    setPingedGuests(prev => new Set(prev).add(guest.id));
  };

  const emailToDisplayName = (email: string): string => {
    const local = email.split('@')[0];
    const cleaned = local.replace(/\d+/g, '').replace(/[._-]+/g, ' ').trim();
    return cleaned || local;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'confirmed': return <Check className="w-5 h-5 text-green-500" />;
      case 'declined':  return <X className="w-5 h-5 text-red-500" />;
      default:          return <Clock className="w-5 h-5 text-orange-500" />;
    }
  };
  const getStatusText = (status: string) => {
    switch (status) {
      case 'confirmed': return t('status_confirmed');
      case 'declined':  return t('status_declined');
      default:          return t('status_pending');
    }
  };

  if (loading) return <div className="text-center text-neutral-400">{t('loading_guests')}</div>;
  const myGuest = guests.find(g => g.user_id === user?.id);

  return (
    <div className="space-y-6">

      {isCreator && (
        <div>
          <button
            onClick={() => setShowSubscriberList(!showSubscriberList)}
            className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition flex items-center space-x-2"
          >
            <UserPlus className="w-5 h-5" />
            <span>{t('add_guest_subscribers')}</span>
          </button>

          {showSubscriberList && (
            <div className="mt-4 bg-neutral-800 rounded-lg p-4 space-y-2 max-h-64 overflow-y-auto">
              {subscribers.length === 0 ? (
                <p className="text-neutral-500 text-center py-4">{t('no_subscribers_available')}</p>
              ) : (
                subscribers.map((sub: any) => {
                  const alreadyInvited = guests.some(g => g.user_id === sub.subscriber_id);
                  return (
                    <div
                      key={sub.subscriber_id}
                      className="flex items-center justify-between p-3 bg-neutral-900 rounded hover:bg-neutral-700 transition"
                    >
                      <div>
                        <div className="text-white font-medium">
                          {sub.profiles.full_name || sub.profiles.email}
                        </div>
                        <div className="text-sm text-neutral-500">{sub.profiles.email}</div>
                      </div>
                      <button
                        onClick={() => addGuestFromList(sub.subscriber_id)}
                        disabled={alreadyInvited || addingGuest}
                        className="px-3 py-1 bg-orange-500 text-white rounded hover:bg-orange-600 transition text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {alreadyInvited ? t('already_invited') : t('add', { ns: 'common' })}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      )}

      {myGuest && myGuest.status === 'confirmed' && (
        <div className="bg-neutral-800 rounded-lg p-4">
          <h4 className="text-white font-medium mb-3">{t('manage_companions')}</h4>
          <p className="text-sm text-neutral-400 mb-3">{t('companions_hint')}</p>

          {myGuest.guest_companions && myGuest.guest_companions.length > 0 && (
            <div className="mb-4 space-y-2">
              {myGuest.guest_companions.map((companion) => (
                <div key={companion.id} className="flex items-center justify-between bg-neutral-900 p-3 rounded-lg">
                  <span className="text-white">{companion.name}</span>
                  <button
                    onClick={() => removeCompanion(companion.id)}
                    className="px-3 py-1 bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 transition text-sm"
                  >
                    {t('remove')}
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex space-x-3">
            <input
              type="text"
              value={newCompanionName}
              onChange={(e) => setNewCompanionName(e.target.value)}
              placeholder={t('companion_name_placeholder')}
              className="flex-1 px-4 py-2 bg-neutral-900 border border-neutral-700 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addCompanion();
                }
              }}
            />
            <button
              onClick={addCompanion}
              disabled={addingCompanion || !newCompanionName.trim()}
              className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t('add', { ns: 'common' })}
            </button>
          </div>
        </div>
      )}

      {showCalendarPrompt && partyDate && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <div className="text-center mb-5">
              <div className="text-4xl mb-3">🎉</div>
              <h3 className="text-xl font-bold text-white">Tu es confirmé(e) !</h3>
              <p className="text-neutral-400 text-sm mt-1">
                Ajouter{partyTitle ? ` « ${partyTitle} »` : ' la soirée'} à ton agenda ?
              </p>
            </div>

            <div className="space-y-2 mb-4">
              <a
                href={getGoogleCalendarUrl({
                  title: partyTitle || 'Soirée',
                  description: partyDescription,
                  location: partyAddress,
                  startDate: new Date(partyDate),
                })}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setShowCalendarPrompt(false)}
                className="flex items-center gap-3 w-full px-4 py-3 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded-xl transition text-white text-sm font-medium"
              >
                <span className="text-xl">📅</span>
                <span>Google Calendar</span>
              </a>
              <button
                onClick={() => {
                  downloadICS({
                    title: partyTitle || 'Soirée',
                    description: partyDescription,
                    location: partyAddress,
                    startDate: new Date(partyDate),
                  });
                  setShowCalendarPrompt(false);
                }}
                className="flex items-center gap-3 w-full px-4 py-3 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded-xl transition text-white text-sm font-medium text-left"
              >
                <span className="text-xl">🍎</span>
                <span>Apple Calendar / iCal (.ics)</span>
              </button>
            </div>

            <button
              onClick={() => setShowCalendarPrompt(false)}
              className="w-full text-neutral-500 hover:text-neutral-300 text-sm transition py-1"
            >
              {t('no_thanks')}
            </button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {guests.length === 0 ? (
          <p className="text-neutral-500 text-center py-8">{t('no_guests_yet')}</p>
        ) : (
          guests.map((guest) => (
            <div
              key={guest.id}
              className="bg-neutral-800 rounded-lg p-4 space-y-2"
            >
              <div className="flex items-center gap-3 min-w-0 justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  {guest.profiles.avatar_url ? (
                    <img src={guest.profiles.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-orange-600 rounded-full flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">
                      {(guest.profiles.full_name || emailToDisplayName(guest.profiles.email))[0].toUpperCase()}
                    </div>
                  )}
                  {getStatusIcon(guest.status)}
                  <div className="min-w-0">
                    <div className="text-white font-medium truncate">
                      {guest.profiles.full_name || emailToDisplayName(guest.profiles.email)}
                    </div>
                    <div className="text-sm text-neutral-500">{getStatusText(guest.status)}</div>
                    {guest.guest_companions && guest.guest_companions.length > 0 && (
                      <div className="text-xs text-orange-400 mt-1">
                        {t('companions_count', { count: guest.guest_companions.length })}: {guest.guest_companions.map(c => c.name).join(', ')}
                      </div>
                    )}
                  </div>
                </div>
                {isCreator && guest.status === 'invited' && guest.user_id !== user?.id && (
                  <button
                    onClick={() => pingGuest(guest)}
                    title={t('ping_guest_tooltip')}
                    className="flex-shrink-0 p-1.5 rounded-lg hover:bg-neutral-700 transition"
                  >
                    {pingedGuests.has(guest.id)
                      ? <Check className="w-4 h-4 text-green-400" />
                      : <Bell className="w-4 h-4 text-orange-400" />}
                  </button>
                )}
              </div>

              {(guest.user_id === user?.id || isCreator) && !(isCreator && guest.user_id === user?.id) && (
                <div className="flex gap-2 pl-11 [&>button]:whitespace-nowrap [&>button]:flex-none">
                  {guest.status !== 'confirmed' && (
                    <button
                      onClick={() => updateStatus(guest.id, 'confirmed')}
                      className="px-3 py-1 bg-green-500/20 text-green-400 rounded hover:bg-green-500/30 transition text-sm"
                    >
                      {guest.user_id === user?.id ? t('accept') : t('set_confirmed')}
                    </button>
                  )}
                  {guest.status !== 'declined' && (
                    <button
                      onClick={() => updateStatus(guest.id, 'declined')}
                      className="px-3 py-1 bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 transition text-sm"
                    >
                      {guest.user_id === user?.id ? t('decline') : t('set_declined')}
                    </button>
                  )}
                  {guest.status !== 'invited' && guest.user_id === user?.id && !isCreator && (
                    <button
                      onClick={() => updateStatus(guest.id, 'invited')}
                      className="px-3 py-1 bg-orange-500/20 text-orange-400 rounded hover:bg-orange-500/30 transition text-sm"
                    >
                      {t('reset_status')}
                    </button>
                  )}
                  {isCreator && guest.status !== 'invited' && guest.user_id !== user?.id && (
                    <button
                      onClick={() => updateStatus(guest.id, 'invited')}
                      className="px-3 py-1 bg-orange-500/20 text-orange-400 rounded hover:bg-orange-500/30 transition text-sm"
                    >
                      {t('reset_to_pending')}
                    </button>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
