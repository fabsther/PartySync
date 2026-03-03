import { useMemo, useRef, useState, useEffect } from 'react';
import { Bell, Check, Loader2, Trash2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useUserNotifications } from '../hooks/useUserNotifications';

type Props = {
  userId?: string;
  onNavigate?: (partyId: string, tab?: string, postId?: string) => void;
};

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
  const { t } = useTranslation('activity');
  const { items, unreadCount, loading, hasMore, fetchPage, markAsRead, markAllAsRead, deleteNotification, deleteAllNotifications } =
    useUserNotifications(userId);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const firstPageOldest = useMemo(
    () => (items.length ? items[items.length - 1].created_at : undefined),
    [items]
  );

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (open && ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('click', onClick);
    return () => window.removeEventListener('click', onClick);
  }, [open]);

  const getNavLabel = (action?: string): string => {
    switch (action) {
      case 'post_mention':
      case 'party_post':
        return t('see_post');
      case 'equipment_ping':
      case 'equipment_custom_added':
      case 'equipment_custom_added_by_guest':
        return t('see_equipment');
      case 'ping_rsvp_response':
        return t('see_party');
      case 'ride_pickup':
      case 'ride_kicked':
      case 'request_cancelled_by_user':
      case 'offer_cancelled':
        return t('see_carshare');
      default:
        return t('open');
    }
  };

  const formatTime = (dateString: string): string => {
    const diff = Date.now() - new Date(dateString).getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (mins < 1) return t('time_now');
    if (mins < 60) return t('time_min_ago_one', { count: mins });
    if (hours < 24) return t('time_hours_ago_one', { count: hours });
    return t('time_days_ago_one', { count: days });
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="relative p-2 rounded-lg text-neutral-300 hover:text-white hover:bg-neutral-800 transition"
        title={t('notifications', { ns: 'common' })}
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
            <div className="font-semibold">{t('notifications', { ns: 'common' })}</div>
            <div className="flex items-center gap-3">
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="text-xs text-neutral-400 hover:text-white flex items-center gap-1"
                  title={t('notif_mark_all_read')}
                >
                  <Check className="w-4 h-4" /> {t('notif_mark_all_read')}
                </button>
              )}
              {items.length > 0 && (
                <button
                  onClick={deleteAllNotifications}
                  className="text-xs text-neutral-400 hover:text-red-400 flex items-center gap-1"
                  title={t('notif_delete_all')}
                >
                  <Trash2 className="w-4 h-4" /> {t('notif_delete_all')}
                </button>
              )}
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto divide-y divide-neutral-800">
            {items.length === 0 && !loading && (
              <div className="px-4 py-8 text-center text-neutral-500">{t('notif_none')}</div>
            )}

            {items.map(n => (
              <div key={n.id} className="px-4 py-3 hover:bg-neutral-800/50 transition">
                <div className="flex items-start gap-3">
                  <div className={`mt-1 w-2 h-2 rounded-full ${n.read ? 'bg-neutral-600' : 'bg-orange-500'}`} />
                  <div className="flex-1">
                    <div className="text-sm font-medium">{n.title}</div>
                    <div className="text-sm text-neutral-400">{n.message}</div>
                    <div className="mt-1 text-xs text-neutral-500">
                      {formatTime(n.created_at)}
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
                        {t('open')}
                      </a>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {!n.read && (
                      <button
                        onClick={() => markAsRead(n.id)}
                        className="text-xs px-2 py-1 rounded bg-neutral-800 border border-neutral-700 hover:bg-neutral-700"
                        title={t('read', { ns: 'common' })}
                      >
                        {t('read', { ns: 'common' })}
                      </button>
                    )}
                    <button
                      onClick={() => deleteNotification(n.id)}
                      className="p-1 rounded text-neutral-500 hover:text-red-400 hover:bg-neutral-800 transition"
                      title={t('delete', { ns: 'common' })}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {loading && (
              <div className="px-4 py-4 text-neutral-400 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> {t('notif_loading')}
              </div>
            )}

            {hasMore && !loading && (
              <button
                onClick={() => fetchPage({ after: firstPageOldest })}
                className="w-full px-4 py-3 text-sm text-neutral-300 hover:text-white hover:bg-neutral-800"
              >
                {t('notif_load_more')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
