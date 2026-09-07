import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { PublicRoute } from './components/PublicRoute';
import { RootRedirect } from './components/RootRedirect';
import LoginPage from './pages/LoginPage';
import { AdminLayout } from './layouts/AdminLayout';
import { DashboardPage } from './pages/DashboardPage';
import { FishersPage } from './pages/FishersPage';
import { DebtPaymentsPage } from './pages/DebtPaymentsPage';
import { ClearancePage } from './pages/ClearancePage';
import { SettingsPage } from './pages/SettingsPage';
import { QrScannerPage } from './pages/QrScannerPage';
import { BlockHistoryPage } from './pages/BlockHistoryPage';
import { ImportExportPage } from './pages/ImportExportPage';
import { HowToUsePage } from './pages/HowToUsePage';
import { DepartureCheckerPage } from './pages/DepartureCheckerPage';
import { PlaceholderPage } from './pages/PlaceholderPage';

export const App = () => {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          {/* Root Path: Smart Redirect based on Auth State */}
          <Route path="/" element={<RootRedirect />} />

          {/* Public Login Route (Redirects to /admin/dashboard if already logged in) */}
          <Route
            path="/login"
            element={
              <PublicRoute>
                <LoginPage />
              </PublicRoute>
            }
          />

          {/* Protected Admin Routes */}
          <Route
            path="/admin"
            element={
              <ProtectedRoute>
                <AdminLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/admin/dashboard" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="fishers" element={<FishersPage />} />
            <Route path="qr-scanner" element={<QrScannerPage />} />
            <Route path="debt-payments" element={<DebtPaymentsPage />} />
            <Route path="clearance" element={<ClearancePage />} />
            <Route path="departure-checker" element={<DepartureCheckerPage />} />
            <Route path="departure-pdf-checker" element={<DepartureCheckerPage />} />
            <Route path="block-history" element={<BlockHistoryPage />} />
            <Route path="import-export" element={<ImportExportPage />} />
            <Route path="how-to-use" element={<HowToUsePage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>

          {/* Catch-all Fallback: Smart Root Redirect */}
          <Route path="*" element={<RootRedirect />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
};

export default App;
