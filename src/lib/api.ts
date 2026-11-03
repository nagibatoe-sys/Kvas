/**
 * Сетевой слой (ТЗ 9, 6.1).
 *
 * В демо-режиме (нет настроенного VITE_API_URL) используется встроенный mock-сервер:
 * - хранит события в localStorage, проверяет идемпотентность по event_id (ТЗ 9.2);
 * - эмулирует отсутствие сети через window.offline / navigator.onLine;
 * - принимает тестовые учетные данные demo@shift.ru / 1234 (и +70000000000 / 1234).
 *
 * Реальный сервер: HTTPS-эндпоинты /auth/login и /events (ТЗ 16.4 — только HTTPS).
 */
import type { AuthSession, ShiftEvent, SubmitResult } from '../types';

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '';

export const DEMO_CREDENTIALS = {
  login: 'demo@shift.ru',
  altLogin: '+70000000000',
  password: '1234',
} as const;

/** Есть ли сейчас связь (для входа и синхронизации). */
export function isOnline(): boolean {
  if (typeof window === 'undefined') return false;
  // window.offline — ручной переключатель режима для отладки/демо.
  if ((window as unknown as { offline?: boolean }).offline === true) return false;
  return typeof navigator !== 'undefined' ? navigator.onLine : false;
}

/* ---------------- Mock-сервер (демо без бэкенда) ---------------- */

interface MockServerState {
  events: Record<string, ShiftEvent>;
}

const MOCK_KEY = 'shift-app-mock-server';

function loadMock(): MockServerState {
  try {
    const raw = localStorage.getItem(MOCK_KEY);
    if (raw) return JSON.parse(raw) as MockServerState;
  } catch {
    /* ignore */
  }
  return { events: {} };
}

function saveMock(state: MockServerState): void {
  try {
    localStorage.setItem(MOCK_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ---------------- Авторизация ---------------- */

export async function apiLogin(login: string, password: string): Promise<AuthSession> {
  if (!isOnline()) throw new Error('unavailable');
  await delay(400);

  if (API_BASE) {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login, password }),
    });
    if (res.status === 401 || res.status === 400) throw new Error('invalid');
    if (!res.ok) throw new Error('unavailable');
    const data = (await res.json()) as AuthSession;
    return data;
  }

  // Демо-режим
  const normalized = login.trim().toLowerCase();
  const ok =
    (normalized === DEMO_CREDENTIALS.login || normalized === DEMO_CREDENTIALS.altLogin) &&
    password === DEMO_CREDENTIALS.password;
  if (!ok) throw new Error('invalid');
  return {
    token: `demo-token-${Date.now()}`,
    user: { id: 'u-1', name: 'Иван Петров', contact: DEMO_CREDENTIALS.login },
  };
}

/** Обновление сессии при истекшем токене (ТЗ 9.5). */
export async function apiRefreshSession(token: string): Promise<AuthSession | null> {
  if (!isOnline()) return null;
  if (API_BASE) {
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return null;
      return (await res.json()) as AuthSession;
    } catch {
      return null;
    }
  }
  // Демо: токен считается бессрочным.
  return null;
}

/* ---------------- Отправка отметки ---------------- */

/** Payload ровно по ТЗ 9.1 (без служебных локальных полей). */
export function toPayload(e: ShiftEvent) {
  return {
    event_id: e.event_id,
    event_type: e.event_type,
    created_at_local: e.created_at_local,
    timezone_offset: e.timezone_offset,
    comment: e.comment,
    latitude: e.latitude,
    longitude: e.longitude,
  };
}

export async function apiSubmitEvent(
  event: ShiftEvent,
  token: string,
): Promise<SubmitResult> {
  if (!isOnline()) return { kind: 'network_error' };
  await delay(API_BASE ? 0 : 350);

  if (API_BASE) {
    try {
      const res = await fetch(`${API_BASE}/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'Idempotency-Key': event.event_id,
        },
        body: JSON.stringify(toPayload(event)),
      });
      if (res.ok) return { kind: 'ok' };
      if (res.status === 401) return { kind: 'auth_expired' };
      return { kind: 'server_error', message: `HTTP ${res.status}` };
    } catch {
      return { kind: 'network_error' };
    }
  }

  // Демо-сервер: идемпотентность по event_id (ТЗ 9.2), порядок start→end (ТЗ 6.6.5).
  const state = loadMock();
  if (state.events[event.event_id]) return { kind: 'ok' }; // уже принят — дубль не создается
  if (event.event_type === 'end') {
    const hasStartSent = Object.values(state.events).some((e) => e.event_type === 'start');
    if (!hasStartSent) {
      return { kind: 'server_error', message: 'Нельзя отправить окончание раньше начала смены.' };
    }
  }
  state.events[event.event_id] = structuredClone(toPayload(event)) as ShiftEvent;
  saveMock(state);
  return { kind: 'ok' };
}

/** История с сервера (ТЗ 6.8.2). При недоступности возвращает null — показываем локальные данные. */
export async function apiFetchHistory(
  token: string,
  days = 30,
): Promise<ShiftEvent[] | null> {
  if (!isOnline()) return null;
  if (API_BASE) {
    try {
      const res = await fetch(`${API_BASE}/events/me?days=${days}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return null;
      return (await res.json()) as ShiftEvent[];
    } catch {
      return null;
    }
  }
  await delay(200);
  const state = loadMock();
  return Object.values(state.events) as ShiftEvent[];
}
