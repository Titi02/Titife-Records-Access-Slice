import React from 'react';
import { logout } from '@/app/auth-actions';

export default function RecordsLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  modal: React.ReactNode;
}) {
  return (
    <div className="container">
      <form action={logout} style={{ textAlign: 'right', marginBottom: '12px' }}>
        <button type="submit" className="btn btn-ghost">
          Sign out
        </button>
      </form>
      {children}
      {modal}
    </div>
  );
}
