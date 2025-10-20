import { useEffect, useState } from 'react';
import { Plus, DollarSign } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface FoodItem {
  id: string;
  name: string;
  category: string;
  base_quantity: string;
  estimated_cost: number;
  food_contributions: Array<{
    id: string;
    user_id: string;
    quantity: string;
    is_extra: boolean;
    profiles: {
      full_name: string | null;
      email: string;
    };
  }>;
}

interface FoodBeverageProps {
  partyId: string;
  creatorId: string;
}

const defaultFoodItems = [
  { name: 'Burgers', category: 'meat', base_quantity: '1 per person', estimated_cost: 3 },
  { name: 'Hot Dogs', category: 'meat', base_quantity: '2 per person', estimated_cost: 2 },
  { name: 'Veggie Burgers', category: 'vegetarian', base_quantity: '0.5 per person', estimated_cost: 3.5 },
  { name: 'Salad', category: 'sides', base_quantity: '200g per person', estimated_cost: 1.5 },
  { name: 'Chips', category: 'snacks', base_quantity: '50g per person', estimated_cost: 1 },
  { name: 'Soda', category: 'drinks', base_quantity: '2 cans per person', estimated_cost: 1 },
  { name: 'Beer', category: 'drinks', base_quantity: '3 per person', estimated_cost: 2 },
  { name: 'Water', category: 'drinks', base_quantity: '2 bottles per person', estimated_cost: 0.5 },
];

export function FoodBeverage({ partyId, creatorId }: FoodBeverageProps) {
  const [foodItems, setFoodItems] = useState<FoodItem[]>([]);
  const [guestCount, setGuestCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [newItem, setNewItem] = useState({
    name: '',
    category: 'general',
    base_quantity: '',
    estimated_cost: 0,
  });
  const { user } = useAuth();

  useEffect(() => {
    loadFoodItems();
    loadGuestCount();
  }, [partyId]);

  const loadGuestCount = async () => {
    try {
      const { data: guests, error } = await supabase
        .from('party_guests')
        .select('id, guest_companions(id)')
        .eq('party_id', partyId)
        .eq('status', 'confirmed');

      if (error) throw error;

      const confirmedCount = guests?.length || 0;
      const companionsCount = guests?.reduce((sum, guest) => {
        return sum + ((guest.guest_companions as any)?.length || 0);
      }, 0) || 0;

      setGuestCount(confirmedCount + companionsCount);
    } catch (error) {
      console.error('Error loading guest count:', error);
      setGuestCount(4);
    }
  };

  const loadFoodItems = async () => {
    try {
      const { data, error } = await supabase
        .from('food_items')
        .select('*, food_contributions(id, user_id, quantity, is_extra, profiles(full_name, email))')
        .eq('party_id', partyId);

      if (error) throw error;
      setFoodItems(data as FoodItem[] || []);
    } catch (error) {
      console.error('Error loading food items:', error);
    } finally {
      setLoading(false);
    }
  };

  const addDefaultItems = async () => {
    try {
      const items = defaultFoodItems.map((item) => ({
        party_id: partyId,
        ...item,
      }));

      const { error } = await supabase.from('food_items').insert(items);
      if (error) throw error;
      loadFoodItems();
    } catch (error) {
      console.error('Error adding default food items:', error);
    }
  };

  const addCustomItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItem.name.trim()) return;

    try {
      const { error } = await supabase.from('food_items').insert({
        party_id: partyId,
        ...newItem,
      });

      if (error) throw error;
      setNewItem({ name: '', category: 'general', base_quantity: '', estimated_cost: 0 });
      setShowForm(false);
      loadFoodItems();
    } catch (error) {
      console.error('Error adding food item:', error);
    }
  };

  const addContribution = async (foodItemId: string, quantity: string) => {
    if (!user) return;

    try {
      const { error } = await supabase.from('food_contributions').insert({
        food_item_id: foodItemId,
        user_id: user.id,
        quantity,
        is_extra: false,
      });

      if (error) throw error;
      loadFoodItems();
    } catch (error) {
      console.error('Error adding contribution:', error);
    }
  };

  const removeContribution = async (contributionId: string) => {
    try {
      const { error } = await supabase
        .from('food_contributions')
        .delete()
        .eq('id', contributionId);

      if (error) throw error;
      loadFoodItems();
    } catch (error) {
      console.error('Error removing contribution:', error);
    }
  };

  const calculateTotalCost = () => {
    return foodItems.reduce((total, item) => {
      const multiplier = Math.max(guestCount, 4);
      return total + item.estimated_cost * multiplier;
    }, 0);
  };

  const calculatePerPersonCost = () => {
    const total = calculateTotalCost();
    const people = Math.max(guestCount, 4);
    return total / people;
  };

  if (loading) {
    return <div className="text-center text-neutral-400">Loading food & beverages...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-br from-orange-500/10 to-orange-600/10 border border-orange-500/30 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-neutral-400 mb-1">Estimated Total Cost</div>
            <div className="text-2xl font-bold text-white flex items-center">
              <DollarSign className="w-6 h-6" />
              {calculateTotalCost().toFixed(2)}
            </div>
          </div>
          <div>
            <div className="text-sm text-neutral-400 mb-1">Per Person</div>
            <div className="text-2xl font-bold text-white flex items-center">
              <DollarSign className="w-6 h-6" />
              {calculatePerPersonCost().toFixed(2)}
            </div>
          </div>
          <div>
            <div className="text-sm text-neutral-400 mb-1">Confirmed Guests</div>
            <div className="text-2xl font-bold text-white">{guestCount}</div>
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
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-neutral-800 text-white rounded-lg hover:bg-neutral-700 transition flex items-center space-x-2"
        >
          <Plus className="w-4 h-4" />
          <span>Add Custom Item</span>
        </button>
      </div>

      {showForm && (
        <form onSubmit={addCustomItem} className="bg-neutral-800 rounded-lg p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input
              type="text"
              value={newItem.name}
              onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
              placeholder="Item name"
              className="px-4 py-2 bg-neutral-900 border border-neutral-700 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition"
            />
            <input
              type="text"
              value={newItem.category}
              onChange={(e) => setNewItem({ ...newItem, category: e.target.value })}
              placeholder="Category"
              className="px-4 py-2 bg-neutral-900 border border-neutral-700 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition"
            />
            <input
              type="text"
              value={newItem.base_quantity}
              onChange={(e) => setNewItem({ ...newItem, base_quantity: e.target.value })}
              placeholder="Quantity (e.g., 2 per person)"
              className="px-4 py-2 bg-neutral-900 border border-neutral-700 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition"
            />
            <div>
            <input
              type="number"
              step="0.01"
              value={newItem.estimated_cost}
              onChange={(e) =>
                setNewItem({ ...newItem, estimated_cost: parseFloat(e.target.value) || 0 })
              }
              placeholder="Cost per unit"
              
              className="px-4 py-2 bg-neutral-900 border border-neutral-700 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition"
            />
            <span class="unit" className="px-4 py-2" >€</span>
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
            const myContribution = item.food_contributions.find((c) => c.user_id === user?.id);
            const otherContributions = item.food_contributions.filter((c) => c.user_id !== user?.id);

            return (
              <div key={item.id} className="bg-neutral-800 rounded-lg p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h4 className="text-white font-medium text-lg">{item.name}</h4>
                    <div className="flex items-center space-x-4 mt-1">
                      <span className="text-sm text-neutral-400 capitalize">{item.category}</span>
                      <span className="text-sm text-neutral-400">{item.base_quantity}</span>
                      <span className="text-sm text-orange-400 flex items-center">
                        <DollarSign className="w-3 h-3" />
                        {item.estimated_cost.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>

                {otherContributions.length > 0 && (
                  <div className="mb-3 p-3 bg-neutral-900 rounded">
                    <div className="text-xs text-neutral-500 mb-2">Others bringing:</div>
                    {otherContributions.map((contrib) => (
                      <div key={contrib.id} className="text-sm text-neutral-300">
                        {contrib.profiles.full_name || contrib.profiles.email} - {contrib.quantity}
                      </div>
                    ))}
                  </div>
                )}

                {myContribution ? (
                  <div className="flex items-center justify-between bg-green-500/10 rounded p-3">
                    <span className="text-green-400 text-sm">
                      You're bringing: {myContribution.quantity}
                    </span>
                    <button
                      onClick={() => removeContribution(myContribution.id)}
                      className="px-3 py-1 bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 transition text-sm"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      const quantity = prompt(`How much ${item.name} will you bring?`);
                      if (quantity) addContribution(item.id, quantity);
                    }}
                    className="w-full px-3 py-2 bg-orange-500/20 text-orange-400 rounded hover:bg-orange-500/30 transition text-sm font-medium"
                  >
                    I'll bring this
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
