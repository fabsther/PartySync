import { useEffect, useState } from 'react';
import { Shield, Mail, Bell, Check, X, Users, Smartphone, PartyPopper, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { sendRemoteNotification } from '../lib/remoteNotify';

type FilterValue = 'yes' | 'no' | 'indifferent';

interface Member {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
}

function FilterGroup({
  label,
  icon: Icon,
  value,
  onChange,
}: {
  label: string;
  icon: React.ElementType;
  value: FilterValue;
  onChange: (v: FilterValue) => void;
}) {
  const opts: { v: FilterValue; label: string }[] = [
    { v: 'yes', label: 'Oui' },
    { v: 'indifferent', label: '—' },
    { v: 'no', label: 'Non' },
  ];
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-neutral-400 flex items-center gap-1.5 uppercase tracking-wider font-medium">
        <Icon className="w-3.5 h-3.5" />
        {label}
      </span>
      <div className="flex rounded-lg overflow-hidden border border-neutral-700">
        {opts.map(({ v, label: l }) => (
          <button
            key={v}
            onClick={() => onChange(v)}
            className={`flex-1 px-3 py-1.5 text-sm font-medium transition ${
              value === v
                ? 'bg-orange-500 text-white'
                : 'bg-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-700'
            }`}
          >
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

export function AdminPage() {
  const { user } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [subscribedIds, setSubscribedIds] = useState<Set<string>>(new Set());
  const [pushIds, setPushIds] = useState<Set<string>>(new Set());
  const [confirmedGuestIds, setConfirmedGuestIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const [filterSubscribed, setFilterSubscribed] = useState<FilterValue>('indifferent');
  const [filterAppInstalled, setFilterAppInstalled] = useState<FilterValue>('indifferent');
  const [filterParticipated, setFilterParticipated] = useState<FilterValue>('indifferent');

  const [showNotifModal, setShowNotifModal] = useState(false);
  const [notifTitle, setNotifTitle] = useState('');
  const [notifBody, setNotifBody] = useState('');
  const [sending, setSending] = useState(false);
  const [sentCount, setSentCount] = useState(0);
  const [sendTotal, setSendTotal] = useState(0);

  useEffect(() => {
    if (user) loadData();
  }, [user]);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    const [profilesRes, subscribersRes, installsRes, guestsRes] = await Promise.all([
      supabase.from('profiles').select('id, email, full_name, avatar_url, created_at').order('created_at'),
      supabase.from('subscribers').select('subscriber_id').eq('user_id', user.id),
      supabase.from('app_installs').select('user_id'),
      supabase.from('party_guests').select('user_id').eq('status', 'confirmed'),
    ]);
    setMembers(profilesRes.data || []);
    setSubscribedIds(new Set((subscribersRes.data || []).map((s: any) => s.subscriber_id)));
    setPushIds(new Set((installsRes.data || []).map((p: any) => p.user_id)));
    setConfirmedGuestIds(new Set((guestsRes.data || []).map((g: any) => g.user_id)));
    setLoading(false);
  };

  const filteredMembers = members.filter((m) => {
    if (filterSubscribed === 'yes' && !subscribedIds.has(m.id)) return false;
    if (filterSubscribed === 'no' && subscribedIds.has(m.id)) return false;
    if (filterAppInstalled === 'yes' && !pushIds.has(m.id)) return false;
    if (filterAppInstalled === 'no' && pushIds.has(m.id)) return false;
    if (filterParticipated === 'yes' && !confirmedGuestIds.has(m.id)) return false;
    if (filterParticipated === 'no' && confirmedGuestIds.has(m.id)) return false;
    return true;
  });

  const handleEmail = () => {
    const emails = filteredMembers.map((m) => m.email).join(',');
    window.open(`mailto:${emails}`);
  };

  const openNotifModal = () => {
    setSentCount(0);
    setSendTotal(0);
    setNotifTitle('');
    setNotifBody('');
    setShowNotifModal(true);
  };

  const handleSendNotif = async () => {
    const targets = filteredMembers.filter((m) => pushIds.has(m.id));
    if (targets.length === 0) return;
    setSending(true);
    setSentCount(0);
    setSendTotal(targets.length);
    for (let i = 0; i < targets.length; i++) {
      await sendRemoteNotification(targets[i].id, notifTitle, notifBody, { action: 'admin_message' });
      setSentCount(i + 1);
    }
    setSending(false);
    setShowNotifModal(false);
  };

  const emailToDisplay = (email: string) => {
    const local = email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\d+/g, '').trim();
    return local || email.split('@')[0];
  };

  const pushTargetCount = filteredMembers.filter((m) => pushIds.has(m.id)).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-orange-500/20 p-2 rounded-lg">
            <Shield className="w-6 h-6 text-orange-400" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white">Admin</h2>
            <p className="text-sm text-neutral-500">{members.length} membres au total</p>
          </div>
        </div>
        <button
          onClick={loadData}
          disabled={loading}
          className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-lg transition"
          title="Recharger"
        >
          <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Filters */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 space-y-4">
        <h3 className="text-sm font-semibold text-neutral-300 uppercase tracking-wider">Filtres</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <FilterGroup
            label="Abonné à moi"
            icon={Users}
            value={filterSubscribed}
            onChange={setFilterSubscribed}
          />
          <FilterGroup
            label="App installée"
            icon={Smartphone}
            value={filterAppInstalled}
            onChange={setFilterAppInstalled}
          />
          <FilterGroup
            label="A participé"
            icon={PartyPopper}
            value={filterParticipated}
            onChange={setFilterParticipated}
          />
        </div>
      </div>

      {/* Results header + actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-white font-medium">
          {loading ? '…' : <><span className="text-orange-400 font-bold">{filteredMembers.length}</span> membre{filteredMembers.length !== 1 ? 's' : ''} sélectionné{filteredMembers.length !== 1 ? 's' : ''}</>}
        </p>
        <div className="flex gap-2">
          <button
            onClick={handleEmail}
            disabled={filteredMembers.length === 0 || loading}
            className="flex items-center gap-2 px-4 py-2 bg-neutral-800 border border-neutral-700 text-white rounded-lg hover:bg-neutral-700 transition text-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Mail className="w-4 h-4" />
            Email
          </button>
          <button
            onClick={openNotifModal}
            disabled={pushTargetCount === 0 || loading}
            className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition text-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Bell className="w-4 h-4" />
            Notification ({pushTargetCount})
          </button>
        </div>
      </div>

      {/* Member list */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-orange-500" />
        </div>
      ) : filteredMembers.length === 0 ? (
        <div className="text-center py-16 text-neutral-500">Aucun membre ne correspond aux filtres</div>
      ) : (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-800 text-neutral-500 text-xs uppercase tracking-wider">
                <th className="text-left px-4 py-3">Membre</th>
                <th className="px-4 py-3 text-center hidden sm:table-cell">Abonné</th>
                <th className="px-4 py-3 text-center hidden sm:table-cell">App</th>
                <th className="px-4 py-3 text-center hidden sm:table-cell">Participé</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800">
              {filteredMembers.map((m) => (
                <tr key={m.id} className="hover:bg-neutral-800/50 transition">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {m.avatar_url ? (
                        <img src={m.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">
                          {(m.full_name || emailToDisplay(m.email))[0]?.toUpperCase() || '?'}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="text-white font-medium truncate">{m.full_name || emailToDisplay(m.email)}</div>
                        <div className="text-neutral-500 text-xs truncate">{m.email}</div>
                      </div>
                      {/* Mobile badges */}
                      <div className="flex gap-1 ml-auto sm:hidden">
                        {subscribedIds.has(m.id) && <span className="text-xs bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded">Abo</span>}
                        {pushIds.has(m.id) && <span className="text-xs bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded">App</span>}
                        {confirmedGuestIds.has(m.id) && <span className="text-xs bg-orange-500/20 text-orange-400 px-1.5 py-0.5 rounded">Part</span>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center hidden sm:table-cell">
                    {subscribedIds.has(m.id)
                      ? <Check className="w-4 h-4 text-green-400 mx-auto" />
                      : <X className="w-4 h-4 text-neutral-700 mx-auto" />}
                  </td>
                  <td className="px-4 py-3 text-center hidden sm:table-cell">
                    {pushIds.has(m.id)
                      ? <Check className="w-4 h-4 text-green-400 mx-auto" />
                      : <X className="w-4 h-4 text-neutral-700 mx-auto" />}
                  </td>
                  <td className="px-4 py-3 text-center hidden sm:table-cell">
                    {confirmedGuestIds.has(m.id)
                      ? <Check className="w-4 h-4 text-green-400 mx-auto" />
                      : <X className="w-4 h-4 text-neutral-700 mx-auto" />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Notification modal */}
      {showNotifModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <h3 className="text-xl font-bold text-white mb-1">Envoyer une notification</h3>
            <p className="text-sm text-neutral-400 mb-5">
              {sending
                ? `Envoi en cours… ${sentCount}/${sendTotal}`
                : `Sera envoyée à ${pushTargetCount} membre${pushTargetCount !== 1 ? 's' : ''} (avec push activé)`}
            </p>
            <div className="space-y-3 mb-6">
              <input
                type="text"
                value={notifTitle}
                onChange={(e) => setNotifTitle(e.target.value)}
                placeholder="Titre"
                disabled={sending}
                className="w-full px-4 py-2.5 bg-neutral-800 border border-neutral-700 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:border-orange-500 transition disabled:opacity-50"
              />
              <textarea
                value={notifBody}
                onChange={(e) => setNotifBody(e.target.value)}
                placeholder="Message…"
                rows={3}
                disabled={sending}
                className="w-full px-4 py-2.5 bg-neutral-800 border border-neutral-700 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:border-orange-500 transition resize-none disabled:opacity-50"
              />
            </div>
            {sending && (
              <div className="mb-4 h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-orange-500 transition-all duration-300"
                  style={{ width: `${sendTotal > 0 ? (sentCount / sendTotal) * 100 : 0}%` }}
                />
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => setShowNotifModal(false)}
                disabled={sending}
                className="flex-1 py-2.5 bg-neutral-800 text-neutral-300 rounded-lg hover:bg-neutral-700 transition disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                onClick={handleSendNotif}
                disabled={sending || !notifTitle.trim() || !notifBody.trim()}
                className="flex-1 py-2.5 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                {sending ? 'Envoi…' : 'Envoyer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
