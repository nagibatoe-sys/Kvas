import { useEffect } from 'react';
import { useAppStore } from '../store';
import { texts } from '../i18n';

/** Всплывающее сообщение о статусе отправки (ТЗ 10.1, 10.2). */
export function Toast() {
  const toast = useAppStore((s) => s.toast);
  const dismiss = useAppStore((s) => s.dismissToast);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(dismiss, 4200);
    return () => clearTimeout(t);
  }, [toast, dismiss]);

  if (!toast) return null;
  return (
    <div className={`toast ${toast.tone}`} role="status" onClick={dismiss}>
      {toast.text}
    </div>
  );
}

/** Индикатор сети в шапке (ТЗ 6.2.1). */
export function NetBadge() {
  const online = useAppStore((s) => s.online);
  return (
    <span className={`net-badge${online ? '' : ' offline'}`} data-testid="net-badge">
      {online ? `📶 ${texts.netOnline}` : `✈️ ${texts.netOffline}`}
    </span>
  );
}

export function Topbar({ title, backTo }: { title: string; backTo?: string }) {
  return (
    <header className="topbar">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {backTo && (
          <a className="back-link" href={backTo} aria-label={texts.back}>
            ‹ {texts.back}
          </a>
        )}
        <h1>{title}</h1>
      </div>
      <NetBadge />
    </header>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span>
      <span className="spinner" aria-hidden="true" />
      {label}
    </span>
  );
}
