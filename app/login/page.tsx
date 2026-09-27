'use client';

import { useActionState } from 'react';
import { login, type LoginState } from '@/app/auth-actions';

export default function LoginPage() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(
    login,
    {}
  );

  return (
    <div style={{ maxWidth: '400px', margin: '0 auto' }}>
      <div className="page-header">
        <h1 className="page-title">Sign In</h1>
        <p className="page-subtitle">Email-only access to your records</p>
      </div>

      <div className="record-card" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
        <form action={formAction}>
          {state.error && (
            <div
              style={{
                padding: '12px',
                backgroundColor: 'var(--color-error-container)',
                color: 'var(--color-on-error-container)',
                borderRadius: '8px',
                marginBottom: '16px',
                fontSize: '14px',
              }}
            >
              {state.error}
            </div>
          )}

          <div className="form-group">
            <label htmlFor="email" className="form-label">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              className="form-input"
              placeholder="you@example.com"
              autoComplete="email"
              required
              disabled={pending}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {pending ? 'Signing in...' : 'Sign In'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}