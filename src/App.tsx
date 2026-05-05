import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ROUTE_PATHS } from '@/lib/index';
import { useSettingsStore } from '@/hooks/useStore';
import Layout from '@/components/Layout';
import Home from '@/pages/Home';
import Accounts from '@/pages/Accounts';
import Phones from '@/pages/Phones';
import Tasks from '@/pages/Tasks';
import SettingsPage from '@/pages/SettingsPage';
import LoginPage from '@/pages/Login';
import { Toaster } from '@/components/ui/toaster';

/** 已验证身份才能访问，否则跳转登录页 */
function AuthGuard({ children }: { children: React.ReactNode }) {
  const { settings } = useSettingsStore();

  // accessKey === undefined 表示从未登录过（区别于 '' 管理员 / 'xxx' 子账号）
  if (settings.accessKey === undefined) {
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
          <Route path={ROUTE_PATHS.SETTINGS} element={<SettingsPage />} />
        </Route>

        {/* 兜底 */}
        <Route path="*" element={<Navigate to={ROUTE_PATHS.LOGIN} replace />} />
      </Routes>
      <Toaster />
    </Router>
  );
}
