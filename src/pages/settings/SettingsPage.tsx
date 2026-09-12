import { Link, Outlet, useLocation } from 'react-router-dom';

// Hub for the Admin-only "Settings" section (screens-and-flows.md 2.3, 2.4,
// 2.4a, 2.16, 2.17). The hub tiles show when we're at /settings exactly;
// sub-pages render via the nested <Outlet/> otherwise.
export function SettingsPage() {
  const location = useLocation();
  const atHub = location.pathname === '/settings' || location.pathname === '/settings/';

  return (
    <div className='page'>
      <h1>Settings</h1>
      {atHub ? (
        <div className='settings-grid'>
          <Link className='settings-tile' to='/settings/items'>
            <h2>Items</h2>
            <p>Create and edit items, sizes, photos, and archive old stock lines.</p>
          </Link>
          <Link className='settings-tile' to='/settings/bulk-stock'>
            <h2>Bulk stock entry</h2>
            <p>Set starting on-hand quantities for every item/size at once.</p>
          </Link>
          <Link className='settings-tile' to='/settings/opening-times'>
            <h2>Opening times</h2>
            <p>The recurring weekly pattern the roster calendar repeats.</p>
          </Link>
          <Link className='settings-tile' to='/settings/holidays'>
            <h2>School holidays</h2>
            <p>Date ranges the shop is closed and the roster hides.</p>
          </Link>
        </div>
      ) : (
        <Outlet />
      )}
    </div>
  );
}
