import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { sendRemoteNotification } from '../../lib/remoteNotify';

// ============================
// Types (post-migration: colonnes NUMERIC en DB)
// ============================
interface Profile {
  full_name: string | null;
  email: string;
}

interface FoodContribution {
  id: string;
  user_id: string;
  quantity: number;      // NUMERIC -> number
  is_extra: boolean;
  profiles: Profile;
}

interface FoodItem {
  id: string;
  name: string;
  base_quantity: number; // NUMERIC -> number (par personne)
  estimated_cost: number; // coût unitaire (EUR)
  food_contributions: FoodContribution[];
}

interface FoodBeverageProps {
  partyId: string;
  creatorId: string;
}


// ============================
// Defaults (sans category, tout numérique)
// ============================
const defaultFoodItems: Array<Omit<FoodItem, 'id' | 'food_contributions'>> = [
  { name: 'Burgers',        base_quantity: 1,    estimated_cost: 3 },
  { name: 'Hot Dogs',       base_quantity: 2,    estimated_cost: 2 },
  { name: 'Veggie Burgers', base_quantity: 0.5,  estimated_cost: 3.5 },
  { name: 'Salad',          base_quantity: 0.2,  estimated_cost: 1.5 }, // 0.2 kg pp
  { name: 'Chips',          base_quantity: 0.05, estimated_cost: 1 },
  { name: 'Soda',           base_quantity: 2,    estimated_cost: 1 },   // canettes pp
  { name: 'Beer',           base_quantity: 3,    estimated_cost: 2 },
  { name: 'Water',          base_quantity: 2,    estimated_cost: 0.5 }, // bouteilles pp
];

export function FoodBeverage({ partyId, creatorId }: FoodBeverageProps) {
  const [foodItems, setFoodItems] = useState<FoodItem[]>([]);
  const [guestCount, setGuestCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newItem, setNewItem] = useState({
    name: '',
    base_quantity: 1,
    estimated_cost: 0,
  });
  const { user } = useAuth();

  const notifTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notifCooldownUntil = useRef<number>(0);
  const pendingPlanChange = useRef<boolean>(false);

  const notifyGuestsFoodPlanUpdated = useCallback(async () => {
    try {
      const { data: guests, error } = await supabase
        .from('party_guests')
        .select('user_id, status')
        .eq('party_id', partyId)
        .in('status', ['invited', 'confirmed']);
      if (error) throw error;

      const uniqueUserIds = Array.from(
        new Set((guests || []).map(g => g.user_id).filter(uid => !!uid && uid !== creatorId))
      );

      if (uniqueUserIds.length === 0) return;

      const title = 'Food & drinks updated';
      const body  = 'The organizer has updated the Food & Beverage list. Please check your contributions.';
      const url   = `/party/${partyId}?tab=food`;

      await Promise.all(
        uniqueUserIds.map(uid =>
          sendRemoteNotification(
            uid,
            title,
            body,
            { partyId, action: 'food_plan_updated' },
            url
          )
        )
      );
    } catch (e) {
      console.error('notifyGuestsFoodPlanUpdated error:', e);
    }
  }, [partyId, creatorId]);

  const schedulePlanChangeNotification = useCallback(() => {
    if (user?.id !== creatorId) return;

    pendingPlanChange.current = true;

    if (notifTimer.current) return;

    notifTimer.current = setTimeout(async () => {
      notifTimer.current = null;

      if (!pendingPlanChange.current) return;
      pendingPlanChange.current = false;

      const now = Date.now();
      if (now < notifCooldownUntil.current) return;
      notifCooldownUntil.current = now + 60_000;

      await notifyGuestsFoodPlanUpdated();
    }, 2000);
  }, [user?.id, creatorId, notifyGuestsFoodPlanUpdated]);

  // ============================
  // Formatters
  // ============================
  const priceFmt = useMemo(
    () => new Intl.NumberFormat(undefined, { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }),
    []
  );

  // Quantités requises basées sur max(guests, 4)
  const requirementMultiplier = useMemo(() => Math.max(guestCount || 0, 4), [guestCount]);

  // Totaux item
  const computeItemRequiredQty = useCallback(
    (item: FoodItem) => item.base_quantity * requirementMultiplier,
    [requirementMultiplier]
  );

  const computeItemBroughtQty = useCallback(
    (item: FoodItem) => item.food_contributions.reduce((s, c) => s + (c.quantity || 0), 0),
    []
  );

  const computeItemTotals = useCallback(
    (item: FoodItem) => {
      const requiredQty  = computeItemRequiredQty(item);
      const broughtQty   = computeItemBroughtQty(item);
      const unitCost     = item.estimated_cost || 0;
      const requiredCost = requiredQty * unitCost;
      const broughtCost  = broughtQty * unitCost;
      return { requiredQty, broughtQty, requiredCost, broughtCost, unitCost };
    },
    [computeItemRequiredQty, computeItemBroughtQty]
  );

  const totalCost = useMemo(
    () => foodItems.reduce((sum, item) => sum + computeItemTotals(item).requiredCost, 0),
    [foodItems, computeItemTotals]
  );

  // Règle stricte: Suggested share = total / confirmed guests (sans plancher)
  const suggestedShare = useMemo(() => (guestCount ? totalCost / guestCount : 0), [totalCost, guestCount]);

  const myCurrentCost = useMemo(() => {
    if (!user) return 0;
    return foodItems.reduce((sum, item) => {
      const mine = item.food_contributions.find((c) => c.user_id === user.id);
      return sum + (mine ? mine.quantity * (item.estimated_cost || 0) : 0);
    }, 0);
  }, [foodItems, user]);

  const myShareDelta = useMemo(() => suggestedShare - myCurrentCost, [suggestedShare, myCurrentCost]);

  // ============================
  // Loading
  // ============================
  const loadGuestCount = useCallback(async () => {
    try {
      setError(null);
      const { data: guests, error } = await supabase
        .from('party_guests')
        .select('id, guest_companions(id)')
        .eq('party_id', partyId)
        .eq('status', 'confirmed');
      if (error) throw error;

      const confirmed = guests?.length || 0;
      const companions =
        guests?.reduce((sum: number, g: any) => sum + ((g.guest_companions as any)?.length || 0), 0) || 0;
      setGuestCount(confirmed + companions);
    } catch (err) {
      console.error('Error loading guest count:', err);
      setError('Could not load guest count.');
      setGuestCount(0);
    }
  }, [partyId]);

  const loadFoodItems = useCallback(async () => {
    try {
      setError(null);
      const { data, error } = await supabase
        .from('food_items')
        .select(
          'id, name, base_quantity, estimated_cost, food_contributions(id, user_id, quantity, is_extra, profiles(full_name, email))'
        )
        .eq('party_id', partyId)
        .order('name');
      if (error) throw error;
      setFoodItems((data as FoodItem[]) || []);
    } catch (err) {
      console.error('Error loading food items:', err);
      setError('Could not load food & beverages.');
    } finally {
      setLoading(false);
    }
  }, [partyId]);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadFoodItems(), loadGuestCount()]).finally(() => setLoading(false));
  }, [partyId, loadFoodItems, loadGuestCount]);

  // ============================
  // Mutations
  // ============================
  const addDefaultItems = useCallback(async () => {
    try {
      setError(null);
      const items = defaultFoodItems.map(({ name, base_quantity, estimated_cost }) => ({
        party_id: partyId,
        name,
        base_quantity,
        estimated_cost,
      }));
      const { error } = await supabase.from('food_items').insert(items);
      if (error) throw error;
      await loadFoodItems();
      schedulePlanChangeNotification();
    } catch (err) {
      console.error('Error adding default food items:', err);
      setError('Failed to add default food list.');
    }
  }, [partyId, loadFoodItems]);

  const addCustomItem = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!newItem.name.trim()) return;

      try {
        setError(null);
        const payload = {
          party_id: partyId,
          name: newItem.name.trim(),
          base_quantity: Number(newItem.base_quantity) || 0,
          estimated_cost: Number(newItem.estimated_cost) || 0,
        };
        const { error } = await supabase.from('food_items').insert(payload);
        if (error) throw error;
        setNewItem({ name: '', base_quantity: 1, estimated_cost: 0 });
        setShowForm(false);
        await loadFoodItems();
        schedulePlanChangeNotification(); 
      } catch (err) {
        console.error('Error adding food item:', err);
        setError('Failed to add item.');
      }
    },
    [newItem, partyId, loadFoodItems]
  );

  const addContribution = useCallback(
    async (foodItemId: string, quantity: number, is_extra: boolean) => {
      if (!user) return;
      try {
        setError(null);
        const { error } = await supabase.from('food_contributions').insert({
          food_item_id: foodItemId,
          user_id: user.id,
          quantity,   // NUMERIC -> on envoie un number
          is_extra,
        });
        if (error) throw error;
        await loadFoodItems();
      } catch (err) {
        console.error('Error adding contribution:', err);
        setError('Failed to add your contribution.');
      }
    },
    [user, loadFoodItems]
  );

  const removeContribution = useCallback(
    async (contributionId: string) => {
      try {
        setError(null);
        const { error } = await supabase.from('food_contributions').delete().eq('id', contributionId);
        if (error) throw error;
        await loadFoodItems();
      } catch (err) {
        console.error('Error removing contribution:', err);
        setError('Failed to remove your contribution.');
      }
    },
    [loadFoodItems]
  );

  const deleteFoodItem = useCallback(
    async (foodItemId: string) => {
      if (user?.id !== creatorId || !window.confirm('Are you sure you want to delete this food item?')) return;
      try {
        setError(null);
        const { error } = await supabase.from('food_items').delete().eq('id', foodItemId);
        if (error) throw error;
        await loadFoodItems();
        schedulePlanChangeNotification(); 
      } catch (err) {
        console.error('Error deleting food item:', err);
        setError('Failed to delete food item.');
        alert('Failed to delete food item.');
      }
    },
    [creatorId, user?.id, loadFoodItems]
  );

  // ============================
  // UI
  // ============================
  if (loading) {
    return (
      <div className="space-y-4">
        <div className="animate-pulse bg-neutral-800/70 h-24 rounded-lg" />
        <div className="animate-pulse bg-neutral-800/70 h-10 rounded-lg" />
        <div className="animate-pulse bg-neutral-800/70 h-40 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm">{error}</div>
      )}

      <div className="bg-gradient-to-br from-orange-500/10 to-orange-600/10 border border-orange-500/30 rounded-lg p-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center">
          <div>
            <div className="text-sm text-neutral-400 mb-1">Estimated Total Cost</div>
            <div className="text-2xl font-bold text-white">
              {priceFmt.format(totalCost)}
            </div>
          </div>
          <div>
            <div className="text-sm text-neutral-400 mb-1">Suggested Share</div>
            <div className="text-2xl font-bold text-white">
              {priceFmt.format(suggestedShare)}
            </div>
            {user && guestCount > 0 && (
              <div className="text-xs text-neutral-300 mt-1">
                Your current pledge: {priceFmt.format(myCurrentCost)}
                {Math.abs(myShareDelta) > 0.01 && (
                  <>
                    {' '}(
                    <span className={myShareDelta > 0 ? 'text-orange-300' : 'text-green-300'}>
                      {myShareDelta > 0
                        ? `${priceFmt.format(myShareDelta)} to go`
                        : `over by ${priceFmt.format(Math.abs(myShareDelta))}`}
                    </span>
                    )
                  </>
                )}
              </div>
            )}
          </div>
          <div>
            <div className="text-sm text-neutral-400 mb-1">Confirmed Guests</div>
            <div className="text-2xl font-bold text-white">{guestCount}</div>
            <div className="text-xs text-neutral-400">Quantities scale with max(guests, 4)</div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        {foodItems.length === 0 && user?.id === creatorId && (
          <button
            onClick={addDefaultItems}
            className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition"
          >
            Add Default Food List
          </button>
        )}
        <button
          onClick={() => setShowForm((s) => !s)}
          className="px-4 py-2 bg-neutral-800 text-white rounded-lg hover:bg-neutral-700 transition flex items-center space-x-2"
        >
          <Plus className="w-4 h-4" />
          <span>Add Custom Item</span>
        </button>
      </div>

      {showForm && (
        <form onSubmit={addCustomItem} className="bg-neutral-800 rounded-lg p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              type="text"
              value={newItem.name}
              onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
              placeholder="Item name"
              className="px-4 py-2 bg-neutral-900 border border-neutral-700 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition"
            />
            <div>
              <label className="block text-xs text-neutral-400 mb-1">Base quantity (per person)</label>
              <input
                type="number"
                step="0.01"
                min={0}
                value={newItem.base_quantity}
                onChange={(e) => setNewItem({ ...newItem, base_quantity: parseFloat(e.target.value) || 0 })}
                placeholder="e.g., 0.50"
                className="w-full px-4 py-2 bg-neutral-900 border border-neutral-700 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition"
              />
              <p className="text-xs text-neutral-500 mt-1">Shown as “x per person” in the UI</p>
            </div>
            <div>
              <label className="block text-xs text-neutral-400 mb-1">Cost per unit (EUR)</label>
              <input
                type="number"
                step="0.01"
                min={0}
                value={newItem.estimated_cost}
                onChange={(e) => setNewItem({ ...newItem, estimated_cost: parseFloat(e.target.value) || 0 })}
                placeholder="e.g., 2.00"
                className="w-full px-4 py-2 bg-neutral-900 border border-neutral-700 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition"
              />
            </div>
          </div>
          <button
            type="submit"
            className="w-full px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition"
          >
            Add Item
          </button>
        </form>
      )}

      <div className="space-y-4">
        {foodItems.length === 0 ? (
          <p className="text-neutral-500 text-center py-8">No food items added yet</p>
        ) : (
          foodItems.map((item) => {
            const totals = computeItemTotals(item);
            const myContribution = item.food_contributions.find((c) => c.user_id === user?.id);
            const otherContributions = item.food_contributions.filter((c) => c.user_id !== user?.id);

            const nonExtraQty = item.food_contributions
              .filter((c) => !c.is_extra)
              .reduce((sum, c) => sum + (c.quantity || 0), 0);

            const neededQty = Math.max(0, totals.requiredQty - nonExtraQty);

            return (
              <div key={item.id} className="bg-neutral-800 rounded-lg p-4">
                <div className="flex items-start justify-between mb-3 gap-3">
                  <div className="flex-1 min-w-0">
                    <h4 className="text-white font-medium text-lg truncate">{item.name}</h4>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1">
                      <span className="text-sm text-neutral-400">
                        {item.base_quantity} per person
                      </span>
                      <span className="text-sm text-neutral-300">
                        {priceFmt.format(totals.unitCost)} / unit
                      </span>
                    </div>
                  </div>
                  {user?.id === creatorId && (
                    <button
                      onClick={() => deleteFoodItem(item.id)}
                      className="p-2 text-red-400 hover:bg-red-500/20 rounded transition"
                      title="Delete item"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                  <div className="p-3 rounded bg-neutral-900">
                    <div className="text-xs text-neutral-500 mb-1">Required (scaled)</div>
                    <div className="text-sm text-neutral-200">
                      {totals.requiredQty.toFixed(2)} • {priceFmt.format(totals.requiredCost)}
                    </div>
                  </div>
                  <div className="p-3 rounded bg-neutral-900">
                    <div className="text-xs text-neutral-500 mb-1">Brought (incl. extras)</div>
                    <div className="text-sm text-neutral-200">
                      {totals.broughtQty.toFixed(2)} • {priceFmt.format(totals.broughtCost)}
                    </div>
                  </div>
                  <div className="p-3 rounded bg-neutral-900">
                    <div className="text-xs text-neutral-500 mb-1">Still needed (excludes extras)</div>
                    <div className="text-sm text-neutral-200">{neededQty.toFixed(2)}</div>
                  </div>
                </div>

                {otherContributions.length > 0 && (
                  <div className="mb-3 p-3 bg-neutral-900 rounded">
                    <div className="text-xs text-neutral-500 mb-2">Others bringing:</div>
                    {otherContributions.map((contrib) => (
                      <div key={contrib.id} className="text-sm text-neutral-300">
                        {(contrib.profiles.full_name || contrib.profiles.email)} - {contrib.quantity}
                        {contrib.is_extra ? ' (extra)' : ''}
                      </div>
                    ))}
                  </div>
                )}

                {myContribution ? (
                  <div className="flex items-center justify-between bg-green-500/10 rounded p-3">
                    <span className="text-green-400 text-sm">
                      You're bringing: {myContribution.quantity}{myContribution.is_extra ? ' (extra)' : ''}
                    </span>
                    <button
                      onClick={() => removeContribution(myContribution.id)}
                      className="px-3 py-1 bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 transition text-sm"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <button
                      onClick={() => {
                        const v = prompt(`Standard share for ${item.name} (not extra) — how many units?`);
                        const qty = v ? parseFloat(v) : NaN;
                        if (!Number.isNaN(qty) && qty >= 0.01) addContribution(item.id, qty, false);
                      }}
                      className="w-full px-3 py-2 bg-orange-500/20 text-orange-400 rounded hover:bg-orange-500/30 transition text-sm font-medium"
                    >
                      I'll bring this
                    </button>
                    <button
                      onClick={() => {
                        const v = prompt(`Extra ${item.name} — how many additional units?`);
                        const qty = v ? parseFloat(v) : NaN;
                        if (!Number.isNaN(qty) && qty >= 0.01) addContribution(item.id, qty, true);
                      }}
                      className="w-full px-3 py-2 bg-neutral-800 text-neutral-200 rounded hover:bg-neutral-700 transition text-sm"
                    >
                      Add extras
                    </button>
                    <div className="text-xs text-neutral-400 self-center text-center">
                      Suggested remaining standard: {Math.max(0, neededQty).toFixed(2)}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
