// Глобальные polyfill-ы для тестов: IndexedDB (fake-indexeddb) и crypto.randomUUID.
import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';

if (typeof globalThis.crypto === 'undefined' || typeof globalThis.crypto.randomUUID !== 'function') {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}
