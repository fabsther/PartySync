import { useState, useEffect } from 'react';
import { User, Mail, MapPin, Save, Loader, Bell, BellRing } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { registerNotificationToken, sendLocalNotification } from '../lib/notifications';

export function Profile() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    profile_location: '',
    avatar_url: '',
  });

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
          avatar_url: formData.avatar_url.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      if (error) throw error;

      alert('Profile updated successfully!');
    } catch (error) {
      console.error('Error updating profile:', error);
      alert('Failed to update profile. Please try again.');
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

  return (
    <div className="max-w-3xl mx-auto">
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-8">
        <div className="flex items-center space-x-3 mb-8">
          <div className="bg-gradient-to-br from-orange-500 to-orange-600 p-3 rounded-lg">
            <User className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">My Profile</h1>
            <p className="text-neutral-400 text-sm">Manage your personal information</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-2">
              <Mail className="w-4 h-4 inline mr-2" />
              Email Address
            </label>
            <input
              type="email"
              value={formData.email}
              disabled
              className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-neutral-500 cursor-not-allowed"
            />
            <p className="text-xs text-neutral-500 mt-1">Email cannot be changed</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-2">
              <User className="w-4 h-4 inline mr-2" />
              Full Name
            </label>
            <input
              type="text"
              value={formData.full_name}
              onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
              placeholder="Enter your full name"
              className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition"
            />
            <p className="text-xs text-neutral-500 mt-1">
              This is how other users will see your name
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-2">
              <MapPin className="w-4 h-4 inline mr-2" />
              Default Location
            </label>
            <input
              type="text"
              value={formData.profile_location}
              onChange={(e) => setFormData({ ...formData, profile_location: e.target.value })}
              placeholder="e.g., New York, NY"
              className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition"
            />
            <p className="text-xs text-neutral-500 mt-1">
              Used to auto-fill location when requesting rides
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-2">
              Avatar URL (Optional)
            </label>
            <input
              type="url"
              value={formData.avatar_url}
              onChange={(e) => setFormData({ ...formData, avatar_url: e.target.value })}
              placeholder="https://example.com/avatar.jpg"
              className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition"
            />
            <p className="text-xs text-neutral-500 mt-1">Link to your profile picture</p>
          </div>

          {formData.avatar_url && (
            <div className="bg-neutral-800 rounded-lg p-4 border border-neutral-700">
              <p className="text-sm text-neutral-300 mb-3">Avatar Preview</p>
              <img
                src={formData.avatar_url}
                alt="Avatar preview"
                className="w-24 h-24 rounded-full object-cover border-2 border-orange-500"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            </div>
          )}

          <div className="pt-4 border-t border-neutral-800">
            <button
              type="submit"
              disabled={saving}
              className="w-full md:w-auto px-8 py-3 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-lg font-medium hover:from-orange-600 hover:to-orange-700 transition flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? (
                <>
                  <Loader className="w-5 h-5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  <span>Save Changes</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      <div className="mt-6 bg-neutral-900 border border-neutral-800 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Account Information</h3>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-neutral-400">User ID</span>
            <span className="text-neutral-300 font-mono">{user?.id}</span>
          </div>
        </div>
      </div>

      {/* Section Test Notifications */}
      {/* <NotificationTestSection userId={user?.id} /> */}
    </div>
  );
}

function NotificationTestSection({ userId }: { userId?: string }) {
  const [testingLocal, setTestingLocal] = useState(false);
  const [testingPush, setTestingPush] = useState(false);
  const [pushStatus, setPushStatus] = useState<string>('');
  const [subscriptionInfo, setSubscriptionInfo] = useState<string>('');

  useEffect(() => {
    checkSubscription();
  }, []);

  const checkSubscription = async () => {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          setSubscriptionInfo(`✅ Push subscription active\nEndpoint: ${subscription.endpoint.substring(0, 50)}...`);
        } else {
          setSubscriptionInfo('❌ No push subscription');
        }
      } catch (e) {
        setSubscriptionInfo(`❌ Error: ${e}`);
      }
    } else {
      setSubscriptionInfo('❌ Push not supported');
    }
  };

  const testLocalNotification = async () => {
    setTestingLocal(true);
    try {
      await sendLocalNotification(
        '🎉 Test Local',
        'Cette notification est locale (Service Worker)',
        { test: true }
      );
      setPushStatus('✅ Local notification sent!');
    } catch (e: any) {
      setPushStatus(`❌ Local error: ${e.message}`);
    }
    setTestingLocal(false);
  };

  const testPushNotification = async () => {
    if (!userId) return;
    setTestingPush(true);
    setPushStatus('Sending push...');
    
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const { data: { session } } = await supabase.auth.getSession();
      
      const resp = await fetch(`${supabaseUrl}/functions/v1/send-push`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify({
          userId,
          title: '🚀 Test Push',
          body: 'Cette notification vient du serveur (Edge Function)',
          url: '/',
        }),
      });
      
      const result = await resp.json();
      console.log('[Push Test] Response:', result);
      
      if (resp.ok) {
        setPushStatus(`✅ Push sent! Result: ${JSON.stringify(result)}`);
      } else {
        setPushStatus(`❌ Push failed: ${JSON.stringify(result)}`);
      }
    } catch (e: any) {
      console.error('[Push Test] Error:', e);
      setPushStatus(`❌ Push error: ${e.message}`);
    }
    setTestingPush(false);
  };

  const reRegisterPush = async () => {
    if (!userId) return;
    setPushStatus('Re-registering...');
    try {
      const success = await registerNotificationToken(userId);
      if (success) {
        setPushStatus('✅ Push subscription re-registered!');
        checkSubscription();
      } else {
        setPushStatus('❌ Failed to register push');
      }
    } catch (e: any) {
      setPushStatus(`❌ Error: ${e.message}`);
    }
  };

  return (
    <div className="mt-6 bg-neutral-900 border border-neutral-800 rounded-xl p-6">
      <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
        <BellRing className="w-5 h-5 text-orange-500" />
        Test Notifications
      </h3>
      
      {/* Subscription Status */}
      <div className="bg-neutral-800 rounded-lg p-4 mb-4">
        <p className="text-sm text-neutral-400 mb-2">Push Subscription Status:</p>
        <pre className="text-xs text-neutral-300 whitespace-pre-wrap">{subscriptionInfo || 'Checking...'}</pre>
      </div>

      {/* Test Buttons */}
      <div className="flex flex-wrap gap-3 mb-4">
        <button
          onClick={testLocalNotification}
          disabled={testingLocal}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 flex items-center gap-2"
        >
          {testingLocal ? <Loader className="w-4 h-4 animate-spin" /> : <Bell className="w-4 h-4" />}
          Test Local
        </button>
        
        <button
          onClick={testPushNotification}
          disabled={testingPush}
          className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 flex items-center gap-2"
        >
          {testingPush ? <Loader className="w-4 h-4 animate-spin" /> : <BellRing className="w-4 h-4" />}
          Test Push (Edge Function)
        </button>

        <button
          onClick={reRegisterPush}
          className="px-4 py-2 bg-neutral-700 hover:bg-neutral-600 text-white rounded-lg text-sm font-medium flex items-center gap-2"
        >
          Re-register Push
        </button>
      </div>

      {/* Status */}
      {pushStatus && (
        <div className="bg-neutral-800 rounded-lg p-3">
          <p className="text-sm text-neutral-300 whitespace-pre-wrap">{pushStatus}</p>
        </div>
      )}
    </div>
  );
}
