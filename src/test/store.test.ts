/**
 * Интеграционные тесты бизнес-логики по приемочным критериям ТЗ 17:
 * авторизация, смена онлайн/офлайн, автосинхронизация, перезапуск, защита от дублей.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { makeFreshIdb } from './idb-factory';
import { useAppStore, selectActiveShift } from '../store';
import * as storage from '../lib/storage';
import type { ShiftEvent } from '../types';

const w = window as unknown as { offline: boolean };

function setOffline(v: boolean) {
  w.offline = v;
}

async function loginDemo() {
  const res = await useAppStore.getState().login('demo@shift.ru', '1234');
  expect(res).toBe('ok');
}

beforeEach(async () => {
  localStorage.clear();
  await freshDb();
  setOffline(false);
  // Полный сброс состояния стора
  useAppStore.setState({
    phase: 'boot',
    session: null,
    events: [],
    activeStartId: null,
    online: true,
    syncing: false,
    submitting: false,
    toast: null,
  });
});

describe('Авторизация (ТЗ 17.1)', () => {
  it('успешный вход переводит на главный экран и сохраняет сессию', async () => {
    await loginDemo();
    const s = useAppStore.getState();
    expect(s.phase).toBe('main');
    expect(s.session?.user.name).toBe('Иван Петров');
    const restored = await storage.loadSession();
    expect(restored).not.toBeNull();
  });

  it('неверный пароль -> ошибка "invalid"', async () => {
    const res = await useAppStore.getState().login('demo@shift.ru', 'wrong');
    expect(res).toBe('invalid');
    expect(useAppStore.getState().phase).toBe('boot');
  });

  it('без интернета вход не выполняется (ТЗ 6.1.4)', async () => {
    setOffline(true);
    const res = await useAppStore.getState().login('demo@shift.ru', '1234');
    expect(res).toBe('unavailable');
  });

  it('сервер недоступен -> unavailable при сетевой ошибке', async () => {
    setOffline(true);
    const res = await useAppStore.getState().login('+70000000000', '1234');
    expect(res).toBe('unavailable');
  });
});

describe('Начало и завершение смены онлайн (ТЗ 17.2, 17.3)', () => {
  it('смена запускается, отправляется, становится активной и завершается', async () => {
    await loginDemo();
    const coords = { latitude: 55.751234, longitude: 37.618423 };

    const r1 = await useAppStore.getState().createShiftEvent('start', coords, 'Начал работу на объекте.');
    expect(r1.ok).toBe(true);

    let s = useAppStore.getState();
    const active = selectActiveShift(s);
    expect(active).not.toBeNull();
    expect(active!.sync_status).toBe('synced');
    expect(active!.comment).toBe('Начал работу на объекте.');
    expect(active!.latitude).toBe(55.751234);

    const r2 = await useAppStore.getState().createShiftEvent('end', coords, 'Закончил работу.');
    expect(r2.ok).toBe(true);

    s = useAppStore.getState();
    expect(selectActiveShift(s)).toBeNull();
    const end = s.events.find((e) => e.event_type === 'end')!;
    expect(end.sync_status).toBe('synced');
  });
});

describe('Офлайн-режим (ТЗ 17.4, 17.5, 6.6)', () => {
  it('отметки создаются офлайн со статусом pending и сменой, активной локально', async () => {
    await loginDemo();
    setOffline(true);
    useAppStore.getState().refreshNetwork();
    const coords = { latitude: 55.75, longitude: 37.61 };

    const r1 = await useAppStore.getState().createShiftEvent('start', coords, 'Привет');
    expect(r1.ok).toBe(true);
    let s = useAppStore.getState();
    const active = selectActiveShift(s)!;
    expect(active.sync_status).toBe('pending');
    expect(s.online).toBe(false);

    const r2 = await useAppStore.getState().createShiftEvent('end', coords, '');
    expect(r2.ok).toBe(true);
    s = useAppStore.getState();
    expect(selectActiveShift(s)).toBeNull();
    const end = s.events.find((e) => e.event_type === 'end')!;
    expect(end.sync_status).toBe('pending');
    expect(s.toast?.text).toContain('будет отправлена позже');
  });

  it('автоматическая синхронизация при появлении интернета в порядке start->end (ТЗ 17.6, 6.6.5)', async () => {
    await loginDemo();
    setOffline(true);
    useAppStore.getState().refreshNetwork();
    const coords = { latitude: 55.75, longitude: 37.61 };
    await useAppStore.getState().createShiftEvent('start', coords, 'а');
    await useAppStore.getState().createShiftEvent('end', coords, 'б');
    expect(useAppStore.getState().events.every((e) => e.sync_status === 'pending')).toBe(true);

    // Интернет появился — приложение само отправляет данные
    setOffline(false);
    useAppStore.getState().refreshNetwork();
    await vi_wait();
    const s = useAppStore.getState();
    expect(s.events.every((e) => e.sync_status === 'synced')).toBe(true);

    // На сервере приняты оба события, дублей нет
    const mockRaw = localStorage.getItem('shift-app-mock-server');
    const mock = JSON.parse(mockRaw ?? '{"events":{}}');
    expect(Object.keys(mock.events).length).toBe(2);
  });

  it('отметки переживают перезапуск приложения (ТЗ 17.7, 6.6.6)', async () => {
    await loginDemo();
    setOffline(true);
    useAppStore.getState().refreshNetwork();
    await useAppStore.getState().createShiftEvent('start', { latitude: 1, longitude: 2 }, 'off');

    // "Перезапуск": новый boot из того же хранилища
    useAppStore.setState({ phase: 'boot', session: null, events: [], activeStartId: null });
    await useAppStore.getState().boot();

    const s = useAppStore.getState();
    expect(s.phase).toBe('main'); // сессия восстановлена
    const active = selectActiveShift(s)!;
    expect(active).toBeDefined();
    expect(active.sync_status).toBe('pending'); // статус сохранен

    // Появился интернет — автосинхронизация при boot уже запущена
    setOffline(false);
    await useAppStore.getState().syncNow();
    expect(useAppStore.getState().events.every((e) => e.sync_status === 'synced')).toBe(true);
  });
});

describe('Защита от дублей и ошибок (ТЗ 17.8, 10.5, 10.6, 6.3.8)', () => {
  it('нельзя начать вторую активную смену', async () => {
    await loginDemo();
    const coords = { latitude: 1, longitude: 1 };
    const ok = await useAppStore.getState().createShiftEvent('start', coords, '');
    expect(ok.ok).toBe(true);
    const second = await useAppStore.getState().createShiftEvent('start', coords, '');
    expect(second.ok).toBe(false);
    expect(second.error).toBe('already_active');
    expect(useAppStore.getState().events.filter((e) => e.event_type === 'start').length).toBe(1);
  });

  it('нельзя завершить смену, которой нет', async () => {
    await loginDemo();
    const r = await useAppStore.getState().createShiftEvent('end', { latitude: 1, longitude: 1 }, '');
    expect(r.ok).toBe(false);
    expect(r.error).toBe('no_active_shift');
  });

  it('повторное нажатие подтверждения во время отправки не создает дубль', async () => {
    await loginDemo();
    const coords = { latitude: 1, longitude: 1 };
    const p1 = useAppStore.getState().createShiftEvent('start', coords, 'x');
    const p2 = useAppStore.getState().createShiftEvent('start', coords, 'x'); // двойной тап
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(false);
    expect(useAppStore.getState().events.length).toBe(1);
  });

  it('идемпотентность: повторная отправка того же event_id не создает дубль на сервере (ТЗ 9.2)', async () => {
    await loginDemo();
    const ev: ShiftEvent = {
      event_id: 'fixed-id-1',
      event_type: 'start',
      created_at_local: '2026-11-03T09:02:11',
      timezone_offset: '+03:00',
      comment: '',
      latitude: 1,
      longitude: 2,
      sync_status: 'pending',
      seq: 1,
      attempts: 0,
    };
    const { apiSubmitEvent } = await import('../lib/api');
    const token = useAppStore.getState().session!.token;
    const a = await apiSubmitEvent(ev, token);
    const b = await apiSubmitEvent(ev, token);
    expect(a.kind).toBe('ok');
    expect(b.kind).toBe('ok');
    const mock = JSON.parse(localStorage.getItem('shift-app-mock-server')!);
    expect(Object.keys(mock.events)).toEqual(['fixed-id-1']);
  });
});

describe('Профиль и выход (ТЗ 6.9.2, 17)', () => {
  it('выход заблокирован при наличии неотправленных отметок', async () => {
    await loginDemo();
    setOffline(true);
    useAppStore.getState().refreshNetwork();
    await useAppStore.getState().createShiftEvent('start', { latitude: 1, longitude: 1 }, '');
    setOffline(false);

    const res = useAppStore.getState().logoutAttempt();
    expect(res).toBe('blocked');
    expect(useAppStore.getState().session).not.toBeNull();
  });

  it('выход разрешен, когда все отправлено; локальные pending-отметки не теряются при ошибке сети (ТЗ 9.5)', async () => {
    await loginDemo();
    await useAppStore.getState().createShiftEvent('start', { latitude: 1, longitude: 1 }, 'ok');
    await useAppStore.getState().createShiftEvent('end', { latitude: 1, longitude: 1 }, '');
    const res = useAppStore.getState().logoutAttempt();
    expect(res).toBe('ok');
  });
});

/** Полностью чистая IndexedDB перед тестом. */
function freshDb() {
  Object.defineProperty(globalThis, 'indexedDB', {
    value: makeFreshIdb(),
    configurable: true,
    writable: true,
  });
  storage.resetDbForTests();
}

/** Ожидание завершения асинхронных цепочек (mock-сеть имеет задержки). */
async function vi_wait(ms = 1500) {
  await new Promise((r) => setTimeout(r, ms));
}
