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
import { sendRemoteNotification } from './lib/remoteNotify';
import { InstallPrompt } from './components/InstallPrompt';
import { isIOS } from './lib/platform';
import { ResetPasswordForm } from './components/ResetPasswordForm';
import { WelcomePartyModal, WelcomePartyInfo } from './components/WelcomePartyModal';
import { PrivacyPolicy } from './components/PrivacyPolicy';

interface PingContext {
  partyId: string;
  partyTitle: string;
  creatorId: string;
}

function PingRsvpModal({
  context,
  onClose,
  onNavigate,
}: {
  context: PingContext;
  onClose: () => void;
  onNavigate: (partyId: string) => void;
}) {
  const { user } = useAuth();
  const [responding, setResponding] = useState(false);

  const respond = async (status: 'confirmed' | 'declined') => {
    if (!user) return;
    setResponding(true);
    try {
      await supabase
        .from('party_guests')
        .update({ status })
        .eq('party_id', context.partyId)
        .eq('user_id', user.id);

      const userName =
        (user as any).user_metadata?.full_name ||
        user.email?.split('@')[0] ||
        'Un invité';

      const notifBody =
        status === 'confirmed'
          ? `${userName} a confirmé sa présence à « ${context.partyTitle} ».`
          : `${userName} a décliné l'invitation à « ${context.partyTitle} ».`;

      await sendRemoteNotification(
        context.creatorId,
        status === 'confirmed' ? '🎉 Présence confirmée' : '❌ Invitation déclinée',
        notifBody,
        { partyId: context.partyId, action: 'ping_rsvp_response', status },
        `/?partyId=${context.partyId}`
      );

      onNavigate(context.partyId);
      onClose();
    } catch (e) {
      console.error('Error responding to ping:', e);
    } finally {
      setResponding(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
        <div className="text-center mb-6">
          <div className="text-4xl mb-3">🎉</div>
          <h3 className="text-xl font-bold text-white mb-1">Es-tu dispo ?</h3>
          <p className="text-neutral-400 text-sm">
            L'organisateur demande si tu viens à{' '}
            <span className="text-white font-medium">« {context.partyTitle} »</span>
          </p>
        </div>
        <div className="space-y-3">
          <button
            onClick={() => respond('confirmed')}
            disabled={responding}
            className="w-full py-3 bg-green-500 hover:bg-green-600 text-white rounded-xl font-medium transition disabled:opacity-50"
          >
            Oui, j'y serai ✓
          </button>
          <button
            onClick={() => respond('declined')}
            disabled={responding}
            className="w-full py-3 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-xl font-medium transition disabled:opacity-50"
          >
            Non, je ne viendrai pas ✗
          </button>
          <button
            onClick={onClose}
            disabled={responding}
            className="w-full py-2 text-neutral-500 hover:text-neutral-300 text-sm transition"
          >
            Décider plus tard
          </button>
        </div>
      </div>
    </div>
  );
}

// Returns true when the OAuth callback URL landed in Chrome browser instead of the
// installed PWA standalone window. On Android, Chrome Custom Tabs (used for Google
// OAuth) don't always hand the redirect back to the PWA — the user ends up in the
// browser with a URL bar instead of the app.
function checkOAuthBrowserModeWarning() {
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    !!(window.navigator as any).standalone;
  const params = new URLSearchParams(window.location.search);
  const hasOAuthCode = params.has('code');
  const hasAccessToken = window.location.hash.includes('access_token=');
  return !isStandalone && (hasOAuthCode || hasAccessToken);
}

function AppContent() {
  if (window.location.pathname === '/privacy') {
    return <PrivacyPolicy />;
  }

  const showBrowserModeWarning = checkOAuthBrowserModeWarning();
  const { user, loading, isRecovering } = useAuth();
  const [activeTab, setActiveTab] = useState<'parties' | 'subscribers' | 'profile'>('parties');
  const [selectedPartyId, setSelectedPartyId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [welcomeParty, setWelcomeParty] = useState<WelcomePartyInfo | null>(null);
  const [pingContext, setPingContext] = useState<PingContext | null>(null);
  const [initialPostId, setInitialPostId] = useState<string | null>(null);

  // Sauvegarder les params d'invitation en sessionStorage dès le chargement de la page,
  // pour qu'ils survivent au flux login/signup (au cas où le navigateur modifie l'URL)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const invite = params.get('invite');
    const joinParty = params.get('join_party');
    if (invite) sessionStorage.setItem('pending_invite', invite);
    if (joinParty) sessionStorage.setItem('pending_join_party', joinParty);
  }, []);

  // Traiter ?invite=... & ?join_party=... une fois l'utilisateur connecté
  useEffect(() => {
    if (!user) return;

    const url = new URL(window.location.href);
    const inviteCode =
      (url.searchParams.get('invite') || sessionStorage.getItem('pending_invite')) || undefined;
    const joinPartyId =
      (url.searchParams.get('join_party') || sessionStorage.getItem('pending_join_party')) || undefined;

    if (!inviteCode && !joinPartyId) return;

    handleInviteLink(inviteCode, joinPartyId, user.id)
      .then((partyInfo) => {
        if (partyInfo) {
          setActiveTab('parties');
          setSelectedPartyId(partyInfo.id);
          setRefreshKey((k) => k + 1);
          setWelcomeParty(partyInfo);
        }
      })
      .catch((e) => console.error('Error handling invite/join:', e))
      .finally(() => {
        sessionStorage.removeItem('pending_invite');
        sessionStorage.removeItem('pending_join_party');
        url.searchParams.delete('invite');
        url.searchParams.delete('join_party');
        window.history.replaceState({}, '', url.toString());
      });
  }, [user]);

  // Détecter les deep links : ping_rsvp et post_mention
  useEffect(() => {
    if (!user) return;

    const url = new URL(window.location.href);
    const action = url.searchParams.get('action');
    const partyId = url.searchParams.get('partyId');
    const postId = url.searchParams.get('postId');

    if (action === 'ping_rsvp' && partyId) {
      supabase
        .from('parties')
        .select('title, created_by')
        .eq('id', partyId)
        .single()
        .then(({ data }) => {
          if (data) {
            setPingContext({ partyId, partyTitle: data.title, creatorId: data.created_by });
          }
        });
      url.searchParams.delete('action');
      url.searchParams.delete('partyId');
      window.history.replaceState({}, '', url.toString());
    } else if (postId && partyId) {
      setSelectedPartyId(partyId);
      setInitialPostId(postId);
      setActiveTab('parties');
      url.searchParams.delete('postId');
      url.searchParams.delete('partyId');
      window.history.replaceState({}, '', url.toString());
    }
  }, [user]);

  // Notifications : enregistrement au login + ré-enregistrement si le SW signale un changement
  useEffect(() => {
    if (!user || !checkNotificationSupport()) return;

    const hasAsked = localStorage.getItem('notification-permission-asked');

    if (!hasAsked && !isIOS()) {
      // On iOS, Notification.requestPermission() requires a user gesture —
      // the InstallPrompt component shows an "Enable notifications" button instead.
      setTimeout(() => {
        registerNotificationToken(user.id).then((success) => {
          if (success) localStorage.setItem('notification-permission-asked', 'true');
        });
      }, 2000);
    } else if (Notification.permission === 'granted') {
      registerNotificationToken(user.id);
    }

    // Ré-enregistrement immédiat si le SW détecte un changement de subscription
    // (pushsubscriptionchange sans config dispo au moment de l'événement)
    const handleSWMessage = (event: MessageEvent) => {
      if (event.data?.type === 'PUSH_SUBSCRIPTION_CHANGED' && Notification.permission === 'granted') {
        console.log('[App] SW signaled subscription change – re-registering');
        registerNotificationToken(user.id);
      }
    };
    navigator.serviceWorker.addEventListener('message', handleSWMessage);
    return () => navigator.serviceWorker.removeEventListener('message', handleSWMessage);
  }, [user]);

  // Logique consolidée : souscription au créateur + ajout à la party
  // Retourne les infos de la party rejointe (pour le modal de bienvenue), ou null
  const handleInviteLink = async (
    inviteCode: string | undefined,
    joinPartyId: string | undefined,
    currentUserId: string
  ): Promise<WelcomePartyInfo | null> => {
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
      } else if (codeRow && codeRow.created_by !== currentUserId) {
        const ownerId = codeRow.created_by;

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

          if (insSubErr && (insSubErr as any).code !== '23505') {
            console.error('Insert subscription failed:', insSubErr);
          }
        }
      }
    }

    // 2) Si join_party est présent, ajouter l'utilisateur aux guests (idempotent)
    //    puis récupérer les infos de la party pour le modal de bienvenue
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

        if (insGuestErr && (insGuestErr as any).code !== '23505') {
          console.error('Insert guest failed:', insGuestErr);
        }
      }

      // Récupérer les infos de la party pour le modal de bienvenue
      const { data: partyData } = await supabase
        .from('parties')
        .select('id, title, fixed_date, is_date_fixed, created_by')
        .eq('id', joinPartyId)
        .maybeSingle();

      if (partyData) {
        const { data: creatorProfile } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', partyData.created_by)
          .maybeSingle();

        return {
          id: partyData.id,
          title: partyData.title,
          fixed_date: partyData.fixed_date,
          is_date_fixed: partyData.is_date_fixed,
          creator_name: (creatorProfile as any)?.full_name ?? null,
        };
      }
    }

    return null;
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
    return (
      <>
        {showBrowserModeWarning && (
          <div className="fixed inset-0 z-50 bg-neutral-950 flex flex-col items-center justify-center p-6 text-center">
            <div className="text-5xl mb-4">📱</div>
            <h2 className="text-xl font-bold text-white mb-3">Open PartySync from your home screen</h2>
            <p className="text-neutral-400 text-sm leading-relaxed max-w-xs">
              Google sign-in redirected here in Chrome instead of the app.
              Please tap the <strong className="text-white">PartySync icon</strong> on your home screen,
              then tap <strong className="text-white">Continue with Google</strong> again.
            </p>
            <p className="text-neutral-600 text-xs mt-6">
              (This happens because Android opened the login callback in the browser.
              The fix has been applied — it should work correctly next time.)
            </p>
          </div>
        )}
        {!showBrowserModeWarning && <AuthForm />}
      </>
    );
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
            onBack={() => { setSelectedPartyId(null); setInitialPostId(null); }}
            onDelete={() => {
              setSelectedPartyId(null);
              setInitialPostId(null);
              setRefreshKey((prev) => prev + 1);
            }}
            initialPostId={initialPostId ?? undefined}
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

      <InstallPrompt userId={user?.id} />

      {welcomeParty && (
        <WelcomePartyModal
          party={welcomeParty}
          onClose={() => setWelcomeParty(null)}
        />
      )}

      {pingContext && user && (
        <PingRsvpModal
          context={pingContext}
          onClose={() => setPingContext(null)}
          onNavigate={(partyId) => {
            setSelectedPartyId(partyId);
            setActiveTab('parties');
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
