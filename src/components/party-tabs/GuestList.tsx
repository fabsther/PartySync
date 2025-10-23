import { useEffect, useState } from 'react';
import { UserPlus, Check, X, Clock } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { sendLocalNotification } from '../../lib/notifications';
import { sendRemoteNotification } from '../../lib/remoteNotify';

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
  };
}

interface GuestListProps {
  partyId: string;
  creatorId: string;
}

export function GuestList({ partyId, creatorId }: GuestListProps) {
  const [guests, setGuests] = useState<Guest[]>([]);
  const [subscribers, setSubscribers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingGuest, setAddingGuest] = useState(false);
  const [showSubscriberList, setShowSubscriberList] = useState(false);
  const [newCompanionName, setNewCompanionName] = useState('');
  const [addingCompanion, setAddingCompanion] = useState(false);
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
        .select('id, user_id, status, companions, profiles(full_name, email), guest_companions(id, name)')
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
    // Récupère le titre de la party pour un message sympa
    const { data: partyData, error: partyErr } = await supabase
      .from('parties')
      .select('title')
      .eq('id', partyId)
      .maybeSingle();
    if (partyErr) throw partyErr;

    // Insertion de l’invitation
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

    // ✅ Remote notification pour l’invité
    await sendRemoteNotification(
      targetUserId,
      '🎉 Invitation à une fête',
      partyData?.title
        ? `Tu es invité·e à « ${partyData.title} ». Dis-nous si tu viens !`
        : `Tu es invité·e à une fête. Dis-nous si tu viens !`,
      { partyId, action: 'party_invitation' },
      `/party/${partyId}?tab=guests`
    );

    // (Optionnel) feedback local pour l’organisateur
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
      // Récupère la ligne pour connaître le user ciblé + libellés
      const { data: gRow, error: gErr } = await supabase
        .from('party_guests')
        .select('id, user_id, status, profiles(full_name, email), parties:title(parties!inner(title))')
        .eq('id', guestId)
        .single();
      if (gErr) throw gErr;
  
      const { error } = await supabase
        .from('party_guests')
        .update({ status })
        .eq('id', guestId);
      if (error) throw error;
  
      // Qui a déclenché l’action ?
      const actedByGuest = user?.id === gRow.user_id;
      const actedByCreator = user?.id === creatorId;
  
      const guestName = gRow.profiles?.full_name || gRow.profiles?.email || 'Guest';
      const deepLink = `/party/${partyId}?tab=guests`;
  
      // 📣 Compose les messages
      const statusTxt =
        status === 'confirmed' ? 'a confirmé sa présence'
        : status === 'declined' ? 'a décliné l’invitation'
        : 'est repassé·e en attente';
  
      if (actedByGuest) {
        // Le guest a changé son propre statut → informer l’organisateur
        await sendRemoteNotification(
          creatorId,
          '🧾 Réponse à l’invitation',
          `${guestName} ${statusTxt}.`,
          { partyId, action: 'guest_status_update', guestId, newStatus: status },
          deepLink
        );
      } else if (actedByCreator) {
        // L’organisateur a modifié le statut du guest → informer le guest
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
  
      // 📣 Notifie l’organisateur (creator)
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
      // Récupérer le nom pour le message (facultatif)
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
      case 'confirmed':
        return <Check className="w-5 h-5 text-green-500" />;
      case 'declined':
        return <X className="w-5 h-5 text-red-500" />;
      default:
        return <Clock className="w-5 h-5 text-orange-500" />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'confirmed':
        return 'Confirmed';
      case 'declined':
        return 'Declined';
      default:
        return 'Pending';
    }
  };

  if (loading) {
    return <div className="text-center text-neutral-400">Loading guests...</div>;
  }

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
              onKeyPress={(e) => {
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

              {(guest.user_id === user?.id || isCreator) && (
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
                  {guest.status !== 'invited' && guest.user_id === user?.id && (
                    <button
                      onClick={() => updateStatus(guest.id, 'invited')}
                      className="px-3 py-1 bg-orange-500/20 text-orange-400 rounded hover:bg-orange-500/30 transition text-sm"
                    >
                      Reset
                    </button>
                  )}
                  {isCreator && guest.status !== 'invited' && (
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
