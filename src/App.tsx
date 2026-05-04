import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ROUTE_PATHS } from '@/lib/index';
import Layout from '@/components/Layout';
import Home from '@/pages/Home';
import Accounts from '@/pages/Accounts';
import Phones from '@/pages/Phones';
import Tasks from '@/pages/Tasks';
import SettingsPage from '@/pages/SettingsPage';
import AdminPage from '@/pages/Admin';

export default function App() {
  return (
    <Router>
      <Routes>
        <Route element={<Layout />}>
          <Route path={ROUTE_PATHS.HOME} element={<Home />} />
          <Route path={ROUTE_PATHS.ACCOUNTS} element={<Accounts />} />
          <Route path={ROUTE_PATHS.PHONES} element={<Phones />} />
          <Route path={ROUTE_PATHS.TASKS} element={<Tasks />} />
          <Route path={ROUTE_PATHS.ADMIN} element={<AdminPage />} />
          <Route path={ROUTE_PATHS.SETTINGS} element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to={ROUTE_PATHS.HOME} replace />} />
      </Routes>
    </Router>
  );
}
