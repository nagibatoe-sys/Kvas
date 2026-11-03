/**
 * Корневой компонент: маршрутизация экранов (ТЗ 7), загрузка (7.1),
 * слушатели сети и периодическая синхронизация (ТЗ 6.6.3–6.6.4, 13).
 */
import { useEffect } from 'react';
import {
  HashRouter,
  Navigate,
  Route,
  Routes,
  useNavigate,
} from 'react-router-dom';
import { useAppStore } from './store';
import { texts } from './i18n';
import { Spinner, Toast } from './components/ui';
import { LoginScreen } from './screens/LoginScreen';
import { MainScreen } from './screens/MainScreen';
import { ShiftConfirmScreen } from './screens/ShiftConfirmScreen';
import { HistoryScreen } from './screens/HistoryScreen';
import { ProfileScreen } from './screens/ProfileScreen';

/** Период проверки очереди отправки, мс (минимальный шаг backoff из ТЗ 6.6.4). */
const SYNC_TICK_MS = 15_000;

function BootGate({ children }: { children: React.ReactNode }) {
  const phase = useAppStore((s) => s.phase);
  if (phase === 'boot') {
    return (
      <div className="app-shell">
        <div className="boot-screen" role="status">
          <Spinner label={texts.loading} />
        </div>
      </div>
    );
  }
  if (phase === 'login') return <LoginScreen />;
  return <>{children}</>;
}

function AppRoutes() {
  const navigate = useNavigate();
  const activeShift = useAppStore((s) =>
    s.activeStartId ? s.events.find((e) => e.event_id === s.activeStartId) ?? null : null,
  );

  return (
    <BootGate>
      <Routes>
        <Route path="/" element={<MainScreen onNavigate={(p) => navigate(p)} />} />
        <Route
          path="/start"
          element={
            activeShift ? (
              <Navigate to="/" replace />
            ) : (
              <ShiftConfirmScreen mode="start" onDone={() => navigate('/')} />
            )
          }
        />
        <Route
          path="/finish"
          element={
            !activeShift ? (
              <Navigate to="/" replace />
            ) : (
              <ShiftConfirmScreen mode="finish" onDone={() => navigate('/')} />
            )
          }
        />
        <Route path="/history" element={<HistoryScreen />} />
        <Route path="/profile" element={<ProfileScreen onLoggedOut={() => navigate('/')} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BootGate>
  );
}

export default function App() {
  const boot = useAppStore((s) => s.boot);
  const refreshNetwork = useAppStore((s) => s.refreshNetwork);
  const syncNow = useAppStore((s) => s.syncNow);

  // Экран загрузки: проверка локальной сессии и неотправленных отметок (ТЗ 7.1).
  useEffect(() => {
    void boot();
  }, [boot]);

  // Слушатели состояния сети: при появлении связи — автоматическая отправка (ТЗ 6.6.3).
  useEffect(() => {
    const onOnline = () => refreshNetwork();
    const onOffline = () => refreshNetwork();
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [refreshNetwork]);

  // Периодическая попытка синхронизации для событий с истекшим backoff (ТЗ 6.6.4).
  useEffect(() => {
    const t = setInterval(() => {
      const s = useAppStore.getState();
      if (s.session && s.online) void syncNow();
    }, SYNC_TICK_MS);
    return () => clearInterval(t);
  }, [syncNow]);

  return (
    <HashRouter>
      <AppRoutes />
      <Toast />
    </HashRouter>
  );
}
