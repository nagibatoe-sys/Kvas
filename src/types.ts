/**
 * Доменные типы приложения (раздел 8.2 ТЗ — структура локальной отметки).
 */

export type EventType = 'start' | 'end';

export type SyncStatus = 'pending' | 'synced' | 'error';

/** Локальная отметка сотрудника. */
export interface ShiftEvent {
  /** Уникальный идентификатор события (UUID) — защита от дублей при повторной отправке (ТЗ 8.3, 9.2). */
  event_id: string;
  event_type: EventType;
  /** Локальное время создания отметки (ISO, не пересчитывается при синхронизации — ТЗ 15.4). */
  created_at_local: string;
  /** Смещение часового пояса устройства, например "+03:00". */
  timezone_offset: string;
  comment: string;
  latitude: number;
  longitude: number;
  sync_status: SyncStatus;
  /** Служебное: monotonic-порядок для хронологической отправки (ТЗ 6.6.5). */
  seq: number;
  /** Количество неудачных попыток отправки (экспоненциальный backoff, ТЗ 6.6.4). */
  attempts: number;
  /** Когда была последняя неудачная попытка (ISO). */
  last_attempt_at?: string;
}

export interface UserProfile {
  id: string;
  name: string;
  /** Телефон или email (ТЗ 6.9.1). */
  contact: string;
}

export interface AuthSession {
  token: string;
  user: UserProfile;
}

/** Результат запроса геолокации (ТЗ 6.3.4, 6.5.3). */
export type LocationResult =
  | { ok: true; latitude: number; longitude: number }
  | { ok: false; reason: 'permission_denied' | 'unavailable' };

/** Ответ сервера на отправку отметки. */
export type SubmitResult =
  | { kind: 'ok' }
  | { kind: 'auth_expired' }
  | { kind: 'network_error' }
  | { kind: 'server_error'; message: string };

export const APP_VERSION = '1.0.0';

/** Максимальная длина комментария (ТЗ 6.3.6). */
export const MAX_COMMENT_LENGTH = 1000;

/** Минимальный запас хранения офлайн-отметок (ТЗ 6.6.7). */
export const OFFLINE_STORAGE_MAX_EVENTS = 500;
export const OFFLINE_STORAGE_MAX_AGE_DAYS = 30;

/** Интервалы повторных попыток отправки, сек (ТЗ 6.6.4: увеличивающиеся интервалы). */
export const RETRY_BACKOFF_SECONDS = [0, 15, 30, 60, 120, 300, 600];
