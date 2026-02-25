import { useEffect, useState } from 'react';
import { useRef } from 'react';
import {
  ArrowLeft,
  Calendar,
  CalendarPlus,
  MapPin,
  Clock,
  Users,
  Car,
  Wrench,
  UtensilsCrossed,
  ExternalLink,
  Ban,
  XCircle,
  Share2,
  Check,
  MessageCircle,
  MessageSquare,
  ImagePlus,
  Smile,
  X as XIcon,
} from 'lucide-react';
import { downloadICS, getGoogleCalendarUrl } from '../lib/calendar';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { sendRemoteNotification } from '../lib/remoteNotify';
import { uploadPartyMedia, deletePartyMedia, detectChatPlatform } from '../lib/uploadMedia';
import { GuestList } from './party-tabs/GuestList';
import { CarSharing } from './party-tabs/CarSharing';
import { Equipment } from './party-tabs/Equipment';
import { FoodBeverage } from './party-tabs/FoodBeverage';
import { Posts } from './party-tabs/Posts';
import { GuestCount } from './GuestCount';

interface Party {
  id: string;
  title: string;
  description: string;
  address: string;
  schedule: string;
  entry_instructions: string;
  is_date_fixed: boolean;
  fixed_date: string | null;
  created_by: string;
  cancelled_at: string | null;
  banner_url: string | null;
  icon_url: string | null;
  chat_url: string | null;
}

interface PartyDetailProps {
  partyId: string;
  onBack: () => void;
  onDelete: () => void;
}

type Tab = 'guests' | 'carshare' | 'equipment' | 'food' | 'posts';

export function PartyDetail({ partyId, onBack, onDelete }: PartyDetailProps) {
  const [party, setParty] = useState<Party | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('guests');
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [confirmedGuests, setConfirmedGuests] = useState<{ user_id: string }[] | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [inviteCode, setInviteCode] = useState<string>('');
  const [copiedPartyLink, setCopiedPartyLink] = useState(false);
  const [editingChat, setEditingChat] = useState(false);
  const [chatDraft, setChatDraft] = useState('');
  const [savingChat, setSavingChat] = useState(false);
  const [showCalendarMenu, setShowCalendarMenu] = useState(false);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const iconInputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();

  useEffect(() => {
    loadParty();
  }, [partyId]);

  useEffect(() => {
    if (party && user && party.created_by === user.id) {
      loadInviteCode();
    }
  }, [partyId, user?.id, party?.created_by]);

  const loadInviteCode = async () => {
    if (!user) return;
    try {
      const { data: existing } = await supabase
        .from('invite_codes')
        .select('code')
        .eq('created_by', user.id)
        .order('created_at', { ascending: false })
        .limit(1);

      if (existing && existing.length > 0) {
        setInviteCode(existing[0].code);
        return;
      }

      const newCode = Math.random().toString(36).substring(2, 10).toUpperCase();
      await supabase.from('invite_codes').upsert(
        { code: newCode, created_by: user.id },
        { onConflict: 'created_by', ignoreDuplicates: true }
      );
      const { data: final } = await supabase
        .from('invite_codes')
        .select('code')
        .eq('created_by', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      if (final) setInviteCode(final.code);
    } catch (e) {
      console.error('Error loading invite code:', e);
    }
  };

  const loadParty = async () => {
    try {
      const { data, error } = await supabase
        .from('parties')
        .select('*')
        .eq('id', partyId)
        .maybeSingle();

      if (error) throw error;
      setParty(data);
    } catch (error) {
      console.error('Error loading party:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Date TBD';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const openMaps = (service: 'google' | 'waze') => {
    if (!party?.address) return;
    const encoded = encodeURIComponent(party.address);
    const url =
      service === 'google'
        ? `https://www.google.com/maps/search/?api=1&query=${encoded}`
        : `https://waze.com/ul?q=${encoded}`;
    window.open(url, '_blank');
  };

  // Ouvre le modal et vérifie si des invités ont confirmé (hors créateur)
  const openCancelModal = async () => {
    setShowCancelModal(true);
    setConfirmedGuests(null);
    const { data } = await supabase
      .from('party_guests')
      .select('user_id')
      .eq('party_id', partyId)
      .eq('status', 'confirmed')
      .neq('user_id', user!.id);
    setConfirmedGuests(data || []);
  };

  const handleCancelOrDelete = async () => {
    if (!party || !user) return;
    setCancelling(true);
    try {
      if (confirmedGuests && confirmedGuests.length > 0) {
        // Soft-cancel : marquer annulée + notifier les invités
        const { error } = await supabase
          .from('parties')
          .update({ cancelled_at: new Date().toISOString() })
          .eq('id', partyId);
        if (error) throw error;

        await Promise.allSettled(
          confirmedGuests.map((g) =>
            sendRemoteNotification(
              g.user_id,
              '❌ Soirée annulée',
              `"${party.title}" a ete annulee par l'organisateur.`,
              { partyId: party.id }
            )
          )
        );

        setParty((prev) => (prev ? { ...prev, cancelled_at: new Date().toISOString() } : null));
        setShowCancelModal(false);
      } else {
        // Hard-delete : aucun invité confirmé
        const { error } = await supabase.from('parties').delete().eq('id', partyId);
        if (error) throw error;
        setShowCancelModal(false);
        onDelete();
      }
    } catch (error) {
      console.error('Error cancelling/deleting party:', error);
      alert('Une erreur est survenue. Reessaie.');
    } finally {
      setCancelling(false);
    }
  };

  const sharePartyInvite = async () => {
    if (!party) return;
    const base = window.location.origin;
    const link = isCreator && inviteCode
      ? `${base}?invite=${inviteCode}&join_party=${party.id}`
      : `${base}?join_party=${party.id}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Invitation : ${party.title}`,
          text: `Tu es invité(e) à "${party.title}" sur PartySync !`,
          url: link,
        });
      } catch {
        // user cancelled
      }
    } else {
      navigator.clipboard.writeText(link);
      setCopiedPartyLink(true);
      setTimeout(() => setCopiedPartyLink(false), 2000);
    }
  };

  const handleMediaUpload = async (file: File, type: 'banner' | 'icon') => {
    if (!party || !user) return;
    try {
      const oldUrl = type === 'banner' ? party.banner_url : party.icon_url;
      const newUrl = await uploadPartyMedia(file, user.id, type);
      await supabase.from('parties').update({ [`${type}_url`]: newUrl }).eq('id', partyId);
      if (oldUrl) deletePartyMedia(oldUrl);
      setParty((prev) => prev ? { ...prev, [`${type}_url`]: newUrl } : null);
    } catch (e) {
      console.error('Upload error:', e);
    }
  };

  const handleMediaRemove = async (type: 'banner' | 'icon') => {
    if (!party) return;
    const oldUrl = type === 'banner' ? party.banner_url : party.icon_url;
    await supabase.from('parties').update({ [`${type}_url`]: null }).eq('id', partyId);
    if (oldUrl) deletePartyMedia(oldUrl);
    setParty((prev) => prev ? { ...prev, [`${type}_url`]: null } : null);
  };

  const saveChatUrl = async () => {
    if (!party) return;
    setSavingChat(true);
    const url = chatDraft.trim() || null;
    await supabase.from('parties').update({ chat_url: url }).eq('id', partyId);
    setParty((prev) => prev ? { ...prev, chat_url: url } : null);
    setSavingChat(false);
    setEditingChat(false);
  };

  const getCalendarEvent = () => {
    if (!party?.fixed_date) return null;
    return {
      title: party.title,
      description: party.description || undefined,
      location: party.address || undefined,
      startDate: new Date(party.fixed_date),
    };
  };

  const isCreator = user?.id === party?.created_by;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
      </div>
    );
  }

  if (!party) {
    return (
      <div className="text-center py-12">
        <p className="text-neutral-400">Party not found</p>
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={onBack}
        className="flex items-center space-x-2 text-neutral-400 hover:text-white mb-6 transition"
      >
        <ArrowLeft className="w-5 h-5" />
        <span>Back to Parties</span>
      </button>

      <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">

        {/* Banner */}
        <div className="relative">
          {party.banner_url ? (
            <div className="relative h-48 w-full">
              <img src={party.banner_url} alt="" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-b from-transparent to-neutral-900/80" />
              {isCreator && !party.cancelled_at && (
                <div className="absolute top-2 right-2 flex gap-1">
                  <button
                    onClick={() => bannerInputRef.current?.click()}
                    className="p-1.5 bg-black/50 hover:bg-black/70 rounded-lg text-white transition"
                    title="Changer la bannière"
                  >
                    <ImagePlus className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleMediaRemove('banner')}
                    className="p-1.5 bg-black/50 hover:bg-black/70 rounded-lg text-white transition"
                    title="Supprimer la bannière"
                  >
                    <XIcon className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          ) : isCreator && !party.cancelled_at ? (
            <button
              onClick={() => bannerInputRef.current?.click()}
              className="w-full h-16 flex items-center justify-center gap-2 text-neutral-600 hover:text-neutral-400 hover:bg-neutral-800/50 transition text-sm border-b border-neutral-800"
            >
              <ImagePlus className="w-4 h-4" />
              Ajouter une bannière
            </button>
          ) : null}
          <input
            ref={bannerInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleMediaUpload(e.target.files[0], 'banner')}
          />
        </div>

        <div className="p-6 border-b border-neutral-800">
          {party.cancelled_at && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-5 flex items-center gap-3">
              <XCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
              <div>
                <p className="text-red-400 font-semibold">Soirée annulée</p>
                <p className="text-neutral-400 text-sm">
                  Annulée le{' '}
                  {new Date(party.cancelled_at).toLocaleDateString('fr-FR', {
                    day: 'numeric', month: 'long', year: 'numeric',
                  })}
                </p>
              </div>
            </div>
          )}

          <div className="flex items-start justify-between mb-4">
            <div className="flex-1 flex items-start gap-3">
              {/* Icon */}
              <div className="relative flex-shrink-0">
                {party.icon_url ? (
                  <div className="relative">
                    <img
                      src={party.icon_url}
                      alt=""
                      className={`w-14 h-14 rounded-2xl object-cover ${party.banner_url ? '-mt-10 border-2 border-neutral-900' : ''}`}
                    />
                    {isCreator && !party.cancelled_at && (
                      <button
                        onClick={() => handleMediaRemove('icon')}
                        className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center"
                      >
                        <XIcon className="w-2.5 h-2.5 text-white" />
                      </button>
                    )}
                  </div>
                ) : isCreator && !party.cancelled_at ? (
                  <button
                    onClick={() => iconInputRef.current?.click()}
                    className="w-12 h-12 rounded-2xl border-2 border-dashed border-neutral-700 hover:border-orange-500 flex items-center justify-center transition"
                    title="Ajouter une icône"
                  >
                    <Smile className="w-5 h-5 text-neutral-500" />
                  </button>
                ) : null}
                <input
                  ref={iconInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleMediaUpload(e.target.files[0], 'icon')}
                />
              </div>

              <div className="flex-1">
                <h1 className={`text-2xl sm:text-3xl font-bold mb-2 ${party.cancelled_at ? 'text-neutral-400 line-through' : 'text-white'}`}>{party.title}</h1>
                <div className="flex items-center space-x-3">
                  {!party.is_date_fixed && (
                    <span className="inline-block px-3 py-1 bg-orange-500/20 text-orange-400 text-sm rounded-full">
                      Date voting open
                    </span>
                  )}
                  <GuestCount partyId={partyId} />
                </div>
              </div>
            </div>

            {isCreator && !party.cancelled_at && (
              <button
                onClick={openCancelModal}
                className="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition flex-shrink-0"
                title="Annuler la soirée"
              >
                <Ban className="w-5 h-5" />
              </button>
            )}
          </div>

          {party.description && (
            <p className="text-neutral-300 mb-6">{party.description}</p>
          )}

          {!party.cancelled_at && (
            <div className="mb-4">
              <button
                onClick={sharePartyInvite}
                className="flex items-center gap-2 px-4 py-2 bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 border border-orange-500/20 rounded-xl transition text-sm font-medium"
              >
                {copiedPartyLink ? <Check className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
                <span>{copiedPartyLink ? 'Lien copié !' : "Partager l'invitation"}</span>
              </button>
            </div>
          )}

          {/* Chat group link */}
          {(party.chat_url || (isCreator && !party.cancelled_at)) && (
            <div className="mb-6">
              {editingChat ? (
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={chatDraft}
                    onChange={(e) => setChatDraft(e.target.value)}
                    placeholder="https://chat.whatsapp.com/..."
                    autoFocus
                    className="flex-1 px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm placeholder-neutral-500 focus:outline-none focus:border-orange-500"
                  />
                  <button
                    onClick={saveChatUrl}
                    disabled={savingChat}
                    className="px-3 py-2 bg-orange-500 text-white rounded-lg text-sm hover:bg-orange-600 transition disabled:opacity-50"
                  >
                    {savingChat ? '...' : 'OK'}
                  </button>
                  <button
                    onClick={() => setEditingChat(false)}
                    className="px-3 py-2 bg-neutral-800 text-neutral-300 rounded-lg text-sm hover:bg-neutral-700 transition"
                  >
                    <XIcon className="w-4 h-4" />
                  </button>
                </div>
              ) : party.chat_url ? (
                <div className="flex items-center gap-2">
                  <a
                    href={party.chat_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-4 py-2 bg-green-500/10 text-green-400 hover:bg-green-500/20 border border-green-500/20 rounded-xl transition text-sm font-medium"
                  >
                    <MessageCircle className="w-4 h-4" />
                    {detectChatPlatform(party.chat_url) === 'whatsapp' && 'Rejoindre le groupe WhatsApp'}
                    {detectChatPlatform(party.chat_url) === 'telegram' && 'Rejoindre le groupe Telegram'}
                    {detectChatPlatform(party.chat_url) === 'signal' && 'Rejoindre le groupe Signal'}
                    {detectChatPlatform(party.chat_url) === 'discord' && 'Rejoindre le Discord'}
                    {detectChatPlatform(party.chat_url) === 'other' && 'Rejoindre le groupe'}
                  </a>
                  {isCreator && !party.cancelled_at && (
                    <button
                      onClick={() => { setChatDraft(party.chat_url || ''); setEditingChat(true); }}
                      className="p-2 text-neutral-500 hover:text-white hover:bg-neutral-800 rounded-lg transition text-xs"
                    >
                      Modifier
                    </button>
                  )}
                </div>
              ) : isCreator ? (
                <button
                  onClick={() => { setChatDraft(''); setEditingChat(true); }}
                  className="flex items-center gap-2 px-4 py-2 border border-dashed border-neutral-700 text-neutral-500 hover:text-neutral-300 hover:border-neutral-500 rounded-xl transition text-sm"
                >
                  <MessageCircle className="w-4 h-4" />
                  Ajouter un lien de groupe (WhatsApp, Telegram…)
                </button>
              ) : null}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div className="flex items-start">
                {party.is_date_fixed ? (
                  <Calendar className="w-5 h-5 text-orange-500 mr-3 mt-0.5 flex-shrink-0" />
                ) : (
                  <Clock className="w-5 h-5 text-orange-500 mr-3 mt-0.5 flex-shrink-0" />
                )}
                <div>
                  <div className="text-sm text-neutral-500 mb-1">
                    {party.is_date_fixed ? 'Date & Time' : 'Vote for Date'}
                  </div>
                  <div className="text-white">{formatDate(party.fixed_date)}</div>

                  {party.is_date_fixed && party.fixed_date && !party.cancelled_at && (
                    <div className="mt-2">
                      <button
                        onClick={() => setShowCalendarMenu((v) => !v)}
                        className="flex items-center gap-1.5 text-xs text-orange-400 hover:text-orange-300 transition"
                      >
                        <CalendarPlus className="w-3.5 h-3.5" />
                        <span>Ajouter à l'agenda</span>
                      </button>

                      {showCalendarMenu && (
                        <div className="mt-2 flex flex-col gap-1.5">
                          <a
                            href={getGoogleCalendarUrl(getCalendarEvent()!)}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => setShowCalendarMenu(false)}
                            className="flex items-center gap-2 px-3 py-2 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded-lg text-sm text-white transition"
                          >
                            <span className="text-base">📅</span>
                            Google Calendar
                          </a>
                          <button
                            onClick={() => { downloadICS(getCalendarEvent()!); setShowCalendarMenu(false); }}
                            className="flex items-center gap-2 px-3 py-2 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded-lg text-sm text-white transition text-left"
                          >
                            <span className="text-base">🍎</span>
                            Apple Calendar / iCal (.ics)
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {party.address && (
                <div className="flex items-start">
                  <MapPin className="w-5 h-5 text-orange-500 mr-3 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <div className="text-sm text-neutral-500 mb-1">Location</div>
                    <div className="text-white mb-2">{party.address}</div>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => openMaps('google')}
                        className="text-xs text-orange-400 hover:text-orange-300 flex items-center space-x-1"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span>Google Maps</span>
                      </button>
                      <span className="text-neutral-600">•</span>
                      <button
                        onClick={() => openMaps('waze')}
                        className="text-xs text-orange-400 hover:text-orange-300 flex items-center space-x-1"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span>Waze</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-3">
              {party.schedule && (
                <div>
                  <div className="text-sm text-neutral-500 mb-1">Schedule</div>
                  <div className="text-white whitespace-pre-line">{party.schedule}</div>
                </div>
              )}

              {party.entry_instructions && (
                <div>
                  <div className="text-sm text-neutral-500 mb-1">Entry Instructions</div>
                  <div className="text-white whitespace-pre-line">{party.entry_instructions}</div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="border-b border-neutral-800 overflow-x-auto scrollbar-none">
          <div className="flex min-w-max">
            <button
              onClick={() => setActiveTab('posts')}
              className={`shrink-0 flex items-center space-x-2 px-4 py-3.5 font-medium transition ${
                activeTab === 'posts'
                  ? 'text-orange-500 border-b-2 border-orange-500'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <MessageSquare className="w-4 h-4" />
              <span>Posts</span>
            </button>
            <button
              onClick={() => setActiveTab('guests')}
              className={`shrink-0 flex items-center space-x-2 px-4 py-3.5 font-medium transition ${
                activeTab === 'guests'
                  ? 'text-orange-500 border-b-2 border-orange-500'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Guests</span>
            </button>
            <button
              onClick={() => setActiveTab('carshare')}
              className={`shrink-0 flex items-center space-x-2 px-4 py-3.5 font-medium transition ${
                activeTab === 'carshare'
                  ? 'text-orange-500 border-b-2 border-orange-500'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <Car className="w-4 h-4" />
              <span>Car Sharing</span>
            </button>
            <button
              onClick={() => setActiveTab('equipment')}
              className={`shrink-0 flex items-center space-x-2 px-4 py-3.5 font-medium transition ${
                activeTab === 'equipment'
                  ? 'text-orange-500 border-b-2 border-orange-500'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <Wrench className="w-4 h-4" />
              <span>Equipment</span>
            </button>
            <button
              onClick={() => setActiveTab('food')}
              className={`shrink-0 flex items-center space-x-2 px-4 py-3.5 font-medium transition ${
                activeTab === 'food'
                  ? 'text-orange-500 border-b-2 border-orange-500'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <UtensilsCrossed className="w-4 h-4" />
              <span>Food & Drinks</span>
            </button>
          </div>
        </div>

        <div className="p-6">
          {activeTab === 'guests' && (
            <GuestList
              partyId={partyId}
              creatorId={party.created_by}
              partyTitle={party.title}
              partyDate={party.fixed_date}
              partyAddress={party.address || undefined}
              partyDescription={party.description || undefined}
              partyDateFixed={party.is_date_fixed}
            />
          )}
          {activeTab === 'carshare' && <CarSharing partyId={partyId} />}
          {activeTab === 'equipment' && <Equipment partyId={partyId} creatorId={party.created_by} />}
          {activeTab === 'food' && <FoodBeverage partyId={partyId} creatorId={party.created_by} />}
          {activeTab === 'posts' && (
            <Posts partyId={partyId} creatorId={party.created_by} partyTitle={party.title} />
          )}
        </div>
      </div>

      {showCancelModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 max-w-md w-full">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-red-500/20 rounded-lg">
                <Ban className="w-6 h-6 text-red-400" />
              </div>
              <h3 className="text-xl font-bold text-white">Annuler la soirée</h3>
            </div>

            {confirmedGuests === null ? (
              <div className="flex items-center justify-center py-6">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500" />
              </div>
            ) : confirmedGuests.length > 0 ? (
              <p className="text-neutral-300 mb-6">
                <span className="text-orange-400 font-medium">
                  {confirmedGuests.length} invité{confirmedGuests.length > 1 ? 's' : ''}
                </span>{' '}
                {confirmedGuests.length > 1 ? 'ont' : 'a'} confirmé leur présence. La soirée sera{' '}
                <strong className="text-white">marquée comme annulée</strong> et ils recevront une notification.
                Elle disparaîtra automatiquement de la liste après la date prévue.
              </p>
            ) : (
              <p className="text-neutral-300 mb-6">
                Aucun invité n'a confirmé sa présence. La soirée sera{' '}
                <strong className="text-white">définitivement supprimée</strong>.
              </p>
            )}

            {confirmedGuests !== null && (
              <div className="flex gap-3">
                <button
                  onClick={() => setShowCancelModal(false)}
                  disabled={cancelling}
                  className="flex-1 px-4 py-2 bg-neutral-800 text-white rounded-lg hover:bg-neutral-700 transition disabled:opacity-50"
                >
                  Retour
                </button>
                <button
                  onClick={handleCancelOrDelete}
                  disabled={cancelling}
                  className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {cancelling ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                      <span>En cours...</span>
                    </>
                  ) : confirmedGuests.length > 0 ? (
                    <span>Confirmer l'annulation</span>
                  ) : (
                    <span>Supprimer</span>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
