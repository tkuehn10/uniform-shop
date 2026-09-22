import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className='centered-page'>Loading…</div>;

  // Hand the login screen the page they were heading for so it can send them back.
  if (!session) return <Navigate to='/login' replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { isAdmin, loading } = useAuth();
  if (loading) return <div className='centered-page'>Loading…</div>;
  if (!isAdmin) return <Navigate to='/stock' replace />;
  return <>{children}</>;
}
