import { useMemo, useRef, useState, useEffect } from 'react';
import { Bell, Check, Loader2, Trash2, X } from 'lucide-react';
import { useUserNotifications } from '../hooks/useUserNotifications';

type Props = {
  userId?: string;
  onNavigate?: (partyId: string, tab?: string, postId?: string) => void;
};

function getNavLabel(action?: string): string {
  switch (action) {
    case 'post_mention':
    case 'party_post':
      return 'Voir le post';
    case 'equipment_ping':
    case 'equipment_custom_added':
    case 'equipment_custom_added_by_guest':
      return "Voir l'équipement";
    case 'ping_rsvp_response':
      return 'Voir la soirée';
    case 'ride_pickup':
    case 'ride_kicked':
    case 'request_cancelled_by_user':
    case 'offer_cancelled':
      return 'Voir le covoiturage';
    default:
      return 'Ouvrir';
  }
}

function getNavTab(action?: string): string | undefined {
  switch (action) {
    case 'post_mention':
    case 'party_post':
      return 'posts';
    case 'equipment_ping':
    case 'equipment_custom_added':
    case 'equipment_custom_added_by_guest':
      return 'equipment';
    case 'ride_pickup':
    case 'ride_kicked':
    case 'request_cancelled_by_user':
    case 'offer_cancelled':
      return 'carshare';
    default:
      return undefined;
  }
}

export function NotificationsBell({ userId, onNavigate }: Props) {
  const { items, unreadCount, loading, hasMore, fetchPage, markAsRead, markAllAsRead, deleteNotification, deleteAllNotifications } =
    useUserNotifications(userId);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const firstPageOldest = useMemo(
    () => (items.length ? items[items.length - 1].created_at : undefined),
    [items]
  );

  // close on click outside
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (open && ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('click', onClick);
    return () => window.removeEventListener('click', onClick);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="relative p-2 rounded-lg text-neutral-300 hover:text-white hover:bg-neutral-800 transition"
        title="Notifications"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-orange-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed sm:absolute left-4 right-4 sm:left-auto sm:right-0 top-16 sm:top-auto sm:mt-2 w-auto sm:w-96 bg-neutral-900 border border-neutral-800 rounded-xl shadow-xl overflow-hidden z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
            <div className="font-semibold">Notifications</div>
            <div className="flex items-center gap-3">
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="text-xs text-neutral-400 hover:text-white flex items-center gap-1"
                  title="Tout marquer comme lu"
                >
                  <Check className="w-4 h-4" /> Tout lire
                </button>
              )}
              {items.length > 0 && (
                <button
                  onClick={deleteAllNotifications}
                  className="text-xs text-neutral-400 hover:text-red-400 flex items-center gap-1"
                  title="Tout supprimer"
                >
                  <Trash2 className="w-4 h-4" /> Tout supprimer
                </button>
              )}
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto divide-y divide-neutral-800">
            {items.length === 0 && !loading && (
              <div className="px-4 py-8 text-center text-neutral-500">Aucune notification</div>
            )}

            {items.map(n => (
              <div key={n.id} className="px-4 py-3 hover:bg-neutral-800/50 transition">
                <div className="flex items-start gap-3">
                  <div className={`mt-1 w-2 h-2 rounded-full ${n.read ? 'bg-neutral-600' : 'bg-orange-500'}`} />
                  <div className="flex-1">
                    <div className="text-sm font-medium">{n.title}</div>
                    <div className="text-sm text-neutral-400">{n.message}</div>
                    <div className="mt-1 text-xs text-neutral-500">
                      {new Date(n.created_at).toLocaleString()}
                    </div>
                    {!!n.metadata?.partyId && onNavigate ? (
                      <button
                        onClick={() => {
                          markAsRead(n.id);
                          setOpen(false);
                          onNavigate(
                            n.metadata.partyId,
                            getNavTab(n.metadata?.action),
                            n.metadata?.action === 'post_mention' ? n.metadata?.postId : undefined
                          );
                        }}
                        className="mt-2 inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-orange-500/20 text-orange-300 hover:bg-orange-500/30 transition"
                      >
                        {getNavLabel(n.metadata?.action)}
                      </button>
                    ) : !!n.metadata?.url ? (
                      <a
                        href={n.metadata.url}
                        className="mt-2 inline-block text-xs underline text-neutral-300 hover:text-white"
                      >
                        Ouvrir
                      </a>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {!n.read && (
                      <button
                        onClick={() => markAsRead(n.id)}
                        className="text-xs px-2 py-1 rounded bg-neutral-800 border border-neutral-700 hover:bg-neutral-700"
                        title="Marquer comme lu"
                      >
                        Lu
                      </button>
                    )}
                    <button
                      onClick={() => deleteNotification(n.id)}
                      className="p-1 rounded text-neutral-500 hover:text-red-400 hover:bg-neutral-800 transition"
                      title="Supprimer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {loading && (
              <div className="px-4 py-4 text-neutral-400 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Chargement…
              </div>
            )}

            {hasMore && !loading && (
              <button
                onClick={() => fetchPage({ after: firstPageOldest })}
                className="w-full px-4 py-3 text-sm text-neutral-300 hover:text-white hover:bg-neutral-800"
              >
                Charger plus
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
