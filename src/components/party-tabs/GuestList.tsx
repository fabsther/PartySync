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

  // NEW: pour le lien de partage
  const [inviteCode, setInviteCode] = useState<string>('');
  const [copying, setCopying] = useState(false);

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
        .insert(
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
