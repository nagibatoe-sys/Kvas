/** Утилиты формата времени и часового пояса (ТЗ 6.6.2, 8.2, 15.4). */

/** Смещение часового пояса устройства в формате "+03:00" / "-05:30". */
export function getTimezoneOffset(date: Date = new Date()): string {
  const offsetMin = -date.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMin);
  const hh = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');
  return `${sign}${hh}:${mm}`;
}

/** Локальное время создания отметки без пересчета (ISO local, ТЗ 15.4). */
export function localIso(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

/** Время в формате ЧЧ:ММ для отображения. */
export function formatTime(isoLocal: string): string {
  const d = parseLocalIso(isoLocal);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Дата в формате "12 мая" для группировки истории (ТЗ 6.8.3). */
const MONTHS_RU = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

export function formatDateRu(isoLocal: string): string {
  const d = parseLocalIso(isoLocal);
  return `${d.getDate()} ${MONTHS_RU[d.getMonth()]}`;
}

/** Ключ дня для группировки (YYYY-MM-DD по локальному времени). */
export function dayKey(isoLocal: string): string {
  return isoLocal.slice(0, 10);
}

/** Парсит локальный ISO без смещения как локальную дату. */
export function parseLocalIso(isoLocal: string): Date {
  // "2026-11-03T09:02:11" трактуется браузером как локальное время — это то, что нужно.
  return new Date(isoLocal);
}

/** Сколько дней назад произошла отметка (по локальным датам). */
export function daysAgo(isoLocal: string, now: Date = new Date()): number {
  const then = parseLocalIso(isoLocal);
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const b = new Date(then.getFullYear(), then.getMonth(), then.getDate()).getTime();
  return Math.round((a - b) / 86_400_000);
}
