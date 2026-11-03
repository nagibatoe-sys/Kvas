/**
 * Экран входа (ТЗ 6.1, 7.2).
 * - поля: телефон или email + пароль;
 * - показ/скрытие пароля;
 * - ошибки: неверные данные / сервис недоступен;
 * - без интернета вход не выполняется (ТЗ 6.1.4).
 */
import { useState, type FormEvent } from 'react';
import { useAppStore } from '../store';
import { texts } from '../i18n';
import { DEMO_CREDENTIALS } from '../lib/api';
import { NetBadge } from '../components/ui';

export function LoginScreen() {
  const login = useAppStore((s) => s.login);
  const online = useAppStore((s) => s.online);
  const [loginValue, setLoginValue] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forgotOpen, setForgotOpen] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const res = await login(loginValue, password);
      if (res === 'invalid') setError(texts.loginErrorInvalid);
      if (res === 'unavailable') setError(texts.loginErrorUnavailable);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <h1>{texts.loginTitle}</h1>
        <NetBadge />
      </header>
      <main className="content">
        <form className="card" onSubmit={onSubmit} data-testid="login-form">
          <div className="field">
            <label htmlFor="login">{texts.loginField}</label>
            <input
              id="login"
              className="input"
              type="text"
              inputMode="email"
              autoComplete="username"
              value={loginValue}
              onChange={(e) => setLoginValue(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="password">{texts.passwordField}</label>
            <input
              id="password"
              className="input"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button
              type="button"
              className="muted small"
              style={{ background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', padding: 0 }}
              onClick={() => setShowPassword((v) => !v)}
            >
              {showPassword ? `🙈 ${texts.hidePassword}` : `👁 ${texts.showPassword}`}
            </button>
          </div>

          {error && <p className="error-text" role="alert">{error}</p>}
          {!online && <p className="warn-text">{texts.loginOfflineHint}</p>}

          <button
            type="submit"
            className="btn btn-primary"
            disabled={busy || !loginValue || !password}
          >
            {busy ? <span className="spinner" aria-hidden="true" /> : null}
            {texts.loginButton}
          </button>

          <p style={{ textAlign: 'center', marginTop: 12 }}>
            <button
              type="button"
              className="muted"
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}
              onClick={() => setForgotOpen((v) => !v)}
            >
              {texts.forgotPassword}
            </button>
          </p>
          {forgotOpen && <p className="muted small">{texts.passwordRecoveryNote}</p>}
        </form>

        <div className="card demo-panel">
          <p className="small muted" style={{ margin: 0 }}>
            Демо-вход: <b>{DEMO_CREDENTIALS.login}</b> / <b>{DEMO_CREDENTIALS.password}</b>
            <br />
            (или телефон {DEMO_CREDENTIALS.altLogin})
          </p>
        </div>
      </main>
    </div>
  );
}
