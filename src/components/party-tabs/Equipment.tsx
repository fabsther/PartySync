import { useEffect, useState } from 'react';
import { Plus, Check, Trash2, Bell } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { sendRemoteNotification } from '../../lib/remoteNotify';
import { CrowdfundIcon } from './Crowdfunding';

interface EquipmentContributor {
  user_id: string;
  profiles: {
    full_name: string | null;
    email: string;
  };
}

interface EquipmentItem {
  id: string;
  name: string;
  is_required: boolean;
  is_available: boolean;
  quantity_required: number;
  equipment_contributors: EquipmentContributor[];
}

interface GuestEntry {
  user_id: string;
  profiles: {
    full_name: string | null;
    email: string;
  };
}

interface EquipmentProps {
  partyId: string;
  creatorId: string;
  partyTitle?: string;
}

// ============================
// AddToCrowdfundPopup (Equipment)
// ============================
interface AddToCrowdfundPopupProps {
  item: EquipmentItem;
  partyId: string;
  onClose: () => void;
}

function AddToCrowdfundPopup({ item, partyId, onClose }: AddToCrowdfundPopupProps) {
  const { t } = useTranslation('logistics');
  const { user } = useAuth();
  const [quantity, setQuantity] = useState(String(item.quantity_required));
  const [price, setPrice] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSave = async () => {
    if (!user) return;
    const qty = parseFloat(quantity) || 1;
    const totalPrice = parseFloat(price) || 0;
    setSaving(true);
    setError(null);
    try {
      // Upsert crowdfund for this user+party
      const { data: cf, error: cfErr } = await supabase
        .from('crowdfunds')
        .upsert({ party_id: partyId, creator_id: user.id, status: 'active' }, { onConflict: 'party_id,creator_id' })
        .select('id')
        .single();
      if (cfErr) throw cfErr;

      // Check if item already in crowdfund
      const { data: existing } = await supabase
        .from('crowdfund_items')
        .select('id')
        .eq('crowdfund_id', cf.id)
        .eq('item_id', item.id)
        .maybeSingle();

      if (existing) {
        const { error: upErr } = await supabase
          .from('crowdfund_items')
          .update({ quantity: qty, total_price: totalPrice, people_covered: 0 })
          .eq('id', existing.id);
        if (upErr) throw upErr;
      } else {
        const { error: insErr } = await supabase.from('crowdfund_items').insert({
          crowdfund_id: cf.id,
          item_type: 'equipment',
          item_id: item.id,
          item_name: item.name,
          quantity: qty,
          people_covered: 0,
          total_price: totalPrice,
        });
        if (insErr) throw insErr;
      }
      setSuccess(true);
      setTimeout(onClose, 800);
    } catch (e: any) {
      setError(e.message || t('error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-neutral-950 flex flex-col">
      <div className="flex items-center gap-3 px-4 py-4 border-b border-neutral-800">
        <button onClick={onClose} className="text-neutral-400 hover:text-white transition text-2xl leading-none">←</button>
        <h2 className="text-white font-semibold text-lg">{t('add_to_crowdfund_title')}</h2>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-5">
        {error && <p className="text-red-400 text-sm">{error}</p>}
        {success && <p className="text-green-400 text-sm">{t('added_success')}</p>}

        <div className="space-y-1">
          <label className="block text-sm text-neutral-400">{t('equipment_item')}</label>
          <div className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-xl text-neutral-400">{item.name}</div>
        </div>

        <div className="space-y-1">
          <label className="block text-sm text-neutral-400">{t('quantity')}</label>
          <input
            type="number"
            min="1"
            step="1"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="w-full px-4 py-3 bg-neutral-900 border border-neutral-700 rounded-xl text-white focus:outline-none focus:border-orange-500 transition"
          />
        </div>

        <div className="space-y-1">
          <label className="block text-sm text-neutral-400">{t('total_price')} (€)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="Ex: 25.00"
            autoFocus
            className="w-full px-4 py-3 bg-neutral-900 border border-neutral-700 rounded-xl text-white placeholder-neutral-500 focus:outline-none focus:border-orange-500 transition"
          />
        </div>

        <button
          onClick={handleSave}
          disabled={saving || success}
          className="w-full py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-semibold transition disabled:opacity-50"
        >
          {saving ? t('saving') : success ? t('added_success') : t('add_to_crowdfund_title')}
        </button>
      </div>
    </div>
  );
}

const defaultEquipment: Array<{ name: string; quantity_required: number }> = [
  { name: 'BBQ Grill',           quantity_required: 1 },
  { name: 'Plancha',              quantity_required: 1 },
  { name: 'Cooler',               quantity_required: 2 },
  { name: 'Bluetooth Speaker',    quantity_required: 1 },
  { name: 'Guitar',               quantity_required: 1 },
  { name: 'Folding Tables',       quantity_required: 2 },
  { name: 'Folding Chairs',       quantity_required: 8 },
  { name: 'Sun Umbrella',         quantity_required: 2 },
];

export function Equipment({ partyId, creatorId, partyTitle }: EquipmentProps) {
  const { t } = useTranslation('logistics');
  const [equipment, setEquipment] = useState<EquipmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newItemQty, setNewItemQty] = useState<number>(1);
  const [pingEquipmentId, setPingEquipmentId] = useState<string | null>(null);
  const [pingedGuests, setPingedGuests] = useState<Map<string, Set<string>>>(new Map());
  const [guests, setGuests] = useState<GuestEntry[]>([]);
  const [crowdfundItem, setCrowdfundItem] = useState<EquipmentItem | null>(null);
  const { user } = useAuth();

  const isCreator = user?.id === creatorId;

  useEffect(() => {
    loadEquipment();
  }, [partyId]);

  // Charger les invités pour le dropdown de ping (organizer only)
  useEffect(() => {
    if (!isCreator) return;
    supabase
      .from('party_guests')
      .select('user_id, profiles(full_name, email)')
      .eq('party_id', partyId)
      .in('status', ['invited', 'confirmed'])
      .then(({ data }) => setGuests((data as any) || []));
  }, [partyId, isCreator]);

  const loadEquipment = async () => {
    try {
      const { data, error } = await supabase
        .from('equipment')
        .select('id, name, is_required, is_available, quantity_required, equipment_contributors(user_id, profiles(full_name, email))')
        .eq('party_id', partyId)
        .order('name', { ascending: true });

      if (error) throw error;
      setEquipment((data as EquipmentItem[]) || []);
    } catch (error) {
      console.error('Error loading equipment:', error);
    } finally {
      setLoading(false);
    }
  };

  const addDefaultEquipment = async () => {
    try {
      const items = defaultEquipment.map((item) => ({
        party_id: partyId,
        name: item.name,
        is_required: true,
        is_available: false,
        quantity_required: item.quantity_required,
      }));

      const { error } = await supabase.from('equipment').insert(items);
      if (error) throw error;
      loadEquipment();
    } catch (error) {
      console.error('Error adding default equipment:', error);
    }
  };

  const addCustomItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim() || !newItemQty || newItemQty <= 0) return;

    try {
      const payload = {
        party_id: partyId,
        name: newItemName.trim(),
        is_required: false,
        is_available: false,
        quantity_required: Number(newItemQty),
      };
      const { data, error } = await supabase
        .from('equipment')
        .insert(payload)
        .select('id, name, quantity_required')
        .single();

      if (error) throw error;

      setNewItemName('');
      setNewItemQty(1);
      setShowForm(false);
      await loadEquipment();

      const deepLink = `/party/${partyId}?tab=equipment`;

      if (user?.id === creatorId) {
        const { data: guestList, error: gErr } = await supabase
          .from('party_guests')
          .select('user_id, status')
          .eq('party_id', partyId)
          .in('status', ['invited', 'confirmed']);
        if (gErr) throw gErr;

        const uniqueUserIds = Array.from(
          new Set((guestList || []).map(g => g.user_id).filter(uid => !!uid && uid !== creatorId))
        );

        await Promise.all(
          uniqueUserIds.map(uid =>
            sendRemoteNotification(
              uid!,
              t('notif_equip_added_title'),
              t('notif_equip_added_body', { name: data?.name, qty: data?.quantity_required }),
              { partyId, action: 'equipment_custom_added', equipmentId: data?.id },
              deepLink
            )
          )
        );
      } else if (user?.id) {
        await sendRemoteNotification(
          creatorId,
          t('notif_equip_guest_title'),
          t('notif_equip_guest_body', { author: user.email || t('unknown_name'), name: data?.name, qty: data?.quantity_required }),
          { partyId, action: 'equipment_custom_added_by_guest', equipmentId: data?.id, by: user.id },
          deepLink
        );
      }

    } catch (error) {
      console.error('Error adding equipment:', error);
    }
  };

  const toggleContribution = async (equipmentId: string, isContributing: boolean) => {
    if (!user) return;

    try {
      if (isContributing) {
        const { error } = await supabase
          .from('equipment_contributors')
          .delete()
          .eq('equipment_id', equipmentId)
          .eq('user_id', user.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('equipment_contributors')
          .insert({ equipment_id: equipmentId, user_id: user.id });

        if (error) throw error;
      }

      loadEquipment();
    } catch (error) {
      console.error('Error toggling contribution:', error);
    }
  };

  const deleteEquipment = async (equipmentId: string) => {
    if (!isCreator || !window.confirm(t('delete_item_confirm'))) return;

    try {
      const { error } = await supabase
        .from('equipment')
        .delete()
        .eq('id', equipmentId);

      if (error) throw error;
      loadEquipment();
    } catch (error) {
      console.error('Error deleting equipment:', error);
    }
  };

  const pingGuestForEquipment = async (guestUserId: string, item: EquipmentItem) => {
    const notifTitle = partyTitle
      ? t('notif_ping_title', { partyTitle })
      : t('notif_equip_added_title');
    const notifBody = t('notif_ping_body', { name: item.name });

    await sendRemoteNotification(
      guestUserId,
      notifTitle,
      notifBody,
      { partyId, action: 'equipment_ping', equipmentId: item.id },
      `/party/${partyId}?tab=equipment`
    );

    setPingedGuests(prev => {
      const next = new Map(prev);
      const set = new Set(next.get(item.id) || []);
      set.add(guestUserId);
      next.set(item.id, set);
      return next;
    });
  };

  if (loading) {
    return <div className="text-center text-neutral-400">{t('loading', { ns: 'common' })}</div>;
  }

  return (
    <div className="space-y-6">
      {isCreator && (
        <div className="flex flex-wrap gap-3">
          {equipment.length === 0 && (
            <button
              onClick={addDefaultEquipment}
              className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition"
            >
              {t('add_default_list')}
            </button>
          )}
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-4 py-2 bg-neutral-800 text-white rounded-lg hover:bg-neutral-700 transition flex items-center space-x-2"
          >
            <Plus className="w-4 h-4" />
            <span>{t('add_custom_item_btn')}</span>
          </button>
        </div>
      )}

      {showForm && (
        <form onSubmit={addCustomItem} className="bg-neutral-800 rounded-lg p-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              type="text"
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              placeholder={t('item_name_placeholder')}
              className="px-4 py-2 bg-neutral-900 border border-neutral-700 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition"
            />
            <div>
              <label className="block text-xs text-neutral-400 mb-1">{t('required_quantity_label')}</label>
              <input
                type="number"
                min={1}
                step={1}
                value={newItemQty}
                onChange={(e) => setNewItemQty(Math.max(1, parseInt(e.target.value || '1', 10)))}
                className="w-full px-4 py-2 bg-neutral-900 border border-neutral-700 rounded-lg text-white focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition self-end"
            >
              {t('add_food')}
            </button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {equipment.length === 0 ? (
          <p className="text-neutral-500 col-span-full text-center py-8">
            {t('no_equipment')}
          </p>
        ) : (
          equipment.map((item) => {
            const contributors = item.equipment_contributors || [];
            const isContributing = contributors.some((c) => c.user_id === user?.id);

            const brought = contributors.length;
            const needed = Math.max(0, (item.quantity_required || 0) - brought);

            const pingableGuests = guests.filter(
              g => g.user_id !== creatorId && !contributors.some(c => c.user_id === g.user_id)
            );
            const itemPinged = pingedGuests.get(item.id) || new Set<string>();

            return (
              <div
                key={item.id}
                className={`bg-neutral-800 rounded-lg p-4 border-2 transition ${
                  brought > 0 ? 'border-green-500/50' : 'border-neutral-700'
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <h4 className="text-white font-medium truncate">{item.name}</h4>
                    <div className="text-xs text-neutral-400 mt-1">
                      {t('required_label')}: <span className="text-neutral-200">{item.quantity_required}</span> •
                      {t('brought_label')}: <span className="text-green-400">{brought}</span> •
                      {t('needed_label')}: <span className="text-orange-300">{needed}</span>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    {brought > 0 && <Check className="w-5 h-5 text-green-500 flex-shrink-0" />}
                    <button
                      onClick={() => setCrowdfundItem(item)}
                      className="p-1 text-yellow-400 hover:bg-yellow-500/20 rounded transition"
                      title={t('add_to_crowdfund_title')}
                    >
                      <CrowdfundIcon className="w-4 h-4" />
                    </button>
                    {isCreator && (
                      <button
                        onClick={() => deleteEquipment(item.id)}
                        className="p-1 text-red-400 hover:bg-red-500/20 rounded transition"
                        title={t('delete_item_btn')}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {contributors.length > 0 && (
                  <div className="mb-3">
                    <div className="text-xs text-neutral-500 mb-1">{t('contributors_label')}:</div>
                    <div className="text-sm text-green-400 truncate">
                      {contributors.map(
                        (c) => c.profiles.full_name || c.profiles.email
                      ).join(', ')}
                    </div>
                  </div>
                )}

                <button
                  onClick={() => toggleContribution(item.id, isContributing)}
                  className={`w-full px-3 py-2 rounded-lg text-sm font-medium transition ${
                    isContributing
                      ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                      : 'bg-orange-500/20 text-orange-400 hover:bg-orange-500/30'
                  }`}
                >
                  {isContributing ? t('wont_bring') : t('will_bring')}
                </button>

                {/* Ping button — organizer only, item not fully covered */}
                {isCreator && needed > 0 && (
                  <div className="mt-2 pt-2 border-t border-neutral-700">
                    <button
                      onClick={() => setPingEquipmentId(pingEquipmentId === item.id ? null : item.id)}
                      className="flex items-center gap-1.5 text-xs text-orange-400 hover:text-orange-300 transition"
                    >
                      <Bell className="w-3.5 h-3.5" />
                      {t('ping_guest_btn')}
                    </button>

                    {pingEquipmentId === item.id && (
                      <div className="mt-2 bg-neutral-900 rounded-lg overflow-hidden">
                        {pingableGuests.length === 0 ? (
                          <p className="text-xs text-neutral-500 px-3 py-2">
                            {t('all_contributed')}
                          </p>
                        ) : (
                          pingableGuests.map(g => {
                            const name = g.profiles.full_name || g.profiles.email;
                            const wasPinged = itemPinged.has(g.user_id);
                            return (
                              <button
                                key={g.user_id}
                                onClick={() => pingGuestForEquipment(g.user_id, item)}
                                disabled={wasPinged}
                                className="w-full flex items-center justify-between px-3 py-2 hover:bg-neutral-800 transition text-sm text-left disabled:opacity-50"
                              >
                                <span className="text-white truncate">{name}</span>
                                {wasPinged
                                  ? <Check className="w-3.5 h-3.5 text-green-400 flex-shrink-0 ml-2" />
                                  : <Bell className="w-3.5 h-3.5 text-orange-400 flex-shrink-0 ml-2" />}
                              </button>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {crowdfundItem && (
        <AddToCrowdfundPopup
          item={crowdfundItem}
          partyId={partyId}
          onClose={() => setCrowdfundItem(null)}
        />
      )}
    </div>
  );
}
