/**
 * Юнит-тесты чистых функций: комментарий, время/таймзона, геолокация,
 * порядок синхронизации и backoff (ТЗ 6.3.6, 6.6.4, 6.6.5, 8.2, 15.4).
 */
import { describe, it, expect } from 'vitest';
import { validateComment, normalizeComment } from '../lib/comment';
import { getTimezoneOffset, localIso, formatTime, daysAgo } from '../lib/time';
import { requestCurrentLocation, resolveLocationForMark, DEMO_COORDS, type GeolocationLike } from '../lib/location';
import { orderForSync, isRetryDue, isStorageOverflow } from '../store';
import type { ShiftEvent } from '../types';

function ev(partial: Partial<ShiftEvent>): ShiftEvent {
  return {
    event_id: Math.random().toString(36).slice(2),
    event_type: 'start',
    created_at_local: '2026-11-03T09:02:11',
    timezone_offset: '+03:00',
    comment: '',
    latitude: 55.751234,
    longitude: 37.618423,
    sync_status: 'pending',
    seq: 0,
    attempts: 0,
    ...partial,
  };
}

describe('Комментарий (ТЗ 6.3.6)', () => {
  it('обрезает пробелы по краям', () => {
    expect(normalizeComment('   Начал работу \n\n')).toBe('Начал работу');
  });
  it('пустой комментарий допустим (необязательный)', () => {
    expect(validateComment('   ').ok).toBe(true);
  });
  it('до 1000 символов включительно', () => {
    expect(validateComment('a'.repeat(1000)).ok).toBe(true);
    expect(validateComment('a'.repeat(1001)).ok).toBe(false);
  });
  it('пропускает буквы, цифры, знаки препинания и переносы строк', () => {
    const ok = validateComment('Начал работу на объекте №2, всё в порядке.\nПроверил щиток!');
    expect(ok.ok).toBe(true);
  });
  it('отклоняет управляющие символы/эмодзи вне набора', () => {
    expect(validateComment('tab\tinside\u0000null').ok).toBe(false);
  });
});

describe('Время и часовой пояс (ТЗ 8.2, 15.4)', () => {
  it('timezone offset в формате ±HH:MM', () => {
    const d = new Date();
    jest_like_expect_format(getTimezoneOffset(d));
  });
  function jest_like_expect_format(s: string) {
    expect(/^[+-]\d{2}:\d{2}$/.test(s)).toBe(true);
  }
  it('localIso сохраняет локальное время, а не UTC', () => {
    const d = new Date(2026, 4, 12, 9, 2, 11); // 12 мая 2026 09:02:11 локально
    expect(localIso(d)).toBe('2026-05-12T09:02:11');
    expect(formatTime(localIso(d))).toBe('09:02');
  });
  it('daysAgo считает по календарным дням', () => {
    const today = localIso(new Date());
    expect(daysAgo(today)).toBe(0);
  });
});

describe('Геолокация (ТЗ 6.5.3, 10.3, 10.4)', () => {
  it('возвращает реальные координаты при успехе', async () => {
    const geo: GeolocationLike = {
      getCurrentPosition: (s) => s({ latitude: 55.75, longitude: 37.61 }),
    };
    expect(await requestCurrentLocation(geo)).toEqual({
      ok: true,
      latitude: 55.75,
      longitude: 37.61,
      demo: false,
    });
  });
  it('permission_denied при code=1 — без фолбэка (ТЗ 10.3)', async () => {
    const geo: GeolocationLike = {
      getCurrentPosition: (_s, e) => e({ code: 1 }),
    };
    const res = await requestCurrentLocation(geo);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('permission_denied');
    // resolveLocationForMark не создаёт отметку при запрещённом доступе
    const mark = await resolveLocationForMark(geo);
    expect(mark).toEqual({ ok: false, reason: 'permission_denied' });
  });
  it('demo_fallback при таймауте (code=3), web-демо получает демо-координаты', async () => {
    const geo: GeolocationLike = {
      getCurrentPosition: (_s, e) => e({ code: 3 }),
    };
    const res = await requestCurrentLocation(geo);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('demo_fallback');
    const mark = await resolveLocationForMark(geo);
    expect(mark.ok).toBe(true);
    if (mark.ok) {
      expect(mark.demo).toBe(true);
      expect(mark.latitude).toBe(DEMO_COORDS.latitude);
      expect(mark.longitude).toBe(DEMO_COORDS.longitude);
    }
  });
  it('demo_fallback, если API недоступен', async () => {
    const res = await requestCurrentLocation(undefined);
    expect(res).toEqual({ ok: false, reason: 'demo_fallback' });
  });
});

describe('Порядок отправки и backoff (ТЗ 6.6.4, 6.6.5)', () => {
  it('начала идут раньше окончаний при одинаковом времени', () => {
    const list = [
      ev({ event_type: 'end', created_at_local: '2026-11-03T09:02:11' }),
      ev({ event_type: 'start', created_at_local: '2026-11-03T09:02:11' }),
    ];
    const ordered = orderForSync(list);
    expect(ordered[0].event_type).toBe('start');
    expect(ordered[1].event_type).toBe('end');
  });
  it('хронологический порядок по created_at_local', () => {
    const list = [
      ev({ created_at_local: '2026-11-03T18:05:44', event_type: 'end' }),
      ev({ created_at_local: '2026-11-03T09:02:11', event_type: 'start' }),
      ev({ created_at_local: '2026-11-02T09:00:00', event_type: 'start' }),
    ];
    const ordered = orderForSync(list);
    expect(ordered.map((e) => e.created_at_local)).toEqual([
      '2026-11-02T09:00:00',
      '2026-11-03T09:02:11',
      '2026-11-03T18:05:44',
    ]);
  });
  it('первая попытка сразу, повтор — после увеличивающегося интервала', () => {
    const now = Date.now();
    expect(isRetryDue(ev({ attempts: 0 }), now)).toBe(true);
    const recent = ev({
      attempts: 1,
      last_attempt_at: new Date(now - 5_000).toISOString(),
    });
    expect(isRetryDue(recent, now)).toBe(false); // ждем 15 сек
    const due = ev({
      attempts: 1,
      last_attempt_at: new Date(now - 20_000).toISOString(),
    });
    expect(isRetryDue(due, now)).toBe(true);
  });
  it('предупреждение о переполнении хранилища (ТЗ 6.6.7)', () => {
    expect(isStorageOverflow([])).toBe(false);
    const old = ev({ created_at_local: '2020-01-01T09:00:00' });
    expect(isStorageOverflow([old])).toBe(true);
  });
});
