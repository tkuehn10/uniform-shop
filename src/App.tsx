import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { PlaceholderPage } from './components/PlaceholderPage';
import { RequireAdmin, RequireAuth } from './components/RequireAuth';
import { LoginPage } from './pages/LoginPage';
import { StockPage } from './pages/StockPage';
import { SalesPage } from './pages/SalesPage';
import { OrdersPage } from './pages/orders/OrdersPage';
import { OrderFormPage } from './pages/orders/OrderFormPage';
import { OrderDetailPage } from './pages/orders/OrderDetailPage';
import { DeliveriesPage } from './pages/orders/DeliveriesPage';
import { StocktakesPage } from './pages/stocktake/StocktakesPage';
import { StocktakeFormPage } from './pages/stocktake/StocktakeFormPage';
import { StocktakeDetailPage } from './pages/stocktake/StocktakeDetailPage';
import { ReportsPage } from './pages/ReportsPage';
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
        <Route path='/sales' element={<SalesPage />} />
        <Route path='/reports' element={<ReportsPage />} />
        <Route
          path='/roster'
          element={<PlaceholderPage title='Roster' screenRef='sections 2.15-2.17' />}
        />

        <Route
          path='/orders'
          element={
            <RequireAdmin>
              <OrdersPage />
            </RequireAdmin>
          }
        />
        <Route
          path='/orders/new'
          element={
            <RequireAdmin>
              <OrderFormPage />
            </RequireAdmin>
          }
        />
        <Route
          path='/orders/deliveries'
          element={
            <RequireAdmin>
              <DeliveriesPage />
            </RequireAdmin>
          }
        />
        <Route
          path='/orders/:id'
          element={
            <RequireAdmin>
              <OrderDetailPage />
            </RequireAdmin>
          }
        />
        <Route
          path='/stocktake'
          element={
            <RequireAdmin>
              <StocktakesPage />
            </RequireAdmin>
          }
        />
        <Route
          path='/stocktake/new'
          element={
            <RequireAdmin>
              <StocktakeFormPage />
            </RequireAdmin>
          }
        />
        <Route
          path='/stocktake/:id'
          element={
            <RequireAdmin>
              <StocktakeDetailPage />
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
