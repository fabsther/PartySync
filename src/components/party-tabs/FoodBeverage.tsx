import { useEffect, useState, useCallback, useRef } from 'react';
import { Plus, Pencil } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

// ============================
// Types
// ============================
interface Profile {
  full_name: string | null;
  email: string;
}

interface FoodContribution {
  id: string;
  user_id: string;
  quantity: number;        // quantity_brought (column name: quantity)
  people_covered: number;
  profiles: Profile;
}

interface FoodItem {
  id: string;
  name: string;
  created_by: string | null;
  food_contributions: FoodContribution[];
}

interface FoodBeverageProps {
  partyId: string;
  creatorId: string;
}

// ============================
// Autocomplete suggestions
// ============================
const STATIC_SUGGESTIONS = [
  'Bière', 'Vin', 'Champagne', 'Coca', 'Eau', 'Jus de fruits',
  'Pizza', 'Chips', 'Burgers', 'Hot Dogs', 'Saucisses', 'Salade',
  'Plateau de fromages', 'Gâteau', 'Sushi', 'Tacos', 'Pâtes',
];

// ============================
// Colors
// ============================
const AVATAR_COLORS = [
  '#f97316', '#8b5cf6', '#06b6d4', '#10b981',
  '#f43f5e', '#3b82f6', '#eab308', '#ec4899',
];

function avatarColor(userId: string): string {
  let hash = 0;
  for (const c of userId) hash = (hash * 31 + c.charCodeAt(0)) & 0xffffffff;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function avatarLabel(profile: Profile): string {
  const name = profile.full_name || profile.email;
  return name.charAt(0).toUpperCase();
}

function computeCoverageColor(ratio: number): string {
  if (ratio <= 0) return '#ef4444'; // rouge vif
  if (ratio >= 1) return ratio > 1 ? '#22c55e' : '#ffffff'; // vert ou blanc
  // interpolation rouge → blanc
  const r = Math.round(239 + (255 - 239) * ratio);
  const g = Math.round(68 + (255 - 68) * ratio);
  const b = Math.round(68 + (255 - 68) * ratio);
  return `rgb(${r},${g},${b})`;
}

// ============================
// Avatar stack
// ============================
function AvatarStack({ contributions }: { contributions: FoodContribution[] }) {
  const active = contributions.filter((c) => c.quantity > 0);
  const shown = active.slice(0, 4);
  const extra = active.length - shown.length;
  if (active.length === 0) return null;
  return (
    <div className="flex items-center">
      {shown.map((c, i) => (
        <div
          key={c.id}
          title={c.profiles.full_name || c.profiles.email}
          style={{
            backgroundColor: avatarColor(c.user_id),
            marginLeft: i > 0 ? '-6px' : '0',
            zIndex: shown.length - i,
          }}
          className="relative w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold border-2 border-neutral-900 flex-shrink-0"
        >
          {avatarLabel(c.profiles)}
        </div>
      ))}
      {extra > 0 && (
        <div
          style={{ marginLeft: '-6px', zIndex: 0 }}
          className="relative w-7 h-7 rounded-full bg-neutral-700 flex items-center justify-center text-white text-xs font-bold border-2 border-neutral-900 flex-shrink-0"
        >
          +{extra}
        </div>
      )}
    </div>
  );
}

// ============================
// Full-screen popup base
// ============================
function Popup({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 bg-neutral-950 flex flex-col">
      <div className="flex items-center gap-3 px-4 py-4 border-b border-neutral-800">
        <button onClick={onClose} className="text-neutral-400 hover:text-white transition text-2xl leading-none">
          ←
        </button>
        <h2 className="text-white font-semibold text-lg">{title}</h2>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-5">
        {children}
      </div>
    </div>
  );
}

// ============================
// Field components
// ============================
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block text-sm text-neutral-400">{label}</label>
      {children}
    </div>
  );
}

const inputCls =
  'w-full px-4 py-3 bg-neutral-900 border border-neutral-700 rounded-xl text-white placeholder-neutral-500 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition';
const disabledCls =
  'w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-xl text-neutral-500';

// ============================
// AddItemPopup
// ============================
interface AddItemPopupProps {
  partyId: string;
  creatorId: string;
  existingNames: string[];
  onClose: () => void;
  onSaved: () => void;
}

function AddItemPopup({ partyId, creatorId, existingNames, onClose, onSaved }: AddItemPopupProps) {
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [peopleCovered, setPeopleCovered] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isOwner = user?.id === creatorId;

  const updateSuggestions = (val: string) => {
    if (!val.trim()) { setSuggestions([]); return; }
    const lower = val.toLowerCase();
    const all = [...new Set([...STATIC_SUGGESTIONS, ...existingNames])];
    setSuggestions(all.filter((s) => s.toLowerCase().includes(lower) && s.toLowerCase() !== lower).slice(0, 6));
  };

  const qty = parseFloat(quantity) || 0;

  const handleSave = async () => {
    if (!user) return;
    if (!name.trim()) { setError('Nom requis.'); return; }
    if (!isOwner && qty < 1) { setError('Tu dois apporter au moins 1 unité.'); return; }
    setSaving(true);
    setError(null);
    try {
      const { data: item, error: itemErr } = await supabase
        .from('food_items')
        .insert({ party_id: partyId, name: name.trim(), created_by: user.id })
        .select('id')
        .single();
      if (itemErr) throw itemErr;

      if (qty > 0) {
        const pc = parseFloat(peopleCovered) || 0;
        const { error: contribErr } = await supabase.from('food_contributions').insert({
          food_item_id: item.id,
          user_id: user.id,
          quantity: qty,
          people_covered: pc,
        });
        if (contribErr) throw contribErr;
      }
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e.message || 'Erreur lors de la sauvegarde.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Popup title="Ajouter un item" onClose={onClose}>
      {error && <p className="text-red-400 text-sm">{error}</p>}

      <Field label="Nom">
        <div className="relative">
          <input
            className={inputCls}
            value={name}
            onChange={(e) => { setName(e.target.value); updateSuggestions(e.target.value); }}
            placeholder="Ex: Bière, Pizza, Vin..."
            autoFocus
          />
          {suggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 z-10 bg-neutral-800 border border-neutral-700 rounded-xl mt-1 overflow-hidden shadow-xl">
              {suggestions.map((s) => (
                <button
                  key={s}
                  className="w-full text-left px-4 py-3 text-white hover:bg-neutral-700 transition"
                  onClick={() => { setName(s); setSuggestions([]); }}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      </Field>

      <Field label={isOwner ? "J'en apporte (0 = placeholder)" : "J'en apporte (min. 1)"}>
        <input
          className={inputCls}
          type="number"
          min={isOwner ? 0 : 1}
          step="1"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          placeholder="0"
        />
      </Field>

      {qty > 0 && (
        <Field label="Pour combien de personnes ?">
          <input
            className={inputCls}
            type="number"
            min={0}
            step="1"
            value={peopleCovered}
            onChange={(e) => setPeopleCovered(e.target.value)}
            placeholder="Ex: 8"
          />
        </Field>
      )}

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-semibold transition disabled:opacity-50"
      >
        {saving ? 'Enregistrement…' : 'Ajouter'}
      </button>
    </Popup>
  );
}

// ============================
// ContributePopup (+ button for others)
// ============================
interface ContributePopupProps {
  item: FoodItem;
  guestCount: number;
  onClose: () => void;
  onSaved: () => void;
}

function ContributePopup({ item, guestCount, onClose, onSaved }: ContributePopupProps) {
  const { user } = useAuth();
  const [quantity, setQuantity] = useState('');
  const [peopleCovered, setPeopleCovered] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Compute ratio from existing contributions
  const nonZero = item.food_contributions.filter((c) => c.quantity > 0);
  const totalQty = nonZero.reduce((s, c) => s + c.quantity, 0);
  const totalPeople = nonZero.reduce((s, c) => s + c.people_covered, 0);
  const ratio = totalQty > 0 ? totalPeople / totalQty : null;

  const qty = parseFloat(quantity) || 0;

  useEffect(() => {
    if (ratio !== null && qty > 0) {
      setPeopleCovered(String(Math.round(qty * ratio)));
    }
  }, [quantity, ratio]);

  const handleSave = async () => {
    if (!user) return;
    if (qty < 1) { setError("Tu dois apporter au moins 1 unité."); return; }
    setSaving(true);
    setError(null);
    try {
      const pc = ratio !== null ? Math.round(qty * ratio) : parseFloat(peopleCovered) || 0;
      const { error: e } = await supabase.from('food_contributions').insert({
        food_item_id: item.id,
        user_id: user.id,
        quantity: qty,
        people_covered: pc,
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
    <Popup title={`Contribuer : ${item.name}`} onClose={onClose}>
      {error && <p className="text-red-400 text-sm">{error}</p>}

      <Field label="Nom">
        <div className={disabledCls}>{item.name}</div>
      </Field>

      <Field label="J'en apporte (min. 1)">
        <input
          className={inputCls}
          type="number"
          min={1}
          step="1"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          placeholder="Ex: 6"
          autoFocus
        />
      </Field>

      <Field label="Pour combien de personnes ?">
        {ratio !== null ? (
          <div className={disabledCls}>
            {qty > 0 ? Math.round(qty * ratio) : '—'} pers. (calculé automatiquement)
          </div>
        ) : (
          <input
            className={inputCls}
            type="number"
            min={0}
            step="1"
            value={peopleCovered}
            onChange={(e) => setPeopleCovered(e.target.value)}
            placeholder="Ex: 8"
          />
        )}
      </Field>

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-semibold transition disabled:opacity-50"
      >
        {saving ? 'Enregistrement…' : 'Confirmer'}
      </button>
    </Popup>
  );
}

// ============================
// EditContributionPopup
// ============================
interface EditContributionPopupProps {
  item: FoodItem;
  creatorId: string;
  guestCount: number;
  onClose: () => void;
  onSaved: () => void;
}

function EditContributionPopup({ item, creatorId, guestCount, onClose, onSaved }: EditContributionPopupProps) {
  const { user } = useAuth();
  const myContrib = item.food_contributions.find((c) => c.user_id === user?.id);
  const isOwner = user?.id === creatorId;
  const isItemCreator = user?.id === item.created_by;

  const [name, setName] = useState(item.name);
  const [quantity, setQuantity] = useState(String(myContrib?.quantity ?? ''));
  const [peopleCovered, setPeopleCovered] = useState(String(myContrib?.people_covered ?? ''));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Is this user the "ratio setter" (first non-zero contributor)?
  const nonZeroContribs = item.food_contributions.filter((c) => c.quantity > 0);
  const isRatioSetter = nonZeroContribs.length === 0 || (myContrib && nonZeroContribs[0]?.id === myContrib.id);

  // Ratio from OTHER contributors (excluding self)
  const otherNonZero = nonZeroContribs.filter((c) => c.user_id !== user?.id);
  const otherTotalQty = otherNonZero.reduce((s, c) => s + c.quantity, 0);
  const otherTotalPeople = otherNonZero.reduce((s, c) => s + c.people_covered, 0);
  const ratio = otherTotalQty > 0 ? otherTotalPeople / otherTotalQty : null;

  const qty = parseFloat(quantity) || 0;

  const canEditName = isOwner;
  const canEditPeople = isRatioSetter || ratio === null;

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    setError(null);
    try {
      if (canEditName && name.trim() !== item.name) {
        const { error: e } = await supabase.from('food_items').update({ name: name.trim() }).eq('id', item.id);
        if (e) throw e;
      }

      if (myContrib) {
        const pc = !canEditPeople && ratio !== null ? Math.round(qty * ratio) : parseFloat(peopleCovered) || 0;
        const { error: e } = await supabase
          .from('food_contributions')
          .update({ quantity: qty, people_covered: pc })
          .eq('id', myContrib.id);
        if (e) throw e;
      } else if (qty > 0) {
        // owner editing with no prior contribution
        const pc = parseFloat(peopleCovered) || 0;
        const { error: e } = await supabase.from('food_contributions').insert({
          food_item_id: item.id,
          user_id: user.id,
          quantity: qty,
          people_covered: pc,
        });
        if (e) throw e;
      }
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e.message || 'Erreur.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteContrib = async () => {
    if (!myContrib) return;
    setSaving(true);
    try {
      const { error: e } = await supabase.from('food_contributions').delete().eq('id', myContrib.id);
      if (e) throw e;
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e.message || 'Erreur.');
    } finally {
      setSaving(false);
    }
  };

  const isSoleContributor = item.food_contributions.length === 1 && myContrib != null;
  const canDeleteItem = isSoleContributor || isOwner;

  const handleDeleteItem = async () => {
    setSaving(true);
    try {
      // Delete contributions first (in case no cascade)
      if (isSoleContributor && myContrib) {
        await supabase.from('food_contributions').delete().eq('id', myContrib.id);
      }
      const { error: e } = await supabase.from('food_items').delete().eq('id', item.id);
      if (e) throw e;
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e.message || 'Erreur lors de la suppression.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Popup title={`Modifier : ${item.name}`} onClose={onClose}>
      {error && <p className="text-red-400 text-sm">{error}</p>}

      <Field label="Nom">
        {canEditName ? (
          <input
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        ) : (
          <div className={disabledCls}>{item.name}</div>
        )}
      </Field>

      <Field label="J'en apporte">
        <input
          className={inputCls}
          type="number"
          min={0}
          step="1"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
        />
      </Field>

      {qty > 0 && (
        <Field label="Pour combien de personnes ?">
          {canEditPeople ? (
            <input
              className={inputCls}
              type="number"
              min={0}
              step="1"
              value={peopleCovered}
              onChange={(e) => setPeopleCovered(e.target.value)}
            />
          ) : (
            <div className={disabledCls}>
              {ratio !== null ? Math.round(qty * ratio) : '—'} pers. (calculé automatiquement)
            </div>
          )}
        </Field>
      )}

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-semibold transition disabled:opacity-50"
      >
        {saving ? 'Enregistrement…' : 'Sauvegarder'}
      </button>

      {myContrib && (
        <button
          onClick={handleDeleteContrib}
          disabled={saving}
          className="w-full py-3 bg-neutral-800 hover:bg-neutral-700 text-red-400 rounded-xl font-medium transition disabled:opacity-50"
        >
          Supprimer ma contribution
        </button>
      )}

      {canDeleteItem && (
        <button
          onClick={handleDeleteItem}
          disabled={saving}
          className="w-full py-3 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-xl font-medium transition disabled:opacity-50"
        >
          Supprimer cet item
        </button>
      )}
    </Popup>
  );
}

// ============================
// Main component
// ============================
export function FoodBeverage({ partyId, creatorId }: FoodBeverageProps) {
  const { user } = useAuth();
  const [foodItems, setFoodItems] = useState<FoodItem[]>([]);
  const [guestCount, setGuestCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddPopup, setShowAddPopup] = useState(false);
  const [contributeItem, setContributeItem] = useState<FoodItem | null>(null);
  const [editItem, setEditItem] = useState<FoodItem | null>(null);

  const loadGuestCount = useCallback(async () => {
    const { data: guests } = await supabase
      .from('party_guests')
      .select('id, guest_companions(id)')
      .eq('party_id', partyId)
      .eq('status', 'confirmed');
    const confirmed = guests?.length || 0;
    const companions = guests?.reduce((s: number, g: any) => s + ((g.guest_companions as any)?.length || 0), 0) || 0;
    setGuestCount(confirmed + companions);
  }, [partyId]);

  const loadFoodItems = useCallback(async () => {
    const { data, error } = await supabase
      .from('food_items')
      .select('id, name, created_by, food_contributions(id, user_id, quantity, people_covered, profiles(full_name, email))')
      .eq('party_id', partyId);
    if (error) { setError('Impossible de charger les items.'); return; }
    setFoodItems((data as FoodItem[]) || []);
  }, [partyId]);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadFoodItems(), loadGuestCount()]).finally(() => setLoading(false));
  }, [partyId, loadFoodItems, loadGuestCount]);

  // Compute sorted items by deficit DESC
  const sortedItems = [...foodItems].sort((a, b) => {
    const defA = guestCount - a.food_contributions.reduce((s, c) => s + c.people_covered, 0);
    const defB = guestCount - b.food_contributions.reduce((s, c) => s + c.people_covered, 0);
    return defB - defA;
  });

  const existingNames = foodItems.map((i) => i.name);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="animate-pulse bg-neutral-800/70 h-12 rounded-xl" />
        <div className="animate-pulse bg-neutral-800/70 h-16 rounded-xl" />
        <div className="animate-pulse bg-neutral-800/70 h-16 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm">{error}</div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-neutral-400">
          {guestCount > 0 ? `${guestCount} personnes confirmées` : 'Aucun invité confirmé'}
        </div>
        <button
          onClick={() => setShowAddPopup(true)}
          className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-sm font-medium transition"
        >
          <Plus className="w-4 h-4" />
          Ajouter
        </button>
      </div>

      {/* Item list */}
      {sortedItems.length === 0 ? (
        <p className="text-neutral-500 text-center py-12">Aucun item ajouté — soyez le premier !</p>
      ) : (
        <div className="space-y-2">
          {sortedItems.map((item) => {
            const totalCovered = item.food_contributions.reduce((s, c) => s + c.people_covered, 0);
            const deficit = guestCount - totalCovered;
            const ratio = guestCount > 0 ? totalCovered / guestCount : totalCovered > 0 ? 1 : 0;
            const color = computeCoverageColor(ratio);

            const myContrib = item.food_contributions.find((c) => c.user_id === user?.id);
            const isItemCreator = item.created_by === user?.id;
            // Show edit (✏️) if: I have a contribution, OR I'm item creator, OR I'm party owner
            const showEdit = myContrib || isItemCreator || user?.id === creatorId;
            // Show + if: I don't have a contribution AND I'm not the item creator (creator uses edit)
            const showContribute = !myContrib && !isItemCreator && user?.id !== creatorId;

            return (
              <div
                key={item.id}
                className="flex items-center gap-3 px-4 py-3 bg-neutral-800 rounded-xl"
              >
                {/* Name */}
                <div className="flex-1 min-w-0">
                  <span className="text-white font-medium truncate block">{item.name}</span>
                </div>

                {/* Coverage */}
                <div className="text-sm font-semibold tabular-nums flex-shrink-0" style={{ color }}>
                  {Math.round(totalCovered)}/{guestCount} pers.
                </div>

                {/* Avatars */}
                <div className="flex-shrink-0">
                  <AvatarStack contributions={item.food_contributions} />
                </div>

                {/* Action button */}
                <div className="flex-shrink-0">
                  {showEdit ? (
                    <button
                      onClick={() => setEditItem(item)}
                      className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-700 rounded-lg transition"
                      title="Modifier"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  ) : showContribute ? (
                    <button
                      onClick={() => setContributeItem(item)}
                      className="p-2 text-orange-400 hover:text-orange-300 hover:bg-orange-500/20 rounded-lg transition"
                      title="Contribuer"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Popups */}
      {showAddPopup && (
        <AddItemPopup
          partyId={partyId}
          creatorId={creatorId}
          existingNames={existingNames}
          onClose={() => setShowAddPopup(false)}
          onSaved={loadFoodItems}
        />
      )}

      {contributeItem && (
        <ContributePopup
          item={contributeItem}
          guestCount={guestCount}
          onClose={() => setContributeItem(null)}
          onSaved={loadFoodItems}
        />
      )}

      {editItem && (
        <EditContributionPopup
          item={editItem}
          creatorId={creatorId}
          guestCount={guestCount}
          onClose={() => setEditItem(null)}
          onSaved={loadFoodItems}
        />
      )}
    </div>
  );
}
