import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ROUTE_PATHS } from '@/lib/index';
import { useSettingsStore, useAdminStore } from '@/hooks/useStore';
import Layout from '@/components/Layout';
import Home from '@/pages/Home';
import Accounts from '@/pages/Accounts';
import Phones from '@/pages/Phones';
import Tasks from '@/pages/Tasks';
import SettingsPage from '@/pages/SettingsPage';
import AdminPage from '@/pages/Admin';
import LoginPage from '@/pages/Login';

/** 已验证身份才能访问，否则跳转登录页 */
function AuthGuard({ children }: { children: React.ReactNode }) {
  const { settings } = useSettingsStore();
  const { currentRole } = useAdminStore();

  // accessKey 有值（包括空字符串，代表管理员） OR 非默认角色已设置 → 视为已登录
  // accessKey === undefined 且 currentRole 从未手动 setRole → 未登录
  const isAuthed = settings.accessKey !== undefined && settings.accessKey !== null;

  if (!isAuthed) {
    return <Navigate to={ROUTE_PATHS.LOGIN} replace />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <Router>
      <Routes>
        {/* 登录页（不需要鉴权） */}
        <Route path={ROUTE_PATHS.LOGIN} element={<LoginPage />} />

        {/* 主应用（需要鉴权） */}
        <Route
          element={
            <AuthGuard>
              <Layout />
            </AuthGuard>
          }
        >
          <Route path={ROUTE_PATHS.HOME} element={<Home />} />
          <Route path={ROUTE_PATHS.ACCOUNTS} element={<Accounts />} />
          <Route path={ROUTE_PATHS.PHONES} element={<Phones />} />
          <Route path={ROUTE_PATHS.TASKS} element={<Tasks />} />
          <Route path={ROUTE_PATHS.ADMIN} element={<AdminPage />} />
          <Route path={ROUTE_PATHS.SETTINGS} element={<SettingsPage />} />
        </Route>

        {/* 兜底 */}
        <Route path="*" element={<Navigate to={ROUTE_PATHS.LOGIN} replace />} />
      </Routes>
    </Router>
  );
}
