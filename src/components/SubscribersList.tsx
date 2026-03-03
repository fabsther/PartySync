import { useEffect, useState } from 'react';
import { UserPlus, UserMinus, Users, Share2, Copy, Check, QrCode } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { QRModal } from './QRModal';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface Subscriber {
  id: string;
  subscriber_id: string;
  profiles: {
    full_name: string | null;
    email: string;
    avatar_url: string | null;
  };
}

export function SubscribersList() {
  const { t } = useTranslation('profile');
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [subscribedTo, setSubscribedTo] = useState<Subscriber[]>([]);
  const [inviteCode, setInviteCode] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [friendCode, setFriendCode] = useState('');
  const [addingFriend, setAddingFriend] = useState(false);
  const [confirmKickId, setConfirmKickId] = useState<string | null>(null);
  const [confirmUnsubId, setConfirmUnsubId] = useState<string | null>(null);
  const [showQR, setShowQR] = useState(false);
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
        .select('id, subscriber_id, profiles!subscribers_subscriber_id_fkey(full_name, email, avatar_url)')
        .eq('user_id', user.id);

      if (subError) throw subError;
      setSubscribers((mySubscribers as any) || []);

      const { data: iSubscribeTo, error: followError } = await supabase
        .from('subscribers')
        .select('id, user_id, profiles!subscribers_user_id_fkey(full_name, email, avatar_url)')
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
      const { data: existingRows, error: selectError } = await supabase
        .from('invite_codes')
        .select('code, created_at')
        .eq('created_by', user.id)
        .order('created_at', { ascending: false })
        .limit(1);

      if (selectError) throw selectError;

      if (existingRows && existingRows.length > 0) {
        setInviteCode(existingRows[0].code);
        return;
      }

      const newCode = generateInviteCode();

      const { error: insertError } = await supabase
        .from('invite_codes')
        .upsert(
          { code: newCode, created_by: user.id },
          { onConflict: 'created_by', ignoreDuplicates: true }
        );

      if (insertError) throw insertError;

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

  const kickSubscriber = async (rowId: string) => {
    try {
      const { error } = await supabase.from('subscribers').delete().eq('id', rowId);
      if (error) throw error;
      setSubscribers(prev => prev.filter(s => s.id !== rowId));
    } catch (e) {
      console.error('Error kicking subscriber:', e);
    }
  };

  const unsubscribeFrom = async (rowId: string) => {
    try {
      const { error } = await supabase.from('subscribers').delete().eq('id', rowId);
      if (error) throw error;
      setSubscribedTo(prev => prev.filter(s => s.id !== rowId));
    } catch (e) {
      console.error('Error unsubscribing:', e);
    }
  };

  const subscribeBack = async (targetUserId: string) => {
    if (!user) return;
    try {
      const { error } = await supabase.from('subscribers').insert({
        user_id: targetUserId,
        subscriber_id: user.id,
      });
      if (error && (error as any).code !== '23505') throw error;
      await loadSubscribers();
    } catch (e) {
      console.error('Error subscribing back:', e);
    }
  };

  const subscribedToIds = new Set(subscribedTo.map(s => s.subscriber_id));

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
        alert(t('invalid_code'));
        return;
      }

      if (codeData.created_by === user.id) {
        alert(t('self_subscribe'));
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
        alert(t('already_subscribed'));
        return;
      }

      const { error: insertError } = await supabase.from('subscribers').insert({
        user_id: codeData.created_by,
        subscriber_id: user.id,
      });

      if (insertError) throw insertError;

      setFriendCode('');
      await loadSubscribers();
      alert(t('added_friend'));
    } catch (error) {
      console.error('Error adding friend by code:', error);
      alert(t('add_failed'));
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
          <h2 className="text-xl font-bold text-white">{t('share_invite')}</h2>
        </div>
        <p className="text-neutral-300 mb-4">{t('share_invite_hint')}</p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-2">{t('invite_link')}</label>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={`${window.location.origin}?invite=${inviteCode}`}
                className="flex-1 min-w-0 px-4 py-3 bg-neutral-900 border border-neutral-700 rounded-lg text-white text-sm"
              />
              <button
                onClick={() => setShowQR(true)}
                className="shrink-0 px-3 py-3 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white border border-neutral-700 rounded-lg transition"
                title="QR code"
              >
                <QrCode className="w-5 h-5" />
              </button>
              <button
                onClick={copyInviteLink}
                className="shrink-0 px-3 sm:px-5 py-3 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition flex items-center gap-2"
              >
                {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                <span className="hidden sm:inline">{copied ? t('copied', { ns: 'common' }) : t('copy', { ns: 'common' })}</span>
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-2">{t('invite_code')}</label>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={inviteCode}
                className="flex-1 min-w-0 px-4 py-3 bg-neutral-900 border border-neutral-700 rounded-lg text-white text-xl font-mono tracking-wider text-center"
              />
              <button
                onClick={copyInviteCode}
                className="shrink-0 px-3 sm:px-5 py-3 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition flex items-center gap-2"
              >
                {copiedCode ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                <span className="hidden sm:inline">{copiedCode ? t('copied', { ns: 'common' }) : t('copy', { ns: 'common' })}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-gradient-to-br from-green-500/10 to-green-600/10 border border-green-500/30 rounded-xl p-6">
        <div className="flex items-center space-x-3 mb-4">
          <UserPlus className="w-6 h-6 text-green-400" />
          <h2 className="text-xl font-bold text-white">{t('add_friend')}</h2>
        </div>
        <p className="text-neutral-300 mb-4">{t('add_friend_hint')}</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={friendCode}
            onChange={(e) => setFriendCode(e.target.value.toUpperCase())}
            placeholder={t('enter_code')}
            className="flex-1 min-w-0 px-4 py-3 bg-neutral-900 border border-neutral-700 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500 transition uppercase font-mono tracking-wider text-center text-xl"
            maxLength={8}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addFriendByCode();
              }
            }}
          />
          <button
            onClick={addFriendByCode}
            disabled={addingFriend || !friendCode.trim()}
            className="shrink-0 px-4 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 transition flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <UserPlus className="w-5 h-5" />
            <span className="hidden sm:inline">{addingFriend ? t('adding') : t('add', { ns: 'common' })}</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
          <div className="flex items-center space-x-3 mb-6">
            <Users className="w-6 h-6 text-orange-400" />
            <h2 className="text-xl font-bold text-white">
              {t('my_subscribers', { count: subscribers.length })}
            </h2>
          </div>
          <div className="space-y-3">
            {subscribers.length === 0 ? (
              <p className="text-neutral-500 text-center py-8">{t('no_subscribers')}</p>
            ) : (
              subscribers.map((sub) => (
                <div
                  key={sub.id}
                  className="flex items-center gap-3 bg-neutral-800 rounded-lg p-3"
                >
                  {sub.profiles.avatar_url ? (
                    <img src={sub.profiles.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-9 h-9 bg-gradient-to-br from-orange-500 to-orange-600 rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0">
                      {(sub.profiles.full_name || sub.profiles.email)[0].toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-white font-medium truncate">
                      {sub.profiles.full_name || t('user', { ns: 'common' })}
                    </div>
                    <div className="text-xs text-neutral-400 truncate">{sub.profiles.email}</div>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    {!subscribedToIds.has(sub.subscriber_id) && (
                      <button
                        onClick={() => subscribeBack(sub.subscriber_id)}
                        className="p-1.5 rounded-lg text-green-400 hover:bg-green-500/10 transition"
                        title={t('subscribe_back')}
                      >
                        <UserPlus className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => setConfirmKickId(sub.id)}
                      className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/10 transition"
                      title={t('remove_subscriber_title')}
                    >
                      <UserMinus className="w-4 h-4" />
                    </button>
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
              {t('subscribed_to', { count: subscribedTo.length })}
            </h2>
          </div>
          <div className="space-y-3">
            {subscribedTo.length === 0 ? (
              <p className="text-neutral-500 text-center py-8">{t('no_subscribed')}</p>
            ) : (
              subscribedTo.map((sub) => (
                <div
                  key={sub.id}
                  className="flex items-center gap-3 bg-neutral-800 rounded-lg p-3"
                >
                  {sub.profiles.avatar_url ? (
                    <img src={sub.profiles.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-9 h-9 bg-gradient-to-br from-orange-500 to-orange-600 rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0">
                      {(sub.profiles.full_name || sub.profiles.email)[0].toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-white font-medium truncate">
                      {sub.profiles.full_name || t('user', { ns: 'common' })}
                    </div>
                    <div className="text-xs text-neutral-400 truncate">{sub.profiles.email}</div>
                  </div>
                  <button
                    onClick={() => setConfirmUnsubId(sub.id)}
                    className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/10 transition flex-shrink-0"
                    title={t('unsubscribe_title')}
                  >
                    <UserMinus className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {showQR && (
        <QRModal
          url={`${window.location.origin}?invite=${inviteCode}`}
          title={t('qr_title')}
          subtitle={t('qr_subtitle')}
          onClose={() => setShowQR(false)}
        />
      )}

      {(confirmKickId || confirmUnsubId) && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <p className="text-white font-medium mb-1">
              {confirmKickId ? t('remove_subscriber') : t('unsubscribe')}
            </p>
            <p className="text-neutral-400 text-sm mb-6">
              {confirmKickId ? t('remove_subscriber_hint') : t('unsubscribe_hint')}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  if (confirmKickId) { kickSubscriber(confirmKickId); setConfirmKickId(null); }
                  else if (confirmUnsubId) { unsubscribeFrom(confirmUnsubId); setConfirmUnsubId(null); }
                }}
                className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-xl font-medium transition"
              >
                {t('confirm', { ns: 'common' })}
              </button>
              <button
                onClick={() => { setConfirmKickId(null); setConfirmUnsubId(null); }}
                className="flex-1 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-xl font-medium transition"
              >
                {t('cancel', { ns: 'common' })}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
