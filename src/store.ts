/**
 * Центральный модуль состояния и бизнес-логики (zustand).
 * Реализует модули из ТЗ 18: авторизация, главный экран, создание отметок,
 * локальное хранение, синхронизация, история.
 */
import { create } from 'zustand';
import type { AuthSession, ShiftEvent, SyncStatus } from './types';
import {
  RETRY_BACKOFF_SECONDS,
  OFFLINE_STORAGE_MAX_EVENTS,
  OFFLINE_STORAGE_MAX_AGE_DAYS,
} from './types';
import * as storage from './lib/storage';
import { apiLogin, apiRefreshSession, apiSubmitEvent, isOnline } from './lib/api';
import { localIso, getTimezoneOffset, daysAgo } from './lib/time';

export type AppPhase = 'boot' | 'login' | 'main';

interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'warn' | 'error';
}

interface AppState {
  phase: AppPhase;
  session: AuthSession | null;
  events: ShiftEvent[];
  activeStartId: string | null;
  online: boolean;
  syncing: boolean;
  /** Защита от повторного нажатия подтверждения (ТЗ 6.3.8, 11.5). */
  submitting: boolean;
  toast: Toast | null;

  // actions
  boot(): Promise<void>;
  login(login: string, password: string): Promise<'ok' | 'invalid' | 'unavailable'>;
  logoutAttempt(): 'blocked' | 'ok';
  refreshNetwork(): void;
  createShiftEvent(
    type: 'start' | 'end',
    coords: { latitude: number; longitude: number },
    comment: string,
  ): Promise<{ ok: boolean; error?: string }>;
  syncNow(): Promise<void>;
  dismissToast(): void;
}

let toastSeq = 0;

/** Порядок очереди: сначала начало, потом окончание; внутри — хронология (ТЗ 6.6.5). */
export function orderForSync(events: ShiftEvent[]): ShiftEvent[] {
  return [...events].sort((a, b) => {
    const t = a.created_at_local.localeCompare(b.created_at_local);
    if (t !== 0) return t;
    return a.event_type === b.event_type ? 0 : a.event_type === 'start' ? -1 : 1;
  });
}

/** Наступила ли следующая попытка для события с учетом backoff (ТЗ 6.6.4). */
export function isRetryDue(ev: ShiftEvent, nowMs: number): boolean {
  if (ev.attempts === 0) return true;
  const idx = Math.min(ev.attempts, RETRY_BACKOFF_SECONDS.length - 1);
  const waitMs = RETRY_BACKOFF_SECONDS[idx] * 1000;
  const last = ev.last_attempt_at ? new Date(ev.last_attempt_at).getTime() : 0;
  return nowMs - last >= waitMs;
}

/** Признак переполнения локального хранилища (ТЗ 6.6.7). */
export function isStorageOverflow(pending: ShiftEvent[], now: Date = new Date()): boolean {
  if (pending.length > OFFLINE_STORAGE_MAX_EVENTS) return true;
  return pending.some((e) => daysAgo(e.created_at_local, now) > OFFLINE_STORAGE_MAX_AGE_DAYS);
}

export const useAppStore = create<AppState>((set, get) => {
  function showToast(text: string, tone: Toast['tone'] = 'info') {
    set({ toast: { id: ++toastSeq, text, tone } });
  }

  async function reloadDerived() {
    const events = await storage.getAllEvents();
    const activeStartId = await storage.getActiveShiftStartId();
    set({ events, activeStartId });
  }

  /** Отправка одной отметки с разбором результата (ТЗ 9.3–9.5). */
  async function sendOne(ev: ShiftEvent): Promise<'ok' | 'retry' | 'auth' | 'server_error'> {
    const { session } = get();
    if (!session) return 'retry';
    const res = await apiSubmitEvent(ev, session.token);
    switch (res.kind) {
      case 'ok':
        await storage.updateEventStatus(ev.event_id, { sync_status: 'synced' });
        return 'ok';
      case 'network_error':
        await storage.updateEventStatus(ev.event_id, {
          attempts: ev.attempts + 1,
          last_attempt_at: new Date().toISOString(),
        });
        return 'retry';
      case 'auth_expired':
        return 'auth';
      case 'server_error':
        await storage.updateEventStatus(ev.event_id, {
          sync_status: 'error',
          attempts: ev.attempts + 1,
          last_attempt_at: new Date().toISOString(),
        });
        return 'server_error';
      default:
        return 'retry';
    }
  }

  /** Полная синхронизация очереди в правильном порядке (ТЗ 6.6.3–6.6.5, 10.7). */
  async function runSync(trigger: 'auto' | 'manual' = 'auto'): Promise<void> {
    const state = get();
    if (state.syncing) return;
    if (!isOnline()) {
      set({ online: false });
      return;
    }
    set({ syncing: true, online: true });
    try {
      const queue = orderForSync(await storage.getPendingEvents());
      const nowMs = Date.now();
      for (const ev of queue) {
        if (!isRetryDue(ev, nowMs)) continue;
        // Нельзя отправить окончание раньше начала смены (ТЗ 6.6.5):
        const startOfSameShift = queue.find(
          (s) => s.event_type === 'start' && s.created_at_local <= ev.created_at_local,
        );
        if (ev.event_type === 'end' && startOfSameShift) {
          const fresh = await storage.getAllEvents();
          const storedStart = fresh.find((s) => s.event_id === startOfSameShift.event_id);
          if (storedStart && storedStart.sync_status !== 'synced') continue;
        }
        const outcome = await sendOne(ev);
        if (outcome === 'auth') {
          // ТЗ 9.5: пробуем обновить сессию; неотправленные отметки не удаляем.
          const refreshed = await apiRefreshSession(get().session?.token ?? '');
          if (refreshed) {
            await storage.saveSession(refreshed);
            set({ session: refreshed });
            const again = await sendOne(ev);
            if (again === 'ok') continue;
          } else {
            set({ phase: 'login' });
            showToast('Сессия истекла. Войдите повторно.', 'error');
            break;
          }
        }
      }
      await reloadDerived();
      const remaining = await storage.getPendingEvents();
      if (trigger === 'manual' && isOnline()) {
        if (remaining.length === 0) showToast('Все данные отправлены.');
        else showToast('Не удалось отправить данные. Повторная отправка будет выполнена автоматически.', 'warn');
      }
      if (isStorageOverflow(remaining)) {
        showToast(
          'Есть давно неотправленные отметки. Подключитесь к интернету для синхронизации.',
          'warn',
        );
      }
    } finally {
      set({ syncing: false });
    }
  }

  return {
    phase: 'boot',
    session: null,
    events: [],
    activeStartId: null,
    online: isOnline(),
    syncing: false,
    submitting: false,
    toast: null,

    /* ---------- Экран загрузки (ТЗ 7.1): проверка сессии и очереди ---------- */
    async boot() {
      const session = await storage.loadSession();
      await reloadDerived();
      const online = isOnline();
      set({ session, online, phase: session ? 'main' : 'login' });
      if (session) {
        // При запуске повторяем отправку локальных отметок (ТЗ 10.7, 13).
        void runSync('auto');
      }
    },

    /* ---------- Авторизация (ТЗ 6.1) ---------- */
    async login(login, password) {
      if (!isOnline()) {
        set({ online: false });
        return 'unavailable';
      }
      try {
        const session = await apiLogin(login, password);
        await storage.saveSession(session);
        set({ session, phase: 'main', online: true });
        await reloadDerived();
        void runSync('auto');
        return 'ok';
      } catch (err) {
        const msg = (err as Error).message;
        if (msg === 'invalid') return 'invalid';
        set({ online: false });
        return 'unavailable';
      }
    },

    /* ---------- Выход с защитой при неотправленных отметках (ТЗ 6.9.2) ---------- */
    logoutAttempt() {
      const pending = get().events.filter((e) => e.sync_status !== 'synced');
      if (pending.length > 0) return 'blocked';
      void (async () => {
        await storage.clearUserScopedData();
        set({ session: null, phase: 'login', events: [], activeStartId: null });
      })();
      return 'ok';
    },

    refreshNetwork() {
      const online = isOnline();
      const wasOffline = !get().online;
      set({ online });
      // ТЗ 6.6.3: при появлении интернета — автоматическая отправка.
      if (online && wasOffline && get().session) void runSync('auto');
    },

    /* ---------- Создание отметки (ТЗ 6.3.7, 6.4.6) ---------- */
    async createShiftEvent(type, coords, comment) {
      const state = get();
      if (!state.session) return { ok: false, error: 'no_session' };
      if (state.submitting) return { ok: false, error: 'busy' }; // защита от двойного нажатия

      // ТЗ 15.1–15.3: одна активная смена.
      if (type === 'start' && state.activeStartId) {
        return { ok: false, error: 'already_active' };
      }
      if (type === 'end' && !state.activeStartId) {
        return { ok: false, error: 'no_active_shift' };
      }

      set({ submitting: true });
      try {
        const ev: ShiftEvent = {
          event_id: crypto.randomUUID(),
          event_type: type,
          created_at_local: localIso(new Date()), // время фиксируется в момент подтверждения (ТЗ 15.4)
          timezone_offset: getTimezoneOffset(),
          comment: comment.trim(),
          latitude: coords.latitude,
          longitude: coords.longitude,
          sync_status: 'pending',
          seq: 0,
          attempts: 0,
        };
        const stored = await storage.putEvent(ev);
        // Смена считается активной/завершенной локально сразу после подтверждения.
        if (type === 'start') await storage.setActiveShiftStartId(stored.event_id);
        else await storage.setActiveShiftStartId(null);
        await reloadDerived();

        if (isOnline()) {
          set({ online: true });
          const outcome = await sendOne(stored);
          await reloadDerived();
          if (outcome === 'ok') {
            showToast(type === 'start' ? 'Смена начата. Данные отправлены.' : 'Смена завершена. Данные отправлены.');
          } else if (outcome === 'auth') {
            const refreshed = await apiRefreshSession(get().session?.token ?? '');
            if (refreshed) {
              await storage.saveSession(refreshed);
              set({ session: refreshed });
              await sendOne(stored);
              await reloadDerived();
            } else {
              set({ phase: 'login' });
              showToast('Сессия истекла. Войдите повторно.', 'error');
            }
          } else {
            showToast('Не удалось отправить данные. Повторная отправка будет выполнена автоматически.', 'warn');
          }
        } else {
          set({ online: false });
          showToast('Нет соединения. Отметка будет отправлена позже.', 'info');
        }
        return { ok: true };
      } finally {
        set({ submitting: false });
      }
    },

    syncNow() {
      return runSync('manual');
    },

    dismissToast() {
      set({ toast: null });
    },
  };
});

/* ---------------- Селекторы статуса для UI ---------------- */

export function selectActiveShift(state: AppState): ShiftEvent | null {
  if (!state.activeStartId) return null;
  return state.events.find((e) => e.event_id === state.activeStartId) ?? null;
}

export function selectLastFinishedShift(state: AppState): ShiftEvent | null {
  const ends = state.events.filter((e) => e.event_type === 'end');
  return ends.length ? ends[ends.length - 1] : null;
}

export function selectPendingCount(state: AppState): number {
  return state.events.filter((e) => e.sync_status !== 'synced').length;
}

export function statusLabel(status: SyncStatus): 'stSynced' | 'stPending' | 'stError' {
  return status === 'synced' ? 'stSynced' : status === 'pending' ? 'stPending' : 'stError';
}
