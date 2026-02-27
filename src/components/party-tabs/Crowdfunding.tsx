import { useEffect, useState, useCallback } from 'react';
import { ExternalLink, Trash2, Check, X as XIcon } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { sendRemoteNotification } from '../../lib/remoteNotify';

// ============================
// Types
// ============================
interface CrowdfundParticipation {
  id: string;
  participant_id: string;
  amount: number;
  status: 'pending' | 'confirmed';
  profiles: { full_name: string | null; email: string };
}

interface CrowdfundItem {
  id: string;
  item_type: 'equipment' | 'food';
  item_id: string;
  item_name: string;
  quantity: number;
  people_covered: number;
  total_price: number;
}

interface Crowdfund {
  id: string;
  creator_id: string;
  participation_link: string | null;
  status: 'active' | 'cancelled';
  profiles: { full_name: string | null; email: string };
  crowdfund_items: CrowdfundItem[];
  crowdfund_participations: CrowdfundParticipation[];
}

interface CrowdfundingProps {
  partyId: string;
  creatorId: string;
  partyTitle: string;
}

// ============================
// Icon
// ============================
export function CrowdfundIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="8" cy="3" rx="2" ry="1" />
      <ellipse cx="12" cy="2" rx="2" ry="1" />
      <ellipse cx="16" cy="3" rx="2" ry="1" />
      <line x1="8" y1="4" x2="8" y2="7" />
      <line x1="12" y1="3" x2="12" y2="7" />
      <line x1="16" y1="4" x2="16" y2="7" />
      <path d="M4 9h16l-2 9H6L4 9z" />
      <path d="M2 9h20" />
    </svg>
  );
}

// ============================
// Helpers
// ============================
function isFunded(cf: Crowdfund): boolean {
  const total = cf.crowdfund_items.reduce((s, i) => s + i.total_price, 0);
  const confirmed = cf.crowdfund_participations
    .filter((p) => p.status === 'confirmed')
    .reduce((s, p) => s + p.amount, 0);
  return total > 0 && confirmed >= total;
}

function displayName(profile: { full_name: string | null; email: string }): string {
  return profile.full_name || profile.email;
}

const AVATAR_COLORS = [
  '#f97316', '#8b5cf6', '#06b6d4', '#10b981',
  '#f43f5e', '#3b82f6', '#eab308', '#ec4899',
];

function avatarColor(userId: string): string {
  let hash = 0;
  for (const c of userId) hash = (hash * 31 + c.charCodeAt(0)) & 0xffffffff;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

// ============================
// Popup shell
// ============================
function Popup({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 bg-neutral-950 flex flex-col">
      <div className="flex items-center gap-3 px-4 py-4 border-b border-neutral-800">
        <button onClick={onClose} className="text-neutral-400 hover:text-white transition text-2xl leading-none">
          ←
        </button>
        <h2 className="text-white font-semibold text-lg flex-1 truncate">{title}</h2>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-5">
        {children}
      </div>
    </div>
  );
}

// ============================
// ParticipatePopup
// ============================
interface ParticipatePopupProps {
  crowdfund: Crowdfund;
  onClose: () => void;
  onSaved: () => void;
}

function ParticipatePopup({ crowdfund, onClose, onSaved }: ParticipatePopupProps) {
  const { user } = useAuth();
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = crowdfund.crowdfund_items.reduce((s, i) => s + i.total_price, 0);
  const alreadyConfirmed = crowdfund.crowdfund_participations
    .filter((p) => p.status === 'confirmed')
    .reduce((s, p) => s + p.amount, 0);
  const remaining = Math.max(0, total - alreadyConfirmed);

  const handleSave = async () => {
    if (!user) return;
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { setError('Montant invalide.'); return; }
    setSaving(true);
    setError(null);
    try {
      const { error: e } = await supabase.from('crowdfund_participations').insert({
        crowdfund_id: crowdfund.id,
        participant_id: user.id,
        amount: amt,
        status: 'pending',
      });
      if (e) throw e;
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e.message || 'Erreur.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Popup title={`Participer à la cagnotte`} onClose={onClose}>
      {error && <p className="text-red-400 text-sm">{error}</p>}

      <div className="bg-neutral-800 rounded-xl p-4 space-y-2">
        <p className="text-sm text-neutral-400">Total cagnotte</p>
        <p className="text-white text-2xl font-bold">{total.toFixed(2)} €</p>
        {remaining < total && (
          <p className="text-sm text-orange-400">Reste à financer : {remaining.toFixed(2)} €</p>
        )}
      </div>

      <div className="space-y-1">
        <label className="block text-sm text-neutral-400">Combien souhaitez-vous contribuer ?</label>
        <input
          type="number"
          min="0.01"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Ex: 10"
          autoFocus
          className="w-full px-4 py-3 bg-neutral-900 border border-neutral-700 rounded-xl text-white placeholder-neutral-500 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition"
        />
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-semibold transition disabled:opacity-50"
      >
        {saving ? 'Enregistrement…' : 'Confirmer ma participation'}
      </button>
    </Popup>
  );
}

// ============================
// ParticipantActionPopup (creator view)
// ============================
interface ParticipantActionProps {
  participant: CrowdfundParticipation;
  crowdfund: Crowdfund;
  partyId: string;
  partyTitle: string;
  onClose: () => void;
  onSaved: () => void;
}

function ParticipantActionPopup({ participant, crowdfund, partyId, partyTitle, onClose, onSaved }: ParticipantActionProps) {
  const [saving, setSaving] = useState(false);

  const itemNames = crowdfund.crowdfund_items.map((i) => i.item_name).join(', ');

  const handleConfirm = async () => {
    setSaving(true);
    try {
      await supabase
        .from('crowdfund_participations')
        .update({ status: 'confirmed' })
        .eq('id', participant.id);
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleRemind = async () => {
    setSaving(true);
    try {
      await sendRemoteNotification(
        participant.participant_id,
        `💰 Rappel cagnotte — ${partyTitle}`,
        `Tu as promis ${participant.amount}€ — items : ${itemNames}`,
        { partyId, action: 'crowdfund_reminder', crowdfundId: crowdfund.id },
        `/party/${partyId}?tab=crowdfund`
      );
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-end justify-center p-4">
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-sm p-5 space-y-3">
        <div className="flex items-center justify-between mb-1">
          <p className="text-white font-semibold">{displayName(participant.profiles)}</p>
          <button onClick={onClose} className="text-neutral-400 hover:text-white">
            <XIcon className="w-5 h-5" />
          </button>
        </div>
        <p className="text-neutral-400 text-sm">
          Participation : <span className="text-white font-medium">{participant.amount.toFixed(2)} €</span>{' '}
          <span className={`text-xs px-2 py-0.5 rounded-full ${participant.status === 'confirmed' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
            {participant.status === 'confirmed' ? 'Confirmé' : 'En attente'}
          </span>
        </p>

        {participant.status !== 'confirmed' && (
          <button
            onClick={handleConfirm}
            disabled={saving}
            className="w-full py-3 bg-green-500/20 text-green-400 hover:bg-green-500/30 rounded-xl font-medium transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Check className="w-4 h-4" />
            Paiement reçu
          </button>
        )}

        <button
          onClick={handleRemind}
          disabled={saving}
          className="w-full py-3 bg-neutral-800 text-orange-400 hover:bg-neutral-700 rounded-xl font-medium transition disabled:opacity-50"
        >
          🔔 Rappeler le paiement
        </button>
      </div>
    </div>
  );
}

// ============================
// CrowdfundDetailPopup
// ============================
interface CrowdfundDetailPopupProps {
  crowdfund: Crowdfund;
  partyId: string;
  partyTitle: string;
  onClose: () => void;
  onUpdated: () => void;
}

function CrowdfundDetailPopup({ crowdfund, partyId, partyTitle, onClose, onUpdated }: CrowdfundDetailPopupProps) {
  const { user } = useAuth();
  const isCreator = user?.id === crowdfund.creator_id;
  const funded = isFunded(crowdfund);

  const [linkDraft, setLinkDraft] = useState(crowdfund.participation_link || '');
  const [savingLink, setSavingLink] = useState(false);
  const [editingItems, setEditingItems] = useState<Map<string, { qty: string; price: string }>>(new Map());
  const [selectedParticipant, setSelectedParticipant] = useState<CrowdfundParticipation | null>(null);
  const [showParticipate, setShowParticipate] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [savingItem, setSavingItem] = useState<string | null>(null);

  const myParticipation = crowdfund.crowdfund_participations.find((p) => p.participant_id === user?.id);
  const canParticipate = !isCreator && !myParticipation && crowdfund.status === 'active' && !funded;

  const total = crowdfund.crowdfund_items.reduce((s, i) => s + i.total_price, 0);
  const confirmedAmt = crowdfund.crowdfund_participations
    .filter((p) => p.status === 'confirmed')
    .reduce((s, p) => s + p.amount, 0);

  const saveLink = async () => {
    setSavingLink(true);
    try {
      await supabase
        .from('crowdfunds')
        .update({ participation_link: linkDraft.trim() || null })
        .eq('id', crowdfund.id);
      onUpdated();
    } finally {
      setSavingLink(false);
    }
  };

  const startEditItem = (item: CrowdfundItem) => {
    setEditingItems((prev) => {
      const next = new Map(prev);
      next.set(item.id, { qty: String(item.quantity), price: String(item.total_price) });
      return next;
    });
  };

  const saveItem = async (item: CrowdfundItem) => {
    const draft = editingItems.get(item.id);
    if (!draft) return;
    setSavingItem(item.id);
    try {
      await supabase
        .from('crowdfund_items')
        .update({
          quantity: parseFloat(draft.qty) || item.quantity,
          total_price: parseFloat(draft.price) || item.total_price,
        })
        .eq('id', item.id);
      setEditingItems((prev) => {
        const next = new Map(prev);
        next.delete(item.id);
        return next;
      });
      onUpdated();
    } finally {
      setSavingItem(null);
    }
  };

  const deleteItem = async (itemId: string) => {
    if (!window.confirm('Supprimer cet item de la cagnotte ?')) return;
    await supabase.from('crowdfund_items').delete().eq('id', itemId);
    onUpdated();
  };

  const cancelCrowdfund = async () => {
    if (!window.confirm('Annuler cette cagnotte ? Les participants seront notifiés.')) return;
    setCancelling(true);
    try {
      await supabase.from('crowdfunds').update({ status: 'cancelled' }).eq('id', crowdfund.id);
      // Notify all participants
      const itemNames = crowdfund.crowdfund_items.map((i) => i.item_name).join(', ');
      await Promise.allSettled(
        crowdfund.crowdfund_participations.map((p) =>
          sendRemoteNotification(
            p.participant_id,
            `❌ Cagnotte annulée — ${partyTitle}`,
            `La cagnotte pour "${itemNames}" a été annulée.`,
            { partyId, action: 'crowdfund_cancelled', crowdfundId: crowdfund.id },
            `/party/${partyId}?tab=crowdfund`
          )
        )
      );
      onUpdated();
      onClose();
    } finally {
      setCancelling(false);
    }
  };

  return (
    <Popup title={isCreator ? 'Ma cagnotte' : `Cagnotte de ${displayName(crowdfund.profiles)}`} onClose={onClose}>
      {/* Status badges */}
      <div className="flex flex-wrap gap-2">
        {funded && (
          <span className="px-3 py-1 bg-green-500/20 text-green-400 rounded-full text-sm font-medium">✅ Financé</span>
        )}
        {crowdfund.status === 'cancelled' && (
          <span className="px-3 py-1 bg-red-500/20 text-red-400 rounded-full text-sm font-medium">❌ Annulé</span>
        )}
      </div>

      {/* Progress */}
      {total > 0 && (
        <div className="bg-neutral-800 rounded-xl p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-neutral-400">Collecté (confirmé)</span>
            <span className="text-white font-semibold">{confirmedAmt.toFixed(2)} / {total.toFixed(2)} €</span>
          </div>
          <div className="w-full bg-neutral-700 rounded-full h-2">
            <div
              className="bg-orange-500 h-2 rounded-full transition-all"
              style={{ width: `${Math.min(100, total > 0 ? (confirmedAmt / total) * 100 : 0)}%` }}
            />
          </div>
        </div>
      )}

      {/* Participation link */}
      {isCreator ? (
        <div className="space-y-1">
          <label className="block text-sm text-neutral-400">Lien de participation (Leetchi, PayPal, etc.)</label>
          <div className="flex gap-2">
            <input
              type="url"
              value={linkDraft}
              onChange={(e) => setLinkDraft(e.target.value)}
              placeholder="https://..."
              className="flex-1 px-4 py-3 bg-neutral-900 border border-neutral-700 rounded-xl text-white placeholder-neutral-500 focus:outline-none focus:border-orange-500 transition"
            />
            <button
              onClick={saveLink}
              disabled={savingLink}
              className="px-4 py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-xl transition disabled:opacity-50"
            >
              {savingLink ? '…' : 'OK'}
            </button>
          </div>
        </div>
      ) : crowdfund.participation_link ? (
        <a
          href={crowdfund.participation_link}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-4 py-3 bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 border border-orange-500/20 rounded-xl transition text-sm font-medium"
        >
          <ExternalLink className="w-4 h-4" />
          Lien de participation
        </a>
      ) : null}

      {/* Participate button */}
      {canParticipate && (
        <button
          onClick={() => setShowParticipate(true)}
          className="w-full py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-semibold transition"
        >
          💰 Participer
        </button>
      )}

      {/* My participation info */}
      {myParticipation && (
        <div className="bg-neutral-800 rounded-xl p-4 flex items-center justify-between">
          <span className="text-neutral-400 text-sm">Ma participation</span>
          <div className="flex items-center gap-2">
            <span className="text-white font-semibold">{myParticipation.amount.toFixed(2)} €</span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${myParticipation.status === 'confirmed' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
              {myParticipation.status === 'confirmed' ? 'Confirmé' : 'En attente'}
            </span>
          </div>
        </div>
      )}

      {/* Items list */}
      <div className="space-y-2">
        <h3 className="text-sm text-neutral-400 font-medium">Items</h3>
        {crowdfund.crowdfund_items.length === 0 ? (
          <p className="text-neutral-500 text-sm py-4 text-center">Aucun item</p>
        ) : (
          crowdfund.crowdfund_items.map((item) => {
            const draft = editingItems.get(item.id);
            const isSaving = savingItem === item.id;
            return (
              <div key={item.id} className="bg-neutral-800 rounded-xl p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="text-base">{item.item_type === 'equipment' ? '🔧' : '🍕'}</span>
                    <span className="text-white font-medium truncate">{item.item_name}</span>
                  </div>
                  {isCreator && crowdfund.status === 'active' && !funded && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {draft ? (
                        <button
                          onClick={() => saveItem(item)}
                          disabled={isSaving}
                          className="p-1.5 text-green-400 hover:bg-green-500/20 rounded-lg transition"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                      ) : (
                        <button
                          onClick={() => startEditItem(item)}
                          className="p-1.5 text-neutral-400 hover:text-white hover:bg-neutral-700 rounded-lg transition text-xs"
                        >
                          ✏️
                        </button>
                      )}
                      <button
                        onClick={() => deleteItem(item.id)}
                        className="p-1.5 text-red-400 hover:bg-red-500/20 rounded-lg transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
                {draft ? (
                  <div className="flex gap-2">
                    <div className="flex-1 space-y-1">
                      <label className="text-xs text-neutral-500">Quantité</label>
                      <input
                        type="number"
                        min="0.01"
                        step="any"
                        value={draft.qty}
                        onChange={(e) => setEditingItems((prev) => {
                          const next = new Map(prev);
                          next.set(item.id, { ...draft, qty: e.target.value });
                          return next;
                        })}
                        className="w-full px-3 py-2 bg-neutral-900 border border-neutral-700 rounded-lg text-white text-sm focus:outline-none focus:border-orange-500"
                      />
                    </div>
                    <div className="flex-1 space-y-1">
                      <label className="text-xs text-neutral-500">Prix total (€)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={draft.price}
                        onChange={(e) => setEditingItems((prev) => {
                          const next = new Map(prev);
                          next.set(item.id, { ...draft, price: e.target.value });
                          return next;
                        })}
                        className="w-full px-3 py-2 bg-neutral-900 border border-neutral-700 rounded-lg text-white text-sm focus:outline-none focus:border-orange-500"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-4 text-sm text-neutral-400">
                    <span>Qté : <span className="text-white">{item.quantity}</span></span>
                    {item.item_type === 'food' && item.people_covered > 0 && (
                      <span>Pour : <span className="text-white">{item.people_covered} pers.</span></span>
                    )}
                    <span>Prix : <span className="text-orange-400 font-semibold">{item.total_price.toFixed(2)} €</span></span>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Participants */}
      <div className="space-y-2">
        <h3 className="text-sm text-neutral-400 font-medium">Participants ({crowdfund.crowdfund_participations.length})</h3>
        {crowdfund.crowdfund_participations.length === 0 ? (
          <p className="text-neutral-500 text-sm py-2 text-center">Aucun participant pour l'instant</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {crowdfund.crowdfund_participations.map((p) => (
              <button
                key={p.id}
                onClick={() => isCreator && setSelectedParticipant(p)}
                disabled={!isCreator}
                title={`${displayName(p.profiles)} — ${p.amount.toFixed(2)} € (${p.status})`}
                style={{ backgroundColor: avatarColor(p.participant_id) }}
                className="relative w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold border-2 border-neutral-900 transition hover:opacity-80 disabled:cursor-default"
              >
                {displayName(p.profiles).charAt(0).toUpperCase()}
                {p.status === 'confirmed' && (
                  <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
                    <Check className="w-2.5 h-2.5 text-white" />
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Cancel crowdfund (creator only) */}
      {isCreator && crowdfund.status === 'active' && (
        <button
          onClick={cancelCrowdfund}
          disabled={cancelling}
          className="w-full py-3 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-xl font-medium transition disabled:opacity-50"
        >
          {cancelling ? 'Annulation…' : 'Annuler la cagnotte'}
        </button>
      )}

      {/* Sub-popups */}
      {showParticipate && (
        <ParticipatePopup
          crowdfund={crowdfund}
          onClose={() => setShowParticipate(false)}
          onSaved={() => { setShowParticipate(false); onUpdated(); }}
        />
      )}

      {selectedParticipant && (
        <ParticipantActionPopup
          participant={selectedParticipant}
          crowdfund={crowdfund}
          partyId={partyId}
          partyTitle={partyTitle}
          onClose={() => setSelectedParticipant(null)}
          onSaved={() => { setSelectedParticipant(null); onUpdated(); }}
        />
      )}
    </Popup>
  );
}

// ============================
// Main component
// ============================
export function Crowdfunding({ partyId, creatorId, partyTitle }: CrowdfundingProps) {
  const { user } = useAuth();
  const [crowdfunds, setCrowdfunds] = useState<Crowdfund[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCrowdfund, setSelectedCrowdfund] = useState<Crowdfund | null>(null);

  const loadCrowdfunds = useCallback(async () => {
    const { data, error } = await supabase
      .from('crowdfunds')
      .select(`
        id, creator_id, participation_link, status,
        profiles(full_name, email),
        crowdfund_items(id, item_type, item_id, item_name, quantity, people_covered, total_price),
        crowdfund_participations(id, participant_id, amount, status, profiles(full_name, email))
      `)
      .eq('party_id', partyId)
      .order('created_at', { ascending: true });

    if (error) { console.error(error); return; }

    const all = (data as Crowdfund[]) || [];
    // Sort: current user's crowdfund first
    all.sort((a, b) => {
      if (a.creator_id === user?.id) return -1;
      if (b.creator_id === user?.id) return 1;
      return 0;
    });
    setCrowdfunds(all);
  }, [partyId, user?.id]);

  useEffect(() => {
    setLoading(true);
    loadCrowdfunds().finally(() => setLoading(false));
  }, [loadCrowdfunds]);

  const handleUpdated = async () => {
    await loadCrowdfunds();
    // Refresh selected crowdfund from updated list
    if (selectedCrowdfund) {
      const fresh = await supabase
        .from('crowdfunds')
        .select(`
          id, creator_id, participation_link, status,
          profiles(full_name, email),
          crowdfund_items(id, item_type, item_id, item_name, quantity, people_covered, total_price),
          crowdfund_participations(id, participant_id, amount, status, profiles(full_name, email))
        `)
        .eq('id', selectedCrowdfund.id)
        .maybeSingle();
      if (fresh.data) setSelectedCrowdfund(fresh.data as Crowdfund);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="animate-pulse bg-neutral-800/70 h-16 rounded-xl" />
        <div className="animate-pulse bg-neutral-800/70 h-16 rounded-xl" />
      </div>
    );
  }

  const activeCrowdfunds = crowdfunds.filter((cf) => cf.status !== 'cancelled');
  const cancelledCrowdfunds = crowdfunds.filter((cf) => cf.status === 'cancelled');

  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-400">
        Crée une cagnotte en ajoutant des items depuis l'onglet Équipement ou Food &amp; Drinks.
      </p>

      {crowdfunds.length === 0 ? (
        <p className="text-neutral-500 text-center py-12">Aucune cagnotte pour cette soirée</p>
      ) : (
        <>
          {activeCrowdfunds.map((cf) => {
            const funded = isFunded(cf);
            const total = cf.crowdfund_items.reduce((s, i) => s + i.total_price, 0);
            const confirmed = cf.crowdfund_participations
              .filter((p) => p.status === 'confirmed')
              .reduce((s, p) => s + p.amount, 0);
            const equipItems = cf.crowdfund_items.filter((i) => i.item_type === 'equipment').slice(0, 3);
            const foodItems = cf.crowdfund_items.filter((i) => i.item_type === 'food').slice(0, 3);

            return (
              <button
                key={cf.id}
                onClick={() => setSelectedCrowdfund(cf)}
                className="w-full text-left bg-neutral-800 rounded-xl p-4 hover:bg-neutral-700/80 transition space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div
                      style={{ backgroundColor: avatarColor(cf.creator_id) }}
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                    >
                      {displayName(cf.profiles).charAt(0).toUpperCase()}
                    </div>
                    <span className="text-white font-medium truncate">
                      {cf.creator_id === user?.id ? 'Ma cagnotte' : displayName(cf.profiles)}
                    </span>
                    {funded && (
                      <span className="text-xs px-2 py-0.5 bg-green-500/20 text-green-400 rounded-full flex-shrink-0">✅ Financé</span>
                    )}
                  </div>
                  <div className="text-sm text-orange-400 font-semibold flex-shrink-0">
                    {confirmed.toFixed(0)}/{total.toFixed(0)} €
                  </div>
                </div>

                {/* Item icons */}
                {(equipItems.length > 0 || foodItems.length > 0) && (
                  <div className="flex flex-wrap gap-1 text-xs text-neutral-400">
                    {equipItems.map((i) => <span key={i.id} title={i.item_name}>🔧 {i.item_name}</span>)}
                    {foodItems.map((i) => <span key={i.id} title={i.item_name}>🍕 {i.item_name}</span>)}
                  </div>
                )}

                {/* Participant avatars */}
                {cf.crowdfund_participations.length > 0 && (
                  <div className="flex items-center gap-1">
                    {cf.crowdfund_participations.slice(0, 5).map((p, i) => (
                      <div
                        key={p.id}
                        title={displayName(p.profiles)}
                        style={{
                          backgroundColor: avatarColor(p.participant_id),
                          marginLeft: i > 0 ? '-6px' : '0',
                          zIndex: 5 - i,
                        }}
                        className="relative w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold border-2 border-neutral-800"
                      >
                        {displayName(p.profiles).charAt(0).toUpperCase()}
                      </div>
                    ))}
                    {cf.crowdfund_participations.length > 5 && (
                      <span className="text-xs text-neutral-500 ml-1">+{cf.crowdfund_participations.length - 5}</span>
                    )}
                  </div>
                )}
              </button>
            );
          })}

          {cancelledCrowdfunds.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-neutral-500 uppercase tracking-wide">Annulées</p>
              {cancelledCrowdfunds.map((cf) => (
                <button
                  key={cf.id}
                  onClick={() => setSelectedCrowdfund(cf)}
                  className="w-full text-left bg-neutral-800/50 rounded-xl p-4 hover:bg-neutral-700/50 transition opacity-60"
                >
                  <div className="flex items-center gap-2">
                    <div
                      style={{ backgroundColor: avatarColor(cf.creator_id) }}
                      className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                    >
                      {displayName(cf.profiles).charAt(0).toUpperCase()}
                    </div>
                    <span className="text-neutral-400 truncate">{displayName(cf.profiles)}</span>
                    <span className="text-xs px-2 py-0.5 bg-red-500/20 text-red-400 rounded-full">❌ Annulé</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {selectedCrowdfund && (
        <CrowdfundDetailPopup
          crowdfund={selectedCrowdfund}
          partyId={partyId}
          partyTitle={partyTitle}
          onClose={() => setSelectedCrowdfund(null)}
          onUpdated={handleUpdated}
        />
      )}
    </div>
  );
}
