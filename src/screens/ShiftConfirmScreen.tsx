/**
 * Экран подтверждения начала/завершения смены (ТЗ 6.3.5–6.3.8, 6.4.4–6.4.7, 7.4, 7.5)
 * + обработка ошибок геолокации (ТЗ 7.8, 10.3, 10.4).
 *
 * Поток: нажатие на главной → запрос геопозиции one-shot → экран подтверждения
 * с комментарием → подтверждение (блокировка кнопки, индикатор загрузки) → создание отметки.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppStore, selectActiveShift } from '../store';
import { texts } from '../i18n';
import { resolveLocationForMark } from '../lib/location';
import { validateComment } from '../lib/comment';
import { formatTime, localIso } from '../lib/time';
import { MAX_COMMENT_LENGTH } from '../types';
import { Topbar, Spinner } from '../components/ui';

type ScreenMode = 'start' | 'finish';
type EventMode = 'start' | 'end';
type Phase = 'locating' | 'confirm' | 'geo_error';

interface GeoErrorState {
  reason: 'permission_denied' | 'unavailable';
}

export function ShiftConfirmScreen({
  mode,
  onDone,
}: {
  mode: ScreenMode;
  onDone: () => void;
}) {
  const state = useAppStore();
  const createShiftEvent = state.createShiftEvent;
  const submitting = state.submitting;
  const activeShift = selectActiveShift(state);
  const eventMode: EventMode = mode === 'start' ? 'start' : 'end';

  const [phase, setPhase] = useState<Phase>('locating');
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [isDemoGeo, setIsDemoGeo] = useState(false);
  const [geoError, setGeoError] = useState<GeoErrorState | null>(null);
  const [comment, setComment] = useState('');
  const [commentError, setCommentError] = useState<string | null>(null);
  const [nowLabel] = useState(() => formatTime(localIso()));
  /** Защита от дублей при повторных нажатиях/запросах (ТЗ 6.3.8). */
  const inFlight = useRef(false);

  const askLocation = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setPhase('locating');
    setGeoError(null);
    // В web-прототипе при недоступности GPS (например, доступ через туннель,
    // где браузер блокирует геолокацию в небезопасном контексте) используются
    // демо-координаты, чтобы весь поток отметки можно было проверить.
    // При явном запрете доступа (permission_denied) отметка не создается (ТЗ 10.3).
    const res = await resolveLocationForMark();
    inFlight.current = false;
    if (res.ok) {
      setCoords({ latitude: res.latitude, longitude: res.longitude });
      setIsDemoGeo(res.demo);
      setPhase('confirm');
    } else {
      setGeoError({ reason: res.reason });
      setPhase('geo_error');
    }
  }, []);

  useEffect(() => {
    void askLocation();
  }, [askLocation]);

  // ТЗ 6.4.1/10.6: нельзя завершить смену, которой нет; 10.5: нельзя начать вторую.
  useEffect(() => {
    if (eventMode === 'end' && !activeShift) onDone();
    if (eventMode === 'start' && activeShift) onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onConfirm() {
    if (submitting || !coords) return;
    const v = validateComment(comment);
    if (!v.ok) {
      setCommentError(v.error ?? 'Некорректный комментарий.');
      return;
    }
    const res = await createShiftEvent(eventMode, coords, v.value);
    if (res.ok) onDone();
    else if (res.error === 'already_active' || res.error === 'no_active_shift') onDone();
  }

  const title = mode === 'start' ? texts.startScreenTitle : texts.finishScreenTitle;

  return (
    <div className="app-shell">
      <Topbar title={texts.appTitle} backTo="/" />
      <main className="content">
        {phase === 'locating' && (
          <div className="card" style={{ textAlign: 'center' }}>
            <Spinner label={texts.locating} />
          </div>
        )}

        {phase === 'geo_error' && geoError && (
          <div className="card" role="alert" data-testid="geo-error-screen">
            <h2 className="status-title" style={{ fontSize: 19 }}>
              {geoError.reason === 'permission_denied'
                ? texts.locationPermissionTitle
                : '⚠️'}
            </h2>
            <p className="error-text">
              {geoError.reason === 'permission_denied'
                ? mode === 'start'
                  ? texts.locationPermissionTextStart
                  : texts.locationPermissionTextEnd
                : texts.locationFailedText}
            </p>
            <p className="muted small">Отметка не создана без определения местоположения.</p>
            <div className="btn-row" style={{ marginTop: 12 }}>
              <button type="button" className="btn btn-secondary" onClick={onDone}>
                {texts.btnCancel}
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void askLocation()}>
                {texts.btnRetry}
              </button>
            </div>
            {geoError.reason === 'permission_denied' && (
              <button
                type="button"
                className="btn btn-secondary"
                style={{ marginTop: 10 }}
                onClick={() => window.open('about:blank', '_self')}
                title="В нативной сборке открывает системные настройки приложения"
              >
                ⚙ {texts.btnOpenSettings}
              </button>
            )}
          </div>
        )}

        {phase === 'confirm' && coords && (
          <div className="card" data-testid="confirm-screen">
            <h2 className="status-title">{title}</h2>
            {mode === 'finish' && activeShift && (
              <p className="status-line">
                {texts.shiftStartedLabel(formatTime(activeShift.created_at_local))}
              </p>
            )}
            <p className="status-line muted">{texts.timeLabel(nowLabel)}</p>
            <p className="small muted" data-testid="coords-line">
              📍 {coords.latitude.toFixed(6)}, {coords.longitude.toFixed(6)}
            </p>
            {isDemoGeo && (
              <p className="badge pending" data-testid="demo-geo-note" style={{ display: 'inline-block', marginBottom: 4 }}>
                ℹ️ Демо-координаты: браузер не передал геолокацию (небезопасный контекст).
                В нативной версии будут реальные GPS-координаты.
              </p>
            )}

            <div className="field" style={{ marginTop: 10 }}>
              <label htmlFor="comment">{texts.commentLabel}</label>
              <textarea
                id="comment"
                className="input"
                placeholder={mode === 'start' ? 'Начал работу на объекте.' : 'Закончил работу, закрыл объект.'}
                value={comment}
                maxLength={MAX_COMMENT_LENGTH + 200}
                onChange={(e) => {
                  setComment(e.target.value);
                  if (commentError) setCommentError(null);
                }}
              />
              <span className="muted small">
                {texts.commentOptional} · {texts.charactersLeft(Math.max(0, MAX_COMMENT_LENGTH - comment.trim().length))}
              </span>
              {commentError && <span className="error-text" role="alert">{commentError}</span>}
            </div>

            <div className="btn-row">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={onDone}
                disabled={submitting}
              >
                {texts.btnCancel}
              </button>
              <button
                type="button"
                className={`btn ${mode === 'start' ? 'btn-primary' : 'btn-danger'}`}
                data-testid="confirm-button"
                onClick={() => void onConfirm()}
                disabled={submitting}
              >
                {submitting ? <Spinner label={texts.sending} /> : mode === 'start' ? texts.btnStart : texts.btnFinish}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
