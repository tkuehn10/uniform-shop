import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

// Nav structure from docs/screens-and-flows.md section 1.
export function Layout() {
  const { profile, isAdmin, signOut } = useAuth();

  return (
    <div className='app-shell'>
      <header className='app-header'>
        <span className='brand'>Uniform Shop</span>
        <nav>
          <NavLink to='/stock'>Stock</NavLink>
          <NavLink to='/sales'>Sales</NavLink>
          {isAdmin && <NavLink to='/orders'>Orders</NavLink>}
          {isAdmin && <NavLink to='/stocktake'>Stocktake</NavLink>}
          <NavLink to='/reports'>Reports</NavLink>
          <NavLink to='/roster'>Roster</NavLink>
          {isAdmin && <NavLink to='/settings'>Settings</NavLink>}
        </nav>
        <div className='user-menu'>
          <span className='muted'>
            {profile?.display_name} ({profile?.role})
          </span>
          <button onClick={() => signOut()}>Sign out</button>
        </div>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
