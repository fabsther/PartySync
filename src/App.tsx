import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { AuthForm } from './components/AuthForm';
import { Layout } from './components/Layout';
import { PartyList } from './components/PartyList';
import { PartyDetail } from './components/PartyDetail';
import { CreatePartyModal } from './components/CreatePartyModal';
import { SubscribersList } from './components/SubscribersList';
import { supabase } from './lib/supabase';
import { registerNotificationToken, checkNotificationSupport } from './lib/notifications';

function AppContent() {
  const { user, loading } = useAuth();
  const [activeTab, setActiveTab] = useState<'parties' | 'subscribers'>('parties');
  const [selectedPartyId, setSelectedPartyId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const inviteCode = params.get('invite');

    if (inviteCode && user) {
      handleInviteCode(inviteCode);
    }
  }, [user]);

  useEffect(() => {
    if (user && checkNotificationSupport()) {
      const hasAskedForPermission = localStorage.getItem('notification-permission-asked');

      if (!hasAskedForPermission) {
        setTimeout(() => {
          registerNotificationToken(user.id).then((success) => {
            if (success) {
              localStorage.setItem('notification-permission-asked', 'true');
            }
          });
        }, 2000);
      } else if (Notification.permission === 'granted') {
        registerNotificationToken(user.id);
      }
    }
  }, [user]);

  const handleInviteCode = async (code: string) => {
    if (!user) return;

    try {
      const { data: invite, error: inviteError } = await supabase
        .from('invite_codes')
        .select('created_by')
        .eq('code', code)
        .maybeSingle();

      if (inviteError || !invite) return;

      const { error: subError } = await supabase
        .from('subscribers')
        .insert({
          user_id: invite.created_by,
          subscriber_id: user.id,
        })
        .select()
        .maybeSingle();

      if (subError && subError.code !== '23505') {
        console.error('Error adding subscriber:', subError);
      }

      window.history.replaceState({}, '', window.location.pathname);
    } catch (error) {
      console.error('Error handling invite code:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
      </div>
    );
  }

  if (!user) {
    return <AuthForm />;
  }

  const handleTabChange = (tab: 'parties' | 'subscribers') => {
    setActiveTab(tab);
    if (tab === 'subscribers') {
      setSelectedPartyId(null);
    }
  };

  return (
    <>
      <Layout
        activeTab={activeTab}
        onTabChange={handleTabChange}
        onCreateParty={() => setShowCreateModal(true)}
      >
        {selectedPartyId ? (
          <PartyDetail
            partyId={selectedPartyId}
            onBack={() => setSelectedPartyId(null)}
            onDelete={() => {
              setSelectedPartyId(null);
              setRefreshKey((prev) => prev + 1);
            }}
          />
        ) : activeTab === 'parties' ? (
          <PartyList key={refreshKey} onSelectParty={setSelectedPartyId} />
        ) : (
          <SubscribersList />
        )}
      </Layout>

      {showCreateModal && (
        <CreatePartyModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setRefreshKey((prev) => prev + 1);
            setShowCreateModal(false);
          }}
        />
      )}
    </>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
