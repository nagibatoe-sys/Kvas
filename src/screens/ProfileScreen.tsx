/**
 * Экран профиля (ТЗ 6.9, 7.7).
 * Выход заблокирован, пока есть неотправленные отметки (ТЗ 6.9.2, рекомендуемый вариант).
 */
import { useAppStore, selectPendingCount } from '../store';
import { texts } from '../i18n';
import { APP_VERSION } from '../types';
import { Topbar } from '../components/ui';

export function ProfileScreen({ onLoggedOut }: { onLoggedOut: () => void }) {
  const session = useAppStore((s) => s.session);
  const pendingCount = useAppStore(selectPendingCount);
  const logoutAttempt = useAppStore((s) => s.logoutAttempt);
  const syncNow = useAppStore((s) => s.syncNow);
  const syncing = useAppStore((s) => s.syncing);

  const blocked = pendingCount > 0;

  function onLogout() {
    const res = logoutAttempt();
    if (res === 'ok') onLoggedOut();
  }

  return (
    <div className="app-shell">
      <Topbar title={texts.profileTitle} backTo="/" />
      <main className="content">
        <section className="card" data-testid="profile-screen">
          <div className="profile-row">
            <span className="k">{texts.profileName}</span>
            <b>{session?.user.name ?? '—'}</b>
          </div>
          <div className="profile-row">
            <span className="k">{texts.profileContact}</span>
            <span>{session?.user.contact ?? '—'}</span>
          </div>
          <div className="profile-row">
            <span className="k">{texts.profileVersion}</span>
            <span>{APP_VERSION}</span>
          </div>
          <div className="profile-row">
            <span className="k">{texts.profileAuthStatus}</span>
            <span className="badge synced">{texts.profileAuthorized}</span>
          </div>
        </section>

        {blocked && (
          <>
            <p className="warn-text" role="alert" data-testid="logout-blocked">
              {texts.logoutBlocked}
            </p>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => void syncNow()}
              disabled={syncing}
            >
              {syncing ? texts.sending : `🔄 ${texts.syncPending}`}
            </button>
          </>
        )}

        <button
          type="button"
          className="btn btn-danger"
          onClick={onLogout}
          disabled={blocked}
          data-testid="logout-button"
        >
          {texts.logoutButton}
        </button>
      </main>
    </div>
  );
}
