/**
 * Экран истории отметок (ТЗ 6.8, 7.6).
 * Показывает локальные отметки за последние 30 дней, сгруппированные по датам;
 * при доступности сервера — сверяет статусы (ТЗ 6.8.2).
 */
import { useEffect, useMemo, useState } from 'react';
import { useAppStore, statusLabel } from '../store';
import { texts } from '../i18n';
import { dayKey, daysAgo, formatDateRu, formatTime } from '../lib/time';
import { apiFetchHistory } from '../lib/api';
import { updateEventStatus } from '../lib/storage';
import { Topbar } from '../components/ui';

const HISTORY_DAYS = 30; // рекомендованный период (ТЗ 6.8.2)

export function HistoryScreen() {
  const events = useAppStore((s) => s.events);
  const session = useAppStore((s) => s.session);
  const online = useAppStore((s) => s.online);
  const [serverUnavailable, setServerUnavailable] = useState(false);

  // Сверка статусов с сервером, если он доступен (ТЗ 6.8.2 "если данные с сервера недоступны — локальные").
  useEffect(() => {
    let cancelled = false;
    async function check() {
      if (!session) return;
      const remote = await apiFetchHistory(session.token, HISTORY_DAYS);
      if (cancelled) return;
      if (remote === null) {
        setServerUnavailable(true);
        return;
      }
      setServerUnavailable(false);
      const remoteIds = new Set(remote.map((e) => e.event_id));
      for (const ev of events) {
        if (remoteIds.has(ev.event_id) && ev.sync_status !== 'synced') {
          await updateEventStatus(ev.event_id, { sync_status: 'synced' });
        }
      }
    }
    void check();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.token, online]);

  const groups = useMemo(() => {
    const recent = events.filter((e) => daysAgo(e.created_at_local) <= HISTORY_DAYS - 1);
    const byDay = new Map<string, typeof recent>();
    for (const e of [...recent].reverse()) {
      const k = dayKey(e.created_at_local);
      const list = byDay.get(k) ?? [];
      list.push(e);
      byDay.set(k, list);
    }
    return [...byDay.entries()]; // уже в порядке вставки: новые дни первыми
  }, [events]);

  return (
    <div className="app-shell">
      <Topbar title={texts.historyTitle} backTo="/" />
      <main className="content" data-testid="history-screen">
        {serverUnavailable && events.length > 0 && (
          <p className="warn-text small">{texts.historyLocalOnly}</p>
        )}
        {groups.length === 0 ? (
          <div className="card muted">{texts.historyEmpty}</div>
        ) : (
          groups.map(([day, list]) => (
            <section className="history-day" key={day}>
              <h3>{formatDateRu(list[0].created_at_local)}</h3>
              {list.map((e) => (
                <article className="card event-card" key={e.event_id} data-testid={`event-${e.event_type}`}>
                  <div className="event-head">
                    <span className="event-type">
                      {e.event_type === 'start' ? texts.evtStart : texts.evtEnd}
                    </span>
                    <span className="event-time">— {formatTime(e.created_at_local)}</span>
                  </div>
                  {e.comment && <p className="muted small" style={{ margin: 0 }}>{texts.commentPrefix(e.comment)}</p>}
                  <p style={{ margin: 0 }}>
                    <span className={`badge ${e.sync_status}`} data-testid={`status-${e.event_id}`}>
                      Статус: {texts[statusLabel(e.sync_status)]}
                    </span>
                  </p>
                </article>
              ))}
            </section>
          ))
        )}
      </main>
    </div>
  );
}
