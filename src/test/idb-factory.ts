/**
 * Тестовый конструктор IndexedDB (только для vitest).
 * fake-indexeddb не позволяет пересоздать глобальный indexedDB напрямую,
 * но экспортирует класс IDBFactory — через него получаем чистую БД перед каждым тестом.
 */
// @ts-expect-error — пакет без типов; используем default-экспорт как конструктор фабрики.
import FDBFactory from 'fake-indexeddb/lib/FDBFactory';

export function makeFreshIdb(): IDBFactory {
  return new (FDBFactory as unknown as new () => IDBFactory)();
}
