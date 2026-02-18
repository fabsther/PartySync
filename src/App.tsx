import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { AuthForm } from './components/AuthForm';
import { Layout } from './components/Layout';
import { PartyList } from './components/PartyList';
import { PartyDetail } from './components/PartyDetail';
import { CreatePartyModal } from './components/CreatePartyModal';
import { SubscribersList } from './components/SubscribersList';
import { Profile } from './components/Profile';
import { supabase } from './lib/supabase';
import { registerNotificationToken, checkNotificationSupport } from './lib/notifications';
import { InstallPrompt } from './components/InstallPrompt';
import { ResetPasswordForm } from './components/ResetPasswordForm';

function AppContent() {
  const { user, loading, isRecovering } = useAuth();
  const [activeTab, setActiveTab] = useState<'parties' | 'subscribers' | 'profile'>('parties');
  const [selectedPartyId, setSelectedPartyId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // --- NEW: traite ?invite=... & ?join_party=... quand l'utilisateur est connecté
  useEffect(() => {
    if (!user) return;

    const url = new URL(window.location.href);
    const inviteCode = url.searchParams.get('invite');
    const joinPartyId = url.searchParams.get('join_party');

    if (inviteCode || joinPartyId) {
      handleInviteLink(inviteCode || undefined, joinPartyId || undefined, user.id)
        .catch((e) => console.error('Error handling invite/join:', e))
        .finally(() => {
          // Nettoyer l’URL pour éviter de rejouer au refresh
          url.searchParams.delete('invite');
          url.searchParams.delete('join_party');
          window.history.replaceState({}, '', url.toString());
        });
    }
  }, [user]);

  // Notifications (inchangé)
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

  // --- NEW: logique consolidée (souscription + ajout à la party)
  const handleInviteLink = async (
    inviteCode: string | undefined,
    joinPartyId: string | undefined,
    currentUserId: string
  ) => {
    let ownerId: string | null = null;

    // 1) Si un code d'invite est fourni, trouver le créateur et s'y abonner (idempotent)
    if (inviteCode) {
      const code = inviteCode.trim().toUpperCase();

      const { data: codeRow, error: codeErr } = await supabase
        .from('invite_codes')
        .select('created_by')
        .eq('code', code)
        .maybeSingle();

      if (codeErr) {
        console.error('Invite code lookup failed:', codeErr);
      } else if (codeRow) {
        ownerId = codeRow.created_by;

        // Empêcher l'auto-subscribe (au cas où)
        if (ownerId !== currentUserId) {
          // Vérifier si deja abonné
          const { data: existingSub, error: exSubErr } = await supabase
            .from('subscribers')
            .select('id')
            .eq('user_id', ownerId)
            .eq('subscriber_id', currentUserId)
            .maybeSingle();

          if (exSubErr && exSubErr.code !== 'PGRST116') {
            console.error('Check existing subscription failed:', exSubErr);
          } else if (!existingSub) {
            const { error: insSubErr } = await supabase
              .from('subscribers')
              .insert({ user_id: ownerId, subscriber_id: currentUserId });

            // 23505 = unique violation -> déjà abonné, on ignore
            if (insSubErr && (insSubErr as any).code !== '23505') {
              console.error('Insert subscription failed:', insSubErr);
            }
          }
        }
      }
    }

    // 2) Si join_party est présent, ajouter l'utilisateur aux guests (idempotent)
    if (joinPartyId) {
      const { data: existingGuest, error: exGuestErr } = await supabase
        .from('party_guests')
        .select('id')
        .eq('party_id', joinPartyId)
        .eq('user_id', currentUserId)
        .maybeSingle();

      if (exGuestErr && exGuestErr.code !== 'PGRST116') {
        console.error('Check existing guest failed:', exGuestErr);
      } else if (!existingGuest) {
        const { error: insGuestErr } = await supabase
          .from('party_guests')
          .insert({ party_id: joinPartyId, user_id: currentUserId, status: 'invited' });

        // 23505 = unique violation -> déjà invité, on ignore
        if (insGuestErr && (insGuestErr as any).code !== '23505') {
          console.error('Insert guest failed:', insGuestErr);
        }
      }
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
      </div>
    );
  }

  if (isRecovering) {
    return <ResetPasswordForm />;
  }

  if (!user) {
    return <AuthForm />;
  }

  const handleTabChange = (tab: 'parties' | 'subscribers' | 'profile') => {
    setActiveTab(tab);
    if (tab === 'subscribers' || tab === 'profile') {
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
        ) : activeTab === 'subscribers' ? (
          <SubscribersList />
        ) : (
          <Profile />
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
      <InstallPrompt />
    </AuthProvider>
  );
}

export default App;
