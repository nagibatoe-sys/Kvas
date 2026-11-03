/**
 * Модуль геолокации (ТЗ 6.5, 6.3.3–6.3.4, 6.5.3–6.5.4, 18.7).
 *
 * Правила из ТЗ:
 * - геолокация запрашивается только в момент нажатия кнопки (без фонового отслеживания);
 * - используется разрешение "во время использования приложения";
 * - GPS работает без интернета — офлайн отметка всё равно получает координаты.
 */
import type { LocationResult } from '../types';

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
 * Запрашивает текущую позицию один раз (one-shot).
 * PERMISSION_DENIED -> permission_denied, прочие ошибки -> unavailable.
 */
export async function requestCurrentLocation(
  geo: GeolocationLike | undefined | null = typeof navigator !== 'undefined'
    ? (navigator.geolocation as unknown as GeolocationLike | undefined)
    : undefined,
): Promise<LocationResult> {
  if (!geo || typeof geo.getCurrentPosition !== 'function') {
    return { ok: false, reason: 'unavailable' };
  }
  try {
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
      return { ok: false, reason: 'unavailable' };
    }
    return { ok: true, latitude: coords.latitude, longitude: coords.longitude };
  } catch (err: unknown) {
    const code = (err as { code?: number })?.code;
    // 1 = PERMISSION_DENIED по стандарту W3C Geolocation API
    if (code === 1) return { ok: false, reason: 'permission_denied' };
    return { ok: false, reason: 'unavailable' };
  }
}
