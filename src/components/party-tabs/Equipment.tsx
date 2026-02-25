import { useEffect, useState } from 'react';
import { Plus, Check, Trash2, Bell } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { sendRemoteNotification } from '../../lib/remoteNotify';

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
  const [equipment, setEquipment] = useState<EquipmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newItemQty, setNewItemQty] = useState<number>(1);
  const [pingEquipmentId, setPingEquipmentId] = useState<string | null>(null);
  const [pingedGuests, setPingedGuests] = useState<Map<string, Set<string>>>(new Map());
  const [guests, setGuests] = useState<GuestEntry[]>([]);
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

        const title = '🧰 Nouvel équipement ajouté';
        const body  = `« ${data?.name} » a été ajouté (${data?.quantity_required} requis). Ouvrez l'onglet Équipement pour contribuer.`;

        await Promise.all(
          uniqueUserIds.map(uid =>
            sendRemoteNotification(
              uid!,
              title,
              body,
              { partyId, action: 'equipment_custom_added', equipmentId: data?.id },
              deepLink
            )
          )
        );
      } else if (user?.id) {
        const title = `🧰 Ajout d'équipement par un invité`;
        const body  = `${user.email || 'Un invité'} a ajouté « ${data?.name} » (${data?.quantity_required} requis).`;

        await sendRemoteNotification(
          creatorId,
          title,
          body,
          { partyId, action: 'equipment_custom_added_by_guest', equipmentId: data?.id, by: user.id },
          deepLink
        );
      }

    } catch (error) {
      console.error('Error adding equipment:', error);
      alert('Failed to add equipment item.');
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
    if (!isCreator || !window.confirm('Are you sure you want to delete this equipment item?')) return;

    try {
      const { error } = await supabase
        .from('equipment')
        .delete()
        .eq('id', equipmentId);

      if (error) throw error;
      loadEquipment();
    } catch (error) {
      console.error('Error deleting equipment:', error);
      alert('Failed to delete equipment item.');
    }
  };

  const pingGuestForEquipment = async (guestUserId: string, item: EquipmentItem) => {
    const notifTitle = partyTitle
      ? `🧰 On a besoin de toi — ${partyTitle}`
      : '🧰 On a besoin de toi !';
    const notifBody = `Peux-tu amener « ${item.name} » à la soirée ?`;

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
    return <div className="text-center text-neutral-400">Loading equipment...</div>;
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
              Add Default Equipment List
            </button>
          )}
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-4 py-2 bg-neutral-800 text-white rounded-lg hover:bg-neutral-700 transition flex items-center space-x-2"
          >
            <Plus className="w-4 h-4" />
            <span>Add Custom Item</span>
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
              placeholder="Item name"
              className="px-4 py-2 bg-neutral-900 border border-neutral-700 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition"
            />
            <div>
              <label className="block text-xs text-neutral-400 mb-1">Required quantity (units)</label>
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
              Add
            </button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {equipment.length === 0 ? (
          <p className="text-neutral-500 col-span-full text-center py-8">
            No equipment added yet
          </p>
        ) : (
          equipment.map((item) => {
            const contributors = item.equipment_contributors || [];
            const isContributing = contributors.some((c) => c.user_id === user?.id);

            const brought = contributors.length;
            const needed = Math.max(0, (item.quantity_required || 0) - brought);

            // Invités éligibles au ping : pas encore contributeurs sur cet item
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
                      Required: <span className="text-neutral-200">{item.quantity_required}</span> •
                      Brought: <span className="text-green-400">{brought}</span> •
                      Needed: <span className="text-orange-300">{needed}</span>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    {brought > 0 && <Check className="w-5 h-5 text-green-500 flex-shrink-0" />}
                    {isCreator && (
                      <button
                        onClick={() => deleteEquipment(item.id)}
                        className="p-1 text-red-400 hover:bg-red-500/20 rounded transition"
                        title="Delete item"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {contributors.length > 0 && (
                  <div className="mb-3">
                    <div className="text-xs text-neutral-500 mb-1">Contributors:</div>
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
                  {isContributing ? "I won't bring this" : "I'll bring this"}
                </button>

                {/* Ping button — organizer only, item not fully covered */}
                {isCreator && needed > 0 && (
                  <div className="mt-2 pt-2 border-t border-neutral-700">
                    <button
                      onClick={() => setPingEquipmentId(pingEquipmentId === item.id ? null : item.id)}
                      className="flex items-center gap-1.5 text-xs text-orange-400 hover:text-orange-300 transition"
                    >
                      <Bell className="w-3.5 h-3.5" />
                      Relancer quelqu'un
                    </button>

                    {pingEquipmentId === item.id && (
                      <div className="mt-2 bg-neutral-900 rounded-lg overflow-hidden">
                        {pingableGuests.length === 0 ? (
                          <p className="text-xs text-neutral-500 px-3 py-2">
                            Tous les invités ont déjà contribué
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
    </div>
  );
}
