/**
 * Валидация комментария (ТЗ 6.3.6):
 * - необязательный;
 * - максимум 1000 символов;
 * - буквы, цифры, знаки препинания, переносы строк;
 * - пробелы в начале и конце автоматически обрезаются.
 */
import { MAX_COMMENT_LENGTH } from '../types';

/** Разрешены: буквы любого языка, цифры, пробелы/переносы строки, знаки препинания, символы валют. */
const ALLOWED_RE = /^[\p{L}\p{N}\p{P}\p{Sc}\s]*$/u;

export function normalizeComment(raw: string): string {
  return raw.trim();
}

export interface CommentValidation {
  ok: boolean;
  value: string;
  error?: string;
}

export function validateComment(raw: string): CommentValidation {
  const value = normalizeComment(raw);
  if (value.length === 0) return { ok: true, value };
  if (value.length > MAX_COMMENT_LENGTH) {
    return {
      ok: false,
      value,
      error: `Комментарий не должен превышать ${MAX_COMMENT_LENGTH} символов.`,
    };
  }
  if (!ALLOWED_RE.test(value)) {
    return {
      ok: false,
      value,
      error: 'Допускаются буквы, цифры, знаки препинания и переносы строк.',
    };
  }
  return { ok: true, value };
}
