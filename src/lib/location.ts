/**
 * Модуль геолокации (ТЗ 6.5, 6.3.3–6.3.4, 6.5.3–6.5.4, 18.7).
 *
 * Правила из ТЗ:
 * - геолокация запрашивается только в момент нажатия кнопки (без фонового отслеживания);
 * - используется разрешение "во время использования приложения";
 * - GPS работает без интернета — офлайн отметка всё равно получает координаты.
 */
import type { LocationResult } from '../types';

export type { LocationResult };

export interface GeolocationLike {
  getCurrentPosition(
    success: (pos: GeolocationCoordinatesLite) => void,
    error: (err: { code: number }) => void,
    options?: { enableHighAccuracy?: boolean; timeout?: number; maximumAge?: number },
  ): void;
}

export interface GeolocationCoordinatesLite {
  latitude: number;
  longitude: number;
}

/** Таймаут ожидания координат, мс. */
const POSITION_TIMEOUT_MS = 12_000;

/**
 * Демо-координаты (Москва), используются в web-прототипе, если браузер
 * не смог определить местоположение (например, при доступе через туннель,
 * где запрос геолокации блокируется политикой безопасности браузера).
 */
export const DEMO_COORDS = { latitude: 55.751234, longitude: 37.618423 };

/** Флаг «демо-гео» для отображения предупреждения в UI. */
export let lastLocationWasDemo = false;

export function isSecureContextNow(): boolean {
  if (typeof window === 'undefined') return true;
  return Boolean(window.isSecureContext);
}

async function getRealCoords(geo: GeolocationLike): Promise<GeolocationCoordinatesLite> {
  const coords = await new Promise<GeolocationCoordinatesLite>((resolve, reject) => {
    geo.getCurrentPosition(
      (pos) => resolve(pos),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: POSITION_TIMEOUT_MS, maximumAge: 0 },
    );
  });
  if (
    typeof coords.latitude !== 'number' ||
    typeof coords.longitude !== 'number' ||
    Number.isNaN(coords.latitude) ||
    Number.isNaN(coords.longitude)
  ) {
    throw { code: -1 };
  }
  return coords;
}

/**
 * Запрашивает текущую позицию один раз (one-shot, ТЗ 6.3.3 / 18.7).
 * PERMISSION_DENIED -> permission_denied.
 * Прочие ошибки -> demo_fallback: в web-прототипе подставляются демо-координаты,
 * чтобы интерфейс можно было проверить целиком (в нативной сборке отметка без
 * геолокации не создается — см. ТЗ 6.5.3).
 */
export async function requestCurrentLocation(
  geo: GeolocationLike | undefined | null = typeof navigator !== 'undefined'
    ? (navigator.geolocation as unknown as GeolocationLike | undefined)
    : undefined,
): Promise<
  | { ok: true; latitude: number; longitude: number; demo: boolean }
  | { ok: false; reason: 'permission_denied' | 'unavailable' | 'demo_fallback' }
> {
  if (!geo || typeof geo.getCurrentPosition !== 'function') {
    lastLocationWasDemo = true;
    return { ok: false, reason: 'demo_fallback' };
  }
  try {
    const coords = await getRealCoords(geo);
    lastLocationWasDemo = false;
    return { ok: true, latitude: coords.latitude, longitude: coords.longitude, demo: false };
  } catch (err: unknown) {
    const code = (err as { code?: number })?.code;
    // 1 = PERMISSION_DENIED по стандарту W3C Geolocation API — не создаём отметку (ТЗ 10.3)
    if (code === 1) {
      lastLocationWasDemo = false;
      return { ok: false, reason: 'permission_denied' };
    }
    // Таймаут / недоступность GPS / блокировка небезопасным контекстом —
    // для веб-демо используем фиксированные координаты.
    lastLocationWasDemo = true;
    return { ok: false, reason: 'demo_fallback' };
  }
}

/** Возвращает координаты: реальные либо демо-фолбэк (для web-прототипа). */
export async function resolveLocationForMark(
  geo: GeolocationLike | undefined | null = typeof navigator !== 'undefined'
    ? (navigator.geolocation as unknown as GeolocationLike | undefined)
    : undefined,
): Promise<
  { ok: true; latitude: number; longitude: number; demo: boolean } | { ok: false; reason: 'permission_denied' }
> {
  const res = await requestCurrentLocation(geo);
  if (res.ok) return res;
  if (res.reason === 'demo_fallback') {
    return { ok: true, latitude: DEMO_COORDS.latitude, longitude: DEMO_COORDS.longitude, demo: true };
  }
  // Здесь возможен только permission_denied (unavailable заменён на demo_fallback)
  return { ok: false, reason: res.reason as 'permission_denied' };
}
