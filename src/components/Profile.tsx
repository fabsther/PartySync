import { useState, useEffect, useRef } from 'react';
import { User, Mail, MapPin, Save, Loader, Camera, X, LogOut, Bell, BellOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { uploadAvatarMedia, deletePartyMedia } from '../lib/uploadMedia';
import { registerNotificationToken, unregisterPushSubscription, checkNotificationSupport } from '../lib/notifications';
import { LanguageSelector } from './LanguageSelector';

type NotifStatus = 'active' | 'inactive' | 'denied' | 'unsupported';

export function Profile() {
  const { user, signOut } = useAuth();
  const { t } = useTranslation('profile');

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const [notifStatus, setNotifStatus] = useState<NotifStatus>('inactive');
  const [notifLoading, setNotifLoading] = useState(false);

  const refreshNotifStatus = async () => {
    if (!checkNotificationSupport()) { setNotifStatus('unsupported'); return; }
    if (Notification.permission === 'denied') { setNotifStatus('denied'); return; }
    const reg = await navigator.serviceWorker.getRegistration().catch(() => null);
    const sub = reg ? await reg.pushManager.getSubscription().catch(() => null) : null;
    setNotifStatus(Notification.permission === 'granted' && !!sub ? 'active' : 'inactive');
  };

  useEffect(() => { refreshNotifStatus(); }, []);

  const handleNotifToggle = async () => {
    if (!user || notifLoading) return;
    if (notifStatus === 'denied') {
      alert(t('notif_blocked_alert'));
      return;
    }
    setNotifLoading(true);
    try {
      if (notifStatus === 'active') {
        await unregisterPushSubscription(user.id);
      } else {
        await registerNotificationToken(user.id);
      }
      await refreshNotifStatus();
    } finally {
      setNotifLoading(false);
    }
  };

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState('');
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    profile_location: '',
    avatar_url: '',
  });

  const avatarInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadProfile();
  }, [user]);

  const loadProfile = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setFormData({
          full_name: data.full_name || '',
          email: data.email || '',
          profile_location: data.profile_location || '',
          avatar_url: data.avatar_url || '',
        });
      }
    } catch (error) {
      console.error('Error loading profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setAvatarError('');

    if (!file.type.startsWith('image/')) {
      setAvatarError(t('avatar_images_only'));
      e.target.value = '';
      return;
    }

    setUploadingAvatar(true);
    try {
      if (formData.avatar_url && formData.avatar_url.includes('party-media')) {
        await deletePartyMedia(formData.avatar_url).catch(() => {});
      }

      const url = await uploadAvatarMedia(file, user.id);

      const { error } = await supabase
        .from('profiles')
        .update({ avatar_url: url, updated_at: new Date().toISOString() })
        .eq('id', user.id);
      if (error) throw error;

      setFormData(prev => ({ ...prev, avatar_url: url }));
    } catch (err: any) {
      setAvatarError(err.message || t('avatar_upload_failed'));
    } finally {
      setUploadingAvatar(false);
      e.target.value = '';
    }
  };

  const removeAvatar = async () => {
    if (!user || !formData.avatar_url) return;
    setUploadingAvatar(true);
    try {
      if (formData.avatar_url.includes('party-media')) {
        await deletePartyMedia(formData.avatar_url).catch(() => {});
      }
      const { error } = await supabase
        .from('profiles')
        .update({ avatar_url: null, updated_at: new Date().toISOString() })
        .eq('id', user.id);
      if (error) throw error;
      setFormData(prev => ({ ...prev, avatar_url: '' }));
    } catch (err: any) {
      setAvatarError(err.message || t('avatar_delete_failed'));
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: formData.full_name.trim() || null,
          profile_location: formData.profile_location.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      if (error) throw error;

      alert(t('profile_updated'));
    } catch (error) {
      console.error('Error updating profile:', error);
      alert(t('profile_update_failed'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
      </div>
    );
  }

  const initials = (formData.full_name || formData.email || '?')[0].toUpperCase();

  return (
    <div className="max-w-3xl mx-auto">
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 sm:p-8">
        <div className="flex items-center space-x-3 mb-8">
          <div className="bg-gradient-to-br from-orange-500 to-orange-600 p-3 rounded-lg">
            <User className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">{t('my_profile')}</h1>
            <p className="text-neutral-400 text-sm">{t('manage_info')}</p>
          </div>
        </div>

        {/* Avatar upload */}
        <div className="flex flex-col items-center mb-8">
          <div className="relative group">
            <div
              className="w-24 h-24 rounded-full overflow-hidden cursor-pointer border-2 border-neutral-700 hover:border-orange-500 transition"
              onClick={() => !uploadingAvatar && avatarInputRef.current?.click()}
            >
              {formData.avatar_url ? (
                <img
                  src={formData.avatar_url}
                  alt="Avatar"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center text-white text-3xl font-bold">
                  {initials}
                </div>
              )}
              <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                {uploadingAvatar
                  ? <Loader className="w-6 h-6 text-white animate-spin" />
                  : <Camera className="w-6 h-6 text-white" />
                }
              </div>
            </div>

            {formData.avatar_url && !uploadingAvatar && (
              <button
                type="button"
                onClick={removeAvatar}
                className="absolute -top-1 -right-1 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center hover:bg-red-600 transition"
                title={t('remove_avatar')}
              >
                <X className="w-3.5 h-3.5 text-white" />
              </button>
            )}
          </div>

          <p className="text-xs text-neutral-500 mt-2">{t('avatar_click_change')}</p>
          {avatarError && <p className="text-xs text-red-400 mt-1">{avatarError}</p>}

          <input
            ref={avatarInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAvatarChange}
          />
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-2">
              <Mail className="w-4 h-4 inline mr-2" />
              {t('email_address')}
            </label>
            <input
              type="email"
              value={formData.email}
              disabled
              className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-neutral-500 cursor-not-allowed"
            />
            <p className="text-xs text-neutral-500 mt-1">{t('email_cannot_change')}</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-2">
              <User className="w-4 h-4 inline mr-2" />
              {t('full_name')}
            </label>
            <input
              type="text"
              value={formData.full_name}
              onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
              placeholder={t('full_name_placeholder')}
              className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition"
            />
            <p className="text-xs text-neutral-500 mt-1">{t('full_name_hint')}</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-2">
              <MapPin className="w-4 h-4 inline mr-2" />
              {t('default_location')}
            </label>
            <input
              type="text"
              value={formData.profile_location}
              onChange={(e) => setFormData({ ...formData, profile_location: e.target.value })}
              placeholder={t('default_location_placeholder')}
              className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition"
            />
            <p className="text-xs text-neutral-500 mt-1">{t('default_location_hint')}</p>
          </div>

          <div className="pt-4 border-t border-neutral-800">
            <button
              type="submit"
              disabled={saving}
              className="w-full md:w-auto px-8 py-3 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-lg font-medium hover:from-orange-600 hover:to-orange-700 transition flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? (
                <>
                  <Loader className="w-5 h-5 animate-spin" />
                  <span>{t('saving')}</span>
                </>
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  <span>{t('save_changes')}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      <div className="mt-6 bg-neutral-900 border border-neutral-800 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4">{t('account_info')}</h3>
        <div className="space-y-3 text-sm">
          <div>
            <div className="text-neutral-400 mb-1">{t('user_id')}</div>
            <div className="text-neutral-300 font-mono text-xs break-all">{user?.id}</div>
          </div>
        </div>
      </div>

      {/* Language */}
      <div className="mt-6 bg-neutral-900 border border-neutral-800 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4">{t('language')}</h3>
        <LanguageSelector />
      </div>

      {notifStatus !== 'unsupported' && (
        <div className="mt-6 bg-neutral-900 border border-neutral-800 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-1">{t('notifications')}</h3>
          <p className="text-neutral-400 text-sm mb-4">
            {notifStatus === 'active' && t('notif_active')}
            {notifStatus === 'inactive' && t('notif_inactive')}
            {notifStatus === 'denied' && t('notif_denied')}
          </p>
          <button
            onClick={handleNotifToggle}
            disabled={notifLoading}
            className={`w-full flex items-center justify-center space-x-2 px-4 py-3 rounded-xl font-medium transition disabled:opacity-50 disabled:cursor-not-allowed ${
              notifStatus === 'active'
                ? 'bg-green-600/20 text-green-400 border border-green-500/40 hover:bg-green-600/30'
                : notifStatus === 'denied'
                ? 'bg-neutral-800 text-neutral-500 border border-neutral-700 cursor-default'
                : 'bg-orange-500/10 text-orange-400 border border-orange-500/30 hover:bg-orange-500/20'
            }`}
          >
            {notifLoading ? (
              <Loader className="w-5 h-5 animate-spin" />
            ) : notifStatus === 'active' ? (
              <Bell className="w-5 h-5" />
            ) : (
              <BellOff className="w-5 h-5" />
            )}
            <span>
              {notifLoading
                ? t('notif_loading')
                : notifStatus === 'active'
                ? t('notif_enabled')
                : notifStatus === 'denied'
                ? t('notif_blocked')
                : t('notif_disabled')}
            </span>
          </button>
        </div>
      )}

      <div className="mt-6">
        <button
          onClick={handleSignOut}
          className="w-full flex items-center justify-center space-x-2 px-4 py-3 text-red-400 hover:text-red-300 hover:bg-red-500/10 border border-red-500/30 rounded-xl transition"
        >
          <LogOut className="w-5 h-5" />
          <span className="font-medium">{t('sign_out')}</span>
        </button>
      </div>
    </div>
  );
}
