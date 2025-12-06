import { useMemo, useRef, useState, useEffect } from 'react';
import { Bell, Check, Loader2 } from 'lucide-react';
import { useUserNotifications } from '../hooks/useUserNotifications';

type Props = {
  userId?: string;
};

export function NotificationsBell({ userId }: Props) {
  const { items, unreadCount, loading, hasMore, fetchPage, markAsRead, markAllAsRead } =
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
            <button
              onClick={markAllAsRead}
              className="text-xs text-neutral-400 hover:text-white flex items-center gap-1"
            >
              <Check className="w-4 h-4" /> Tout marquer comme lu
            </button>
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
                    {!!n.metadata?.url && (
                      <a
                        href={n.metadata.url}
                        className="mt-2 inline-block text-xs underline text-neutral-300 hover:text-white"
                      >
                        Ouvrir
                      </a>
                    )}
                  </div>
                  {!n.read && (
                    <button
                      onClick={() => markAsRead(n.id)}
                      className="text-xs px-2 py-1 rounded bg-neutral-800 border border-neutral-700 hover:bg-neutral-700"
                    >
                      Lu
                    </button>
                  )}
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
