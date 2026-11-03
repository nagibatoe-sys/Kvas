/**
 * Модуль локального хранения (ТЗ 8, 18.4).
 *
 * Хранилище: IndexedDB (отметки — переживают закрытие приложения и перезагрузку, ТЗ 6.6.6),
 * сессионные данные — в localStorage/secure-обёртке (в нативной сборке это Keychain/Keystore).
 *
 * Чувствительные данные (токен) не пишутся в логи (ТЗ 8.4, 16.4).
 */
import { openDB, type IDBPDatabase } from 'idb';
import type { AuthSession, ShiftEvent } from '../types';

const DB_NAME = 'shift-app-db';
const DB_VERSION = 1;
const STORE_EVENTS = 'events';
const STORE_META = 'meta';

export const META_KEYS = {
  session: 'session',
  activeShiftStartId: 'active_shift_start_id',
} as const;

let dbPromise: Promise<IDBPDatabase> | null = null;

export function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_EVENTS)) {
          const store = db.createObjectStore(STORE_EVENTS, { keyPath: 'event_id' });
          store.createIndex('seq', 'seq');
        }
        if (!db.objectStoreNames.contains(STORE_META)) {
          db.createObjectStore(STORE_META);
        }
      },
    });
  }
  return dbPromise;
}

/** Сброс соединения (используется в тестах). */
export function resetDbForTests(): void {
  dbPromise = null;
}

/* ---------- Сессия ---------- */

export async function saveSession(session: AuthSession): Promise<void> {
  const db = await getDb();
  await db.put(STORE_META, session, META_KEYS.session);
}

export async function loadSession(): Promise<AuthSession | null> {
  const db = await getDb();
  return ((await db.get(STORE_META, META_KEYS.session)) as AuthSession) ?? null;
}

export async function clearSession(): Promise<void> {
  const db = await getDb();
  await db.delete(STORE_META, META_KEYS.session);
}

/* ---------- Отметки ---------- */

let seqCounter = 0;

/** Следующий monotonic-номер для хронологического порядка отправки (ТЗ 6.6.5). */
async function nextSeq(db: IDBPDatabase): Promise<number> {
  const all = (await db.getAll(STORE_EVENTS)) as ShiftEvent[];
  const max = all.reduce((m, e) => Math.max(m, e.seq ?? 0), 0);
  seqCounter = Math.max(seqCounter, max) + 1;
  return seqCounter;
}

/** Сохраняет отметку локально (insert или обновление по event_id — дубли исключены, ТЗ 8.3). */
export async function putEvent(event: ShiftEvent): Promise<ShiftEvent> {
  const db = await getDb();
  const existing = (await db.get(STORE_EVENTS, event.event_id)) as ShiftEvent | undefined;
  const toStore: ShiftEvent = existing ? event : { ...event, seq: await nextSeq(db) };
  await db.put(STORE_EVENTS, toStore);
  return toStore;
}

export async function updateEventStatus(
  eventId: string,
  patch: Partial<Pick<ShiftEvent, 'sync_status' | 'attempts' | 'last_attempt_at'>>,
): Promise<void> {
  const db = await getDb();
  const ev = (await db.get(STORE_EVENTS, eventId)) as ShiftEvent | undefined;
  if (!ev) return;
  await db.put(STORE_EVENTS, { ...ev, ...patch });
}

export async function getAllEvents(): Promise<ShiftEvent[]> {
  const db = await getDb();
  const all = (await db.getAll(STORE_EVENTS)) as ShiftEvent[];
  return all.sort((a, b) => a.created_at_local.localeCompare(b.created_at_local));
}

/** Неотправленные отметки в хронологическом порядке (start раньше end одного периода — ТЗ 6.6.5). */
export async function getPendingEvents(): Promise<ShiftEvent[]> {
  const all = await getAllEvents();
  return all.filter((e) => e.sync_status !== 'synced');
}

/* ---------- Статус активной смены ---------- */

export async function setActiveShiftStartId(id: string | null): Promise<void> {
  const db = await getDb();
  if (id === null) await db.delete(STORE_META, META_KEYS.activeShiftStartId);
  else await db.put(STORE_META, id, META_KEYS.activeShiftStartId);
}

export async function getActiveShiftStartId(): Promise<string | null> {
  const db = await getDb();
  return (await db.get(STORE_META, META_KEYS.activeShiftStartId)) as string | null;
}

/* ---------- Очистка при выходе ---------- */

/** Удаляет сессию и отправленные данные кэша истории; неотправленные отметки не удаляются (ТЗ 9.5). */
export async function clearUserScopedData(): Promise<void> {
  const db = await getDb();
  await clearSession();
  await setActiveShiftStartId(null);
  const synced = ((await db.getAll(STORE_EVENTS)) as ShiftEvent[]).filter(
    (e) => e.sync_status === 'synced',
  );
  const tx = db.transaction(STORE_EVENTS, 'readwrite');
  for (const e of synced) await tx.store.delete(e.event_id);
  await tx.done;
}
