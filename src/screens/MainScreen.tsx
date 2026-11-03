/**
 * Главный экран (ТЗ 6.2, 7.3) + нижняя навигация.
 * Отображает имя, статус смены, время начала, комментарий, статус синхронизации,
 * индикатор сети и основную крупную кнопку действия.
 */
import { NavLink } from 'react-router-dom';
import {
  useAppStore,
  selectActiveShift,
  selectLastFinishedShift,
  selectPendingCount,
} from '../store';
import { texts } from '../i18n';
import { formatTime } from '../lib/time';
import { Topbar } from '../components/ui';

export function MainScreen({ onNavigate }: { onNavigate: (path: string) => void }) {
  const session = useAppStore((s) => s.session);
  const state = useAppStore();
  const activeShift = selectActiveShift(state);
  const lastFinished = selectLastFinishedShift(state);
  const pendingCount = selectPendingCount(state);
  const online = state.online;
  const syncing = state.syncing;

  // Статусы по ТЗ 6.2.2 / 14
  let statusTitle: string;
  if (activeShift) statusTitle = texts.statusActive;
  else if (lastFinished) statusTitle = texts.statusFinished;
  else statusTitle = texts.statusNotStarted;

  const activeStartPending = activeShift && activeShift.sync_status !== 'synced';
  const finishPending =
    !activeShift &&
    lastFinished &&
    lastFinished.sync_status !== 'synced';

  return (
    <div className="app-shell">
      <Topbar title={texts.appTitle} />
      <main className="content">
        <section className="card" aria-label="Статус смены">
          <p className="muted" style={{ margin: '0 0 4px' }}>
            {session?.user.name ?? ''}
          </p>
          <h2 className="status-title" data-testid="shift-status">
            {statusTitle}
          </h2>

          {activeShift && (
            <>
              <p className="status-line">{texts.startedAt(formatTime(activeShift.created_at_local))}</p>
              {activeShift.comment && (
                <p className="status-line muted">{texts.startComment(activeShift.comment)}</p>
              )}
              {activeStartPending && (
                <p className="status-line">
                  <span className="badge pending" data-testid="awaiting-sync">
                    ⏳ {texts.awaitingSync}
                  </span>
                </p>
              )}
            </>
          )}

          {!activeShift && finishPending && (
            <p className="status-line">
              <span className="badge pending" data-testid="awaiting-sync">
                ⏳ {texts.finishedAwaitingSync}
              </span>
            </p>
          )}

          {!online && (
            <p className="status-line">
              <span className="badge offline">{texts.netOffline} · нет соединения с сервером</span>
            </p>
          )}
        </section>

        {/* Индикатор синхронизации (ТЗ 6.2.1) */}
        <section className="card small" data-testid="sync-indicator">
          {pendingCount > 0 ? (
            <span className="badge pending">⚠ {texts.syncPending} ({pendingCount})</span>
          ) : (
            <span className="badge synced">✓ {texts.syncAllSent}</span>
          )}
          {syncing && <span className="muted" style={{ marginLeft: 8 }}>{texts.sending}</span>}
        </section>

        {/* Основная кнопка действия */}
        {activeShift ? (
          <button
            type="button"
            className="btn btn-danger"
            data-testid="action-button"
            onClick={() => onNavigate('/finish')}
          >
            {texts.btnFinish}
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            data-testid="action-button"
            onClick={() => onNavigate('/start')}
          >
            {texts.btnStart}
          </button>
        )}
      </main>

      <nav className="nav-tabs" aria-label="Навигация">
        <NavLink to="/" end>
          🏠 Смена
        </NavLink>
        <NavLink to="/history">📋 {texts.navHistory}</NavLink>
        <NavLink to="/profile">👤 {texts.navProfile}</NavLink>
      </nav>
    </div>
  );
}
