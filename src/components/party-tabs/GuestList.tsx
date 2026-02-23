import { useEffect, useState } from 'react';
import { UserPlus, Check, X, Clock } from 'lucide-react';
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
  const [guests, setGuests] = useState<Guest[]>([]);
  const [subscribers, setSubscribers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingGuest, setAddingGuest] = useState(false);
  const [showSubscriberList, setShowSubscriberList] = useState(false);
  const [newCompanionName, setNewCompanionName] = useState('');
  const [addingCompanion, setAddingCompanion] = useState(false);

  // NEW: pour le lien de partage
  const [inviteCode, setInviteCode] = useState<string>('');
  const [copying, setCopying] = useState(false);
  const [showCalendarPrompt, setShowCalendarPrompt] = useState(false);

  const { user } = useAuth();
  const isCreator = user?.id === creatorId;

  useEffect(() => {
    loadGuests();
    if (isCreator) {
      loadSubscribers();
      loadOrCreateInviteCodeForUser(creatorId); // NEW
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

  // NEW: lecture (ou création si absent) du code d’invitation de l’organisateur
  const loadOrCreateInviteCodeForUser = async (ownerId: string) => {
    try {
      const { data: rows, error: selErr } = await supabase
        .from('invite_codes')
        .select('code, created_at')
        .eq('created_by', ownerId)
        .order('created_at', { ascending: false })
        .limit(1);

      if (selErr) throw selErr;

      if (rows && rows.length > 0) {
        setInviteCode(rows[0].code);
        return;
      }

      const newCode = generateInviteCode();
      const { error: insErr } = await supabase
        .from('invite_codes')
        .upsert(
          { code: newCode, created_by: ownerId },
          { onConflict: 'created_by', ignoreDuplicates: true }
        );
      if (insErr) throw insErr;

      const { data: finalRow, error: finalErr } = await supabase
        .from('invite_codes')
        .select('code')
        .eq('created_by', ownerId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (finalErr) throw finalErr;
      setInviteCode(finalRow.code);
    } catch (e) {
      console.error('Error loading/creating invite code:', e);
    }
  };

  const generateInviteCode = () => Math.random().toString(36).substring(2, 10).toUpperCase();

  const shareUrl = inviteCode
    ? `${window.location.origin}?invite=${inviteCode}&join_party=${partyId}` // NEW
    : '';

  const copyShareLink = async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopying(true);
    setTimeout(() => setCopying(false), 1500);
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
        : status === 'declined' ? 'a décliné l’invitation'
        : 'est repassé·e en attente';

      if (actedByGuest) {
        await sendRemoteNotification(
          creatorId,
          ‘🧾 Réponse à l’invitation’,
          `${guestName} ${statusTxt}.`,
          { partyId, action: ‘guest_status_update’, guestId, newStatus: status },
          deepLink
        );
        if (status === ‘confirmed’ && partyDateFixed && partyDate) {
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

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'confirmed': return <Check className="w-5 h-5 text-green-500" />;
      case 'declined':  return <X className="w-5 h-5 text-red-500" />;
      default:          return <Clock className="w-5 h-5 text-orange-500" />;
    }
  };
  const getStatusText = (status: string) => {
    switch (status) {
      case 'confirmed': return 'Confirmed';
      case 'declined':  return 'Declined';
      default:          return 'Pending';
    }
  };

  if (loading) return <div className="text-center text-neutral-400">Loading guests...</div>;
  const myGuest = guests.find(g => g.user_id === user?.id);

  return (
    <div className="space-y-6">
      {/* NEW: Bloc partage (organisateur) */}
      {isCreator && (
        <div className="bg-neutral-800 rounded-lg p-4">
          <h4 className="text-white font-medium mb-2">Share this party</h4>
          <p className="text-sm text-neutral-400 mb-3">
            Envoie ce lien : il contient ton code d’invitation et ajoutera automatiquement la personne à cette party après souscription.
          </p>
          <div className="flex gap-2">
            <input
              readOnly
              value={shareUrl}
              className="flex-1 px-3 py-2 bg-neutral-900 border border-neutral-700 rounded-lg text-white text-sm"
            />
            <button
              onClick={copyShareLink}
              disabled={!shareUrl}
              className="px-3 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50"
            >
              {copying ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <p className="text-xs text-neutral-500 mt-2">
            Format: <code>?invite=&lt;CODE&gt;&amp;join_party={partyId}</code>
          </p>
        </div>
      )}

      {isCreator && (
        <div>
          <button
            onClick={() => setShowSubscriberList(!showSubscriberList)}
            className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition flex items-center space-x-2"
          >
            <UserPlus className="w-5 h-5" />
            <span>Add Guest from Subscribers</span>
          </button>

          {showSubscriberList && (
            <div className="mt-4 bg-neutral-800 rounded-lg p-4 space-y-2 max-h-64 overflow-y-auto">
              {subscribers.length === 0 ? (
                <p className="text-neutral-500 text-center py-4">No subscribers available</p>
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
                        {alreadyInvited ? 'Already Invited' : 'Add'}
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
          <h4 className="text-white font-medium mb-3">Manage Companions</h4>
          <p className="text-sm text-neutral-400 mb-3">
            Add people you're bringing with you (family members, friends, etc.)
          </p>

          {myGuest.guest_companions && myGuest.guest_companions.length > 0 && (
            <div className="mb-4 space-y-2">
              {myGuest.guest_companions.map((companion) => (
                <div key={companion.id} className="flex items-center justify-between bg-neutral-900 p-3 rounded-lg">
                  <span className="text-white">{companion.name}</span>
                  <button
                    onClick={() => removeCompanion(companion.id)}
                    className="px-3 py-1 bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 transition text-sm"
                  >
                    Remove
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
              placeholder="Companion's name"
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
              Add
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
              Non merci
            </button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {guests.length === 0 ? (
          <p className="text-neutral-500 text-center py-8">No guests yet</p>
        ) : (
          guests.map((guest) => (
            <div
              key={guest.id}
              className="flex items-center justify-between bg-neutral-800 rounded-lg p-4"
            >
              <div className="flex items-center space-x-3 flex-1">
                {guest.profiles.avatar_url ? (
                  <img src={guest.profiles.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                ) : (
                  <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-orange-600 rounded-full flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">
                    {(guest.profiles.full_name || guest.profiles.email)[0].toUpperCase()}
                  </div>
                )}
                {getStatusIcon(guest.status)}
                <div className="flex-1">
                  <div className="text-white font-medium">
                    {guest.profiles.full_name || guest.profiles.email}
                  </div>
                  <div className="text-sm text-neutral-500">{getStatusText(guest.status)}</div>
                  {guest.guest_companions && guest.guest_companions.length > 0 && (
                    <div className="text-xs text-orange-400 mt-1">
                      +{guest.guest_companions.length} companion{guest.guest_companions.length > 1 ? 's' : ''}: {guest.guest_companions.map(c => c.name).join(', ')}
                    </div>
                  )}
                </div>
              </div>

              {(guest.user_id === user?.id || isCreator) && !(isCreator && guest.user_id === user?.id) && (
                <div className="flex space-x-2">
                  {guest.status !== 'confirmed' && (
                    <button
                      onClick={() => updateStatus(guest.id, 'confirmed')}
                      className="px-3 py-1 bg-green-500/20 text-green-400 rounded hover:bg-green-500/30 transition text-sm"
                    >
                      {guest.user_id === user?.id ? 'Accept' : 'Set Confirmed'}
                    </button>
                  )}
                  {guest.status !== 'declined' && (
                    <button
                      onClick={() => updateStatus(guest.id, 'declined')}
                      className="px-3 py-1 bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 transition text-sm"
                    >
                      {guest.user_id === user?.id ? 'Decline' : 'Set Declined'}
                    </button>
                  )}
                  {guest.status !== 'invited' && guest.user_id === user?.id && !isCreator && (
                    <button
                      onClick={() => updateStatus(guest.id, 'invited')}
                      className="px-3 py-1 bg-orange-500/20 text-orange-400 rounded hover:bg-orange-500/30 transition text-sm"
                    >
                      Reset
                    </button>
                  )}
                  {isCreator && guest.status !== 'invited' && guest.user_id !== user?.id && (
                    <button
                      onClick={() => updateStatus(guest.id, 'invited')}
                      className="px-3 py-1 bg-orange-500/20 text-orange-400 rounded hover:bg-orange-500/30 transition text-sm"
                    >
                      Reset to Pending
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
