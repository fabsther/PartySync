import { useEffect, useState } from 'react';
import { UserPlus, Users, Share2, Copy, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface Subscriber {
  id: string;
  subscriber_id: string;
  profiles: {
    full_name: string | null;
    email: string;
  };
}

export function SubscribersList() {
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [subscribedTo, setSubscribedTo] = useState<Subscriber[]>([]);
  const [inviteCode, setInviteCode] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [friendCode, setFriendCode] = useState('');
  const [addingFriend, setAddingFriend] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    loadSubscribers();
    loadInviteCode();
  }, [user]);

  const loadSubscribers = async () => {
    if (!user) return;

    try {
      const { data: mySubscribers, error: subError } = await supabase
        .from('subscribers')
        .select('id, subscriber_id, profiles!subscribers_subscriber_id_fkey(full_name, email)')
        .eq('user_id', user.id);

      if (subError) throw subError;
      setSubscribers((mySubscribers as any) || []);

      const { data: iSubscribeTo, error: followError } = await supabase
        .from('subscribers')
        .select('id, user_id, profiles!subscribers_user_id_fkey(full_name, email)')
        .eq('subscriber_id', user.id);

      if (followError) throw followError;
      setSubscribedTo(
        (iSubscribeTo || []).map((item: any) => ({
          ...item,
          subscriber_id: item.user_id,
          profiles: item.profiles,
        }))
      );
    } catch (error) {
      console.error('Error loading subscribers:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadInviteCode = async () => {
    if (!user) return;
  
    try {
      // 1) Tenter de récupérer un unique code existant pour cet utilisateur
      //    - Si plusieurs existent déjà (legacy), on prend le plus récent.
      const { data: existingRows, error: selectError } = await supabase
        .from('invite_codes')
        .select('code, created_at')
        .eq('created_by', user.id)
        .order('created_at', { ascending: false }) // nécessite une colonne created_at, voir plus bas
        .limit(1);
  
      if (selectError) throw selectError;
  
      if (existingRows && existingRows.length > 0) {
        setInviteCode(existingRows[0].code);
        return;
      }
  
      // 2) Aucun code : en créer un, mais sans jamais dupliquer
      const newCode = generateInviteCode();
  
      // insert with onConflict -> ignore si un autre client l'a créé entre-temps
      const { error: insertError } = await supabase
        .from('invite_codes')
        .insert(
          { code: newCode, created_by: user.id },
          { onConflict: 'created_by', ignoreDuplicates: true }
        );
  
      if (insertError) throw insertError;
  
      // 3) Relire le code (que ce soit celui inséré ou celui pré-existant en cas de conflit)
      const { data: finalRow, error: finalSelectError } = await supabase
        .from('invite_codes')
        .select('code')
        .eq('created_by', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
  
      if (finalSelectError) throw finalSelectError;
      setInviteCode(finalRow.code);
    } catch (error) {
      console.error('Error loading invite code:', error);
    }
  };


  const generateInviteCode = () => {
    return Math.random().toString(36).substring(2, 10).toUpperCase();
  };

  const copyInviteLink = () => {
    const link = `${window.location.origin}?invite=${inviteCode}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

    const copyInviteCode = () => {
      navigator.clipboard.writeText(inviteCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    };
  
   const addFriendByCode = async () => {
    if (!user || !friendCode.trim()) return;
  
    setAddingFriend(true);
    try {
      const trimmedCode = friendCode.trim().toUpperCase();
  
      const { data: codeData, error: codeError } = await supabase
        .from('invite_codes')
        .select('created_by')
        .eq('code', trimmedCode)
        .maybeSingle();
  
      if (codeError) throw codeError;
  
      if (!codeData) {
        alert('Invalid invite code. Please check and try again.');
        return;
      }
  
      // check ID, not code
      if (codeData.created_by === user.id) {
        alert('You cannot subscribe to yourself!');
        return;
      }
  
      const { data: existing, error: existingError } = await supabase
        .from('subscribers')
        .select('id')
        .eq('user_id', codeData.created_by)
        .eq('subscriber_id', user.id)
        .maybeSingle();
  
      if (existingError && existingError.code !== 'PGRST116') throw existingError;
  
      if (existing) {
        alert('You are already subscribed to this user!');
        return;
      }
  
      const { error: insertError } = await supabase.from('subscribers').insert({
        user_id: codeData.created_by,
        subscriber_id: user.id,
      });
  
      if (insertError) throw insertError;
  
      setFriendCode('');
      await loadSubscribers();
      alert('Successfully added friend!');
    } catch (error) {
      console.error('Error adding friend by code:', error);
      alert('Failed to add friend. Please try again.');
    } finally {
      setAddingFriend(false);
    }
  };


  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="bg-gradient-to-br from-orange-500/10 to-orange-600/10 border border-orange-500/30 rounded-xl p-6">
        <div className="flex items-center space-x-3 mb-4">
          <Share2 className="w-6 h-6 text-orange-400" />
          <h2 className="text-xl font-bold text-white">Share Your Invite</h2>
        </div>
        <p className="text-neutral-300 mb-4">
          Share this link or code with friends. When they sign up or enter your code, they'll automatically become your subscribers
          and see your parties.
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-2">Invite Link</label>
            <div className="flex space-x-3">
              <input
                type="text"
                readOnly
                value={`${window.location.origin}?invite=${inviteCode}`}
                className="flex-1 px-4 py-3 bg-neutral-900 border border-neutral-700 rounded-lg text-white"
              />
              <button
                onClick={copyInviteLink}
                className="px-6 py-3 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition flex items-center space-x-2"
              >
                {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                <span>{copied ? 'Copied!' : 'Copy'}</span>
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-2">Your Invite Code</label>
            <div className="flex space-x-3">
              <input
                type="text"
                readOnly
                value={inviteCode}
                className="flex-1 px-4 py-3 bg-neutral-900 border border-neutral-700 rounded-lg text-white text-2xl font-mono tracking-wider text-center"
              />
              <button
                onClick={copyInviteCode}
                className="px-6 py-3 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition flex items-center space-x-2"
              >
                {copiedCode ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                <span>{copiedCode ? 'Copied!' : 'Copy'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-gradient-to-br from-green-500/10 to-green-600/10 border border-green-500/30 rounded-xl p-6">
        <div className="flex items-center space-x-3 mb-4">
          <UserPlus className="w-6 h-6 text-green-400" />
          <h2 className="text-xl font-bold text-white">Add Friend by Code</h2>
        </div>
        <p className="text-neutral-300 mb-4">
          Enter a friend's invite code to subscribe to their parties.
        </p>
        <div className="flex space-x-3">
          <input
            type="text"
            value={friendCode}
            onChange={(e) => setFriendCode(e.target.value.toUpperCase())}
            placeholder="Enter invite code"
            className="flex-1 px-4 py-3 bg-neutral-900 border border-neutral-700 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500 transition uppercase font-mono tracking-wider text-center text-xl"
            maxLength={8}
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addFriendByCode();
              }
            }}
          />
          <button
            onClick={addFriendByCode}
            disabled={addingFriend || !friendCode.trim()}
            className="px-6 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 transition flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <UserPlus className="w-5 h-5" />
            <span>{addingFriend ? 'Adding...' : 'Add'}</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
          <div className="flex items-center space-x-3 mb-6">
            <Users className="w-6 h-6 text-orange-400" />
            <h2 className="text-xl font-bold text-white">
              My Subscribers ({subscribers.length})
            </h2>
          </div>
          <div className="space-y-3">
            {subscribers.length === 0 ? (
              <p className="text-neutral-500 text-center py-8">
                No subscribers yet. Share your invite link to get started!
              </p>
            ) : (
              subscribers.map((sub) => (
                <div
                  key={sub.id}
                  className="flex items-center space-x-3 bg-neutral-800 rounded-lg p-4"
                >
                  <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-orange-600 rounded-full flex items-center justify-center text-white font-semibold">
                    {(sub.profiles.full_name || sub.profiles.email)[0].toUpperCase()}
                  </div>
                  <div>
                    <div className="text-white font-medium">
                      {sub.profiles.full_name || 'User'}
                    </div>
                    <div className="text-sm text-neutral-400">{sub.profiles.email}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
          <div className="flex items-center space-x-3 mb-6">
            <UserPlus className="w-6 h-6 text-orange-400" />
            <h2 className="text-xl font-bold text-white">
              Subscribed To ({subscribedTo.length})
            </h2>
          </div>
          <div className="space-y-3">
            {subscribedTo.length === 0 ? (
              <p className="text-neutral-500 text-center py-8">
                Not subscribed to anyone yet. Use an invite link to connect!
              </p>
            ) : (
              subscribedTo.map((sub) => (
                <div
                  key={sub.id}
                  className="flex items-center space-x-3 bg-neutral-800 rounded-lg p-4"
                >
                  <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-orange-600 rounded-full flex items-center justify-center text-white font-semibold">
                    {(sub.profiles.full_name || sub.profiles.email)[0].toUpperCase()}
                  </div>
                  <div>
                    <div className="text-white font-medium">
                      {sub.profiles.full_name || 'User'}
                    </div>
                    <div className="text-sm text-neutral-400">{sub.profiles.email}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
