import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { PlaceholderPage } from './components/PlaceholderPage';
import { RequireAdmin, RequireAuth } from './components/RequireAuth';
import { LoginPage } from './pages/LoginPage';
import { StockPage } from './pages/StockPage';
import { SettingsPage } from './pages/settings/SettingsPage';
import { ItemsPage } from './pages/settings/ItemsPage';
import { ItemFormPage } from './pages/settings/ItemFormPage';
import { BulkStockEntryPage } from './pages/settings/BulkStockEntryPage';

function App() {
  return (
    <Routes>
      <Route path='/login' element={<LoginPage />} />

      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }>
        <Route index element={<Navigate to='/stock' replace />} />
        <Route path='/stock' element={<StockPage />} />
        <Route path='/sales' element={<PlaceholderPage title='Sales' screenRef='section 2.5' />} />
        <Route
          path='/reports'
          element={<PlaceholderPage title='Reports' screenRef='section 2.14' />}
        />
        <Route
          path='/roster'
          element={<PlaceholderPage title='Roster' screenRef='sections 2.15-2.17' />}
        />

        <Route
          path='/orders'
          element={
            <RequireAdmin>
              <PlaceholderPage title='Orders' screenRef='sections 2.6-2.10' />
            </RequireAdmin>
          }
        />
        <Route
          path='/stocktake'
          element={
            <RequireAdmin>
              <PlaceholderPage title='Stocktake' screenRef='sections 2.11-2.13' />
            </RequireAdmin>
          }
        />
        <Route
          path='/settings'
          element={
            <RequireAdmin>
              <SettingsPage />
            </RequireAdmin>
          }>
          <Route path='items' element={<ItemsPage />} />
          <Route path='items/new' element={<ItemFormPage />} />
          <Route path='items/:id' element={<ItemFormPage />} />
          <Route path='bulk-stock' element={<BulkStockEntryPage />} />
          <Route
            path='opening-times'
            element={<PlaceholderPage title='Opening times' screenRef='section 2.16' />}
          />
          <Route
            path='holidays'
            element={<PlaceholderPage title='School holidays' screenRef='section 2.17' />}
          />
        </Route>
      </Route>

      <Route path='*' element={<Navigate to='/' replace />} />
    </Routes>
  );
}

export default App;
