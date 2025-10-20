import { useEffect, useState } from 'react';
import { Plus, Check, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface EquipmentItem {
  id: string;
  name: string;
  category: string;
  is_required: boolean;
  is_available: boolean;
  equipment_contributors: Array<{
    user_id: string;
    profiles: {
      full_name: string | null;
      email: string;
    };
  }>;
}

interface EquipmentProps {
  partyId: string;
  creatorId: string;
}

const defaultEquipment = [
  { name: 'BBQ Grill', category: 'cooking' },
  { name: 'Plancha', category: 'cooking' },
  { name: 'Cooler', category: 'general' },
  { name: 'Bluetooth Speaker', category: 'entertainment' },
  { name: 'Guitar', category: 'entertainment' },
  { name: 'Folding Tables', category: 'furniture' },
  { name: 'Folding Chairs', category: 'furniture' },
  { name: 'Sun Umbrella', category: 'outdoor' },
];

export function Equipment({ partyId, creatorId }: EquipmentProps) {
  const [equipment, setEquipment] = useState<EquipmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const { user } = useAuth();

  useEffect(() => {
    loadEquipment();
  }, [partyId]);

  const loadEquipment = async () => {
    try {
      const { data, error } = await supabase
        .from('equipment')
        .select('*, equipment_contributors(user_id, profiles(full_name, email))')
        .eq('party_id', partyId);

      if (error) throw error;
      setEquipment(data as EquipmentItem[] || []);
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
        category: item.category,
        is_required: true,
        is_available: false,
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
    if (!newItemName.trim()) return;

    try {
      const { error } = await supabase.from('equipment').insert({
        party_id: partyId,
        name: newItemName,
        category: 'general',
        is_required: false,
        is_available: false,
      });

      if (error) throw error;
      setNewItemName('');
      setShowForm(false);
      loadEquipment();
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

  if (loading) {
    return <div className="text-center text-neutral-400">Loading equipment...</div>;
  }

  const isCreator = user?.id === creatorId;

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
          <div className="flex space-x-3">
            <input
              type="text"
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              placeholder="Item name"
              className="flex-1 px-4 py-2 bg-neutral-900 border border-neutral-700 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition"
            />
            <button
              type="submit"
              className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition"
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
            const isContributing = item.equipment_contributors.some(
              (c) => c.user_id === user?.id
            );
            const contributors = item.equipment_contributors.map(
              (c) => c.profiles.full_name || c.profiles.email
            );

            return (
              <div
                key={item.id}
                className={`bg-neutral-800 rounded-lg p-4 border-2 transition ${
                  contributors.length > 0
                    ? 'border-green-500/50'
                    : 'border-neutral-700'
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h4 className="text-white font-medium">{item.name}</h4>
                    <span className="text-xs text-neutral-500 capitalize">{item.category}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    {contributors.length > 0 && (
                      <Check className="w-5 h-5 text-green-500 flex-shrink-0" />
                    )}
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
                    <div className="text-xs text-neutral-500 mb-1">Bringing:</div>
                    <div className="text-sm text-green-400">
                      {contributors.join(', ')}
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
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
