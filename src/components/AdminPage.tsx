import { useEffect, useState, useMemo } from 'react';
import {
  Shield, Mail, Bell, Check, X, Users, Smartphone, PartyPopper, RefreshCw,
  Search, UserX, Ban, ChevronDown, ChevronUp, AlertTriangle,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { sendRemoteNotification } from '../lib/remoteNotify';

type FilterValue = 'yes' | 'no' | 'indifferent';
type ConfirmAction = 'kick' | 'ban' | null;

interface Member {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
  banned_at: string | null;
  kicked_until: string | null;
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
  const [installsMap, setInstallsMap] = useState<Map<string, { last_seen_standalone: string | null }>>(new Map());
  const [confirmedGuestIds, setConfirmedGuestIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const [filterSubscribed, setFilterSubscribed] = useState<FilterValue>('indifferent');
  const [filterAppInstalled, setFilterAppInstalled] = useState<FilterValue>('indifferent');
  const [filterParticipated, setFilterParticipated] = useState<FilterValue>('indifferent');
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [showNotifModal, setShowNotifModal] = useState(false);
  const [notifTitle, setNotifTitle] = useState('');
  const [notifBody, setNotifBody] = useState('');
  const [sending, setSending] = useState(false);
  const [sentCount, setSentCount] = useState(0);
  const [sendTotal, setSendTotal] = useState(0);

  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [kickDays, setKickDays] = useState(15);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionResult, setActionResult] = useState<string | null>(null);

  useEffect(() => {
    if (user) loadData();
  }, [user]);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    setSelectedIds(new Set());
    const [profilesRes, subscribersRes, installsRes, guestsRes] = await Promise.all([
      supabase.from('profiles').select('id, email, full_name, avatar_url, created_at, banned_at, kicked_until').order('created_at'),
      supabase.from('subscribers').select('subscriber_id').eq('user_id', user.id),
      supabase.from('app_installs').select('user_id, last_seen_standalone'),
      supabase.from('party_guests').select('user_id').eq('status', 'confirmed'),
    ]);
    setMembers(profilesRes.data || []);
    setSubscribedIds(new Set((subscribersRes.data || []).map((s: any) => s.subscriber_id)));
    setInstallsMap(new Map((installsRes.data || []).map((p: any) => [p.user_id, { last_seen_standalone: p.last_seen_standalone ?? null }])));
    setConfirmedGuestIds(new Set((guestsRes.data || []).map((g: any) => g.user_id)));
    setLoading(false);
  };

  const isInstalled = (userId: string) => !!installsMap.get(userId)?.last_seen_standalone;

  const filteredMembers = useMemo(() => members.filter((m) => {
    if (filterSubscribed === 'yes' && !subscribedIds.has(m.id)) return false;
    if (filterSubscribed === 'no' && subscribedIds.has(m.id)) return false;
    if (filterAppInstalled === 'yes' && !isInstalled(m.id)) return false;
    if (filterAppInstalled === 'no' && isInstalled(m.id)) return false;
    if (filterParticipated === 'yes' && !confirmedGuestIds.has(m.id)) return false;
    if (filterParticipated === 'no' && confirmedGuestIds.has(m.id)) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const name = (m.full_name || '').toLowerCase();
      const email = m.email.toLowerCase();
      if (!name.includes(q) && !email.includes(q)) return false;
    }
    return true;
  }), [members, filterSubscribed, filterAppInstalled, filterParticipated, searchQuery, subscribedIds, installsMap, confirmedGuestIds]);

  // Which visible members are currently selected
  const visibleSelectedIds = useMemo(
    () => new Set(filteredMembers.filter((m) => selectedIds.has(m.id)).map((m) => m.id)),
    [filteredMembers, selectedIds]
  );
  const allVisibleSelected = filteredMembers.length > 0 && filteredMembers.every((m) => selectedIds.has(m.id));

  // Action targets = selected if any, else all filtered
  const actionTargets = useMemo(
    () => visibleSelectedIds.size > 0 ? filteredMembers.filter((m) => visibleSelectedIds.has(m.id)) : filteredMembers,
    [filteredMembers, visibleSelectedIds]
  );

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        filteredMembers.forEach((m) => next.delete(m.id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        filteredMembers.forEach((m) => next.add(m.id));
        return next;
      });
    }
  };

  const handleEmail = () => {
    const emails = actionTargets.map((m) => m.email).join(',');
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
    const targets = actionTargets.filter((m) => isInstalled(m.id));
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

  const handleKick = async () => {
    setActionLoading(true);
    let count = 0;
    const kickedUntil = new Date(Date.now() + kickDays * 24 * 60 * 60 * 1000).toISOString();
    for (const m of actionTargets) {
      const { error } = await supabase.from('profiles').update({ kicked_until: kickedUntil }).eq('id', m.id);
      if (!error) {
        await supabase.from('party_guests').delete().eq('user_id', m.id);
        count++;
      }
    }
    setActionLoading(false);
    setConfirmAction(null);
    const durationLabel = kickDays === 1 ? '1 jour' : `${kickDays} jours`;
    setActionResult(`${count} membre${count !== 1 ? 's' : ''} expulsé${count !== 1 ? 's' : ''} pour ${durationLabel}.`);
    await loadData();
  };

  const handleBan = async () => {
    setActionLoading(true);
    let count = 0;
    const now = new Date().toISOString();
    for (const m of actionTargets) {
      const { error } = await supabase.from('profiles').update({ banned_at: now }).eq('id', m.id);
      if (!error) {
        await supabase.from('party_guests').delete().eq('user_id', m.id);
        count++;
      }
    }
    setActionLoading(false);
    setConfirmAction(null);
    setActionResult(`${count} membre${count !== 1 ? 's' : ''} banni${count !== 1 ? 's' : ''}.`);
    await loadData();
  };

  const handleUnban = async (memberId: string) => {
    await supabase.from('profiles').update({ banned_at: null }).eq('id', memberId);
    setMembers((prev) => prev.map((m) => m.id === memberId ? { ...m, banned_at: null } : m));
  };

  const emailToDisplay = (email: string) => {
    const local = email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\d+/g, '').trim();
    return local || email.split('@')[0];
  };

  const pushTargetCount = actionTargets.filter((m) => isInstalled(m.id)).length;
  const selectionLabel = visibleSelectedIds.size > 0
    ? `${visibleSelectedIds.size} sélectionné${visibleSelectedIds.size !== 1 ? 's' : ''}`
    : `${filteredMembers.length} membre${filteredMembers.length !== 1 ? 's' : ''}`;

  return (
    <div className="space-y-4">
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

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500 pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => { setSearchQuery(e.target.value); setSelectedIds(new Set()); }}
          placeholder="Rechercher par pseudo ou email…"
          className="w-full pl-9 pr-4 py-2.5 bg-neutral-900 border border-neutral-800 rounded-xl text-white placeholder-neutral-500 focus:outline-none focus:border-orange-500 transition text-sm"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Filters collapsible */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
        <button
          onClick={() => setFiltersOpen((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-neutral-300 uppercase tracking-wider hover:bg-neutral-800/50 transition"
        >
          <span>Filtres</span>
          {filtersOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {filtersOpen && (
          <div className="px-4 pb-4 grid grid-cols-1 sm:grid-cols-3 gap-4 border-t border-neutral-800 pt-4">
            <FilterGroup label="Abonné à moi" icon={Users} value={filterSubscribed} onChange={setFilterSubscribed} />
            <FilterGroup label="App installée" icon={Smartphone} value={filterAppInstalled} onChange={setFilterAppInstalled} />
            <FilterGroup label="A participé" icon={PartyPopper} value={filterParticipated} onChange={setFilterParticipated} />
          </div>
        )}
      </div>

      {/* Action bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-white font-medium">
          {loading ? '…' : (
            <span>
              <span className="text-orange-400 font-bold">{selectionLabel}</span>
              {visibleSelectedIds.size === 0 && filteredMembers.length !== members.length && (
                <span className="text-neutral-500 text-sm font-normal"> (filtrés)</span>
              )}
            </span>
          )}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleEmail}
            disabled={actionTargets.length === 0 || loading}
            className="flex items-center gap-1.5 px-3 py-2 bg-neutral-800 border border-neutral-700 text-white rounded-lg hover:bg-neutral-700 transition text-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Mail className="w-4 h-4" />
            Email
          </button>
          <button
            onClick={openNotifModal}
            disabled={pushTargetCount === 0 || loading}
            className="flex items-center gap-1.5 px-3 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition text-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Bell className="w-4 h-4" />
            Notif ({pushTargetCount})
          </button>
          <button
            onClick={() => setConfirmAction('kick')}
            disabled={actionTargets.length === 0 || loading}
            className="flex items-center gap-1.5 px-3 py-2 bg-yellow-600/20 border border-yellow-600/40 text-yellow-400 rounded-lg hover:bg-yellow-600/30 transition text-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <UserX className="w-4 h-4" />
            Kick ({actionTargets.length})
          </button>
          <button
            onClick={() => setConfirmAction('ban')}
            disabled={actionTargets.length === 0 || loading}
            className="flex items-center gap-1.5 px-3 py-2 bg-red-600/20 border border-red-600/40 text-red-400 rounded-lg hover:bg-red-600/30 transition text-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Ban className="w-4 h-4" />
            Ban ({actionTargets.length})
          </button>
        </div>
      </div>

      {/* Action result toast */}
      {actionResult && (
        <div className="flex items-center justify-between bg-green-500/10 border border-green-500/30 rounded-xl px-4 py-3 text-sm text-green-400">
          <span>{actionResult}</span>
          <button onClick={() => setActionResult(null)}><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Member list */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-orange-500" />
        </div>
      ) : filteredMembers.length === 0 ? (
        <div className="text-center py-16 text-neutral-500">Aucun membre ne correspond</div>
      ) : (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-800 text-neutral-500 text-xs uppercase tracking-wider">
                <th className="px-4 py-3 w-8">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded accent-orange-500 cursor-pointer"
                  />
                </th>
                <th className="text-left px-3 py-3">Membre</th>
                <th className="px-3 py-3 text-center hidden sm:table-cell">Abo</th>
                <th className="px-3 py-3 text-center hidden sm:table-cell">App</th>
                <th className="px-3 py-3 text-center hidden sm:table-cell">Part</th>
                <th className="px-3 py-3 text-center hidden sm:table-cell">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800">
              {filteredMembers.map((m) => {
                const selected = selectedIds.has(m.id);
                const banned = !!m.banned_at;
                const kicked = m.kicked_until ? new Date(m.kicked_until) > new Date() : false;
                const dimmed = banned || kicked;
                return (
                  <tr
                    key={m.id}
                    onClick={() => toggleSelect(m.id)}
                    className={`cursor-pointer transition ${selected ? 'bg-orange-500/5 hover:bg-orange-500/10' : 'hover:bg-neutral-800/50'} ${dimmed ? 'opacity-50' : ''}`}
                  >
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleSelect(m.id)}
                        className="w-4 h-4 rounded accent-orange-500 cursor-pointer"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-3">
                        {m.avatar_url ? (
                          <img src={m.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">
                            {(m.full_name || emailToDisplay(m.email))[0]?.toUpperCase() || '?'}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="text-white font-medium truncate flex items-center gap-1.5">
                            {m.full_name || emailToDisplay(m.email)}
                            {banned && <span className="text-xs bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded font-normal">Banni</span>}
                            {kicked && !banned && <span className="text-xs bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded font-normal">Kické</span>}
                          </div>
                          <div className="text-neutral-500 text-xs truncate">{m.email}</div>
                        </div>
                        {/* Mobile badges */}
                        <div className="flex gap-1 ml-auto sm:hidden">
                          {subscribedIds.has(m.id) && <span className="text-xs bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded">Abo</span>}
                          {isInstalled(m.id) && <span className="text-xs bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded">App</span>}
                          {confirmedGuestIds.has(m.id) && <span className="text-xs bg-orange-500/20 text-orange-400 px-1.5 py-0.5 rounded">Part</span>}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-center hidden sm:table-cell">
                      {subscribedIds.has(m.id) ? <Check className="w-4 h-4 text-green-400 mx-auto" /> : <X className="w-4 h-4 text-neutral-700 mx-auto" />}
                    </td>
                    <td className="px-3 py-3 text-center hidden sm:table-cell">
                      {isInstalled(m.id) ? <Check className="w-4 h-4 text-green-400 mx-auto" /> : <X className="w-4 h-4 text-neutral-700 mx-auto" />}
                    </td>
                    <td className="px-3 py-3 text-center hidden sm:table-cell">
                      {confirmedGuestIds.has(m.id) ? <Check className="w-4 h-4 text-green-400 mx-auto" /> : <X className="w-4 h-4 text-neutral-700 mx-auto" />}
                    </td>
                    <td className="px-3 py-3 text-center hidden sm:table-cell" onClick={(e) => e.stopPropagation()}>
                      {banned ? (
                        <button
                          onClick={() => handleUnban(m.id)}
                          className="text-xs text-red-400 hover:text-white border border-red-500/30 hover:border-red-500/60 px-2 py-0.5 rounded transition"
                        >
                          Débannir
                        </button>
                      ) : kicked ? (
                        <div className="flex flex-col items-center gap-0.5">
                          <span className="text-xs text-yellow-500/80">
                            {new Date(m.kicked_until!).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                          </span>
                          <button
                            onClick={() => { supabase.from('profiles').update({ kicked_until: null }).eq('id', m.id).then(); setMembers((prev) => prev.map((x) => x.id === m.id ? { ...x, kicked_until: null } : x)); }}
                            className="text-xs text-neutral-500 hover:text-white transition underline"
                          >
                            Lever
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-neutral-600">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
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
                : `Sera envoyée à ${pushTargetCount} membre${pushTargetCount !== 1 ? 's' : ''} (push activé)`}
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
                <div className="h-full bg-orange-500 transition-all duration-300" style={{ width: `${sendTotal > 0 ? (sentCount / sendTotal) * 100 : 0}%` }} />
              </div>
            )}
            <div className="flex gap-3">
              <button onClick={() => setShowNotifModal(false)} disabled={sending} className="flex-1 py-2.5 bg-neutral-800 text-neutral-300 rounded-lg hover:bg-neutral-700 transition disabled:opacity-50">
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

      {/* Kick confirm modal */}
      {confirmAction === 'kick' && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-yellow-500/20">
                <UserX className="w-5 h-5 text-yellow-400" />
              </div>
              <h3 className="text-xl font-bold text-white">
                Kicker {actionTargets.length} membre{actionTargets.length !== 1 ? 's' : ''}
              </h3>
            </div>

            {/* Target list */}
            <div className="bg-neutral-800 rounded-xl p-3 mb-4 max-h-32 overflow-y-auto space-y-1">
              {actionTargets.map((m) => (
                <div key={m.id} className="flex items-center gap-2 text-sm">
                  <div className="w-6 h-6 rounded-full bg-orange-500/30 flex items-center justify-center text-orange-300 text-xs font-bold flex-shrink-0">
                    {(m.full_name || m.email)[0]?.toUpperCase()}
                  </div>
                  <span className="text-white truncate">{m.full_name || m.email}</span>
                </div>
              ))}
            </div>

            {/* Duration picker */}
            <div className="mb-4">
              <label className="block text-xs text-neutral-400 uppercase tracking-wider font-medium mb-2">
                Durée du kick
              </label>
              {/* Presets */}
              <div className="flex gap-2 mb-3 flex-wrap">
                {[1, 3, 7, 15, 30].map((d) => (
                  <button
                    key={d}
                    onClick={() => setKickDays(d)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                      kickDays === d
                        ? 'bg-yellow-500 text-black'
                        : 'bg-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-700'
                    }`}
                  >
                    {d === 1 ? '1 jour' : `${d} j`}
                  </button>
                ))}
              </div>
              {/* Custom input */}
              <div className="flex items-center gap-3 bg-neutral-800 border border-neutral-700 rounded-xl px-4 py-2.5">
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={kickDays}
                  onChange={(e) => setKickDays(Math.max(1, Math.min(365, parseInt(e.target.value) || 1)))}
                  className="w-16 bg-transparent text-white text-center font-bold text-lg focus:outline-none"
                />
                <span className="text-neutral-400 text-sm">jour{kickDays !== 1 ? 's' : ''}</span>
                <span className="ml-auto text-neutral-500 text-xs">
                  jusqu'au {new Date(Date.now() + kickDays * 86400000).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
              </div>
            </div>

            <div className="flex items-start gap-2 rounded-lg p-3 mb-5 text-sm bg-yellow-500/10 text-yellow-300">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              Retirés de toutes les soirées. Accès bloqué jusqu'à expiration du kick.
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setConfirmAction(null)}
                disabled={actionLoading}
                className="flex-1 py-2.5 bg-neutral-800 text-neutral-300 rounded-lg hover:bg-neutral-700 transition disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                onClick={handleKick}
                disabled={actionLoading}
                className="flex-1 py-2.5 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg transition disabled:opacity-50 font-medium flex items-center justify-center gap-2"
              >
                {actionLoading
                  ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : `Kicker ${kickDays === 1 ? '1 jour' : `${kickDays} jours`}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ban confirm modal */}
      {confirmAction === 'ban' && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-red-500/20">
                <Ban className="w-5 h-5 text-red-400" />
              </div>
              <h3 className="text-xl font-bold text-white">
                Bannir {actionTargets.length} membre{actionTargets.length !== 1 ? 's' : ''}
              </h3>
            </div>

            <div className="bg-neutral-800 rounded-xl p-3 mb-4 max-h-32 overflow-y-auto space-y-1">
              {actionTargets.map((m) => (
                <div key={m.id} className="flex items-center gap-2 text-sm">
                  <div className="w-6 h-6 rounded-full bg-orange-500/30 flex items-center justify-center text-orange-300 text-xs font-bold flex-shrink-0">
                    {(m.full_name || m.email)[0]?.toUpperCase()}
                  </div>
                  <span className="text-white truncate">{m.full_name || m.email}</span>
                </div>
              ))}
            </div>

            <div className="flex items-start gap-2 rounded-lg p-3 mb-5 text-sm bg-red-500/10 text-red-300">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              Ban permanent. Les utilisateurs seront retirés de toutes les soirées et verront un message d'accès refusé indéfiniment.
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setConfirmAction(null)}
                disabled={actionLoading}
                className="flex-1 py-2.5 bg-neutral-800 text-neutral-300 rounded-lg hover:bg-neutral-700 transition disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                onClick={handleBan}
                disabled={actionLoading}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg transition disabled:opacity-50 font-medium flex items-center justify-center gap-2"
              >
                {actionLoading
                  ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : 'Bannir définitivement'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
