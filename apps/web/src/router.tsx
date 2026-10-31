import React from 'react';
import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  Navigate,
} from '@tanstack/react-router';
import { DashboardLayout } from './components/layout/DashboardLayout';
import { LoginPage } from './pages/LoginPage';
import { OverviewPage } from './pages/OverviewPage';
import { DatabasePage } from './pages/DatabasePage';
import { AuthPage } from './pages/AuthPage';
import { StoragePage } from './pages/StoragePage';
import { RealtimePage } from './pages/RealtimePage';
import { SettingsPage } from './pages/SettingsPage';
import { useAuth } from './context/auth-context';
import { EdgekitLogo } from './components/common/EdgekitLogo';

const DashboardGuard: React.FC = () => {
  const { isAuthenticated, isLoading, isSetupComplete: _isSetupComplete } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-svh w-full flex-col items-center justify-center bg-background text-foreground gap-3">
        <div className="flex size-12 items-center justify-center rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-500 animate-pulse">
          <EdgekitLogo size={28} module="platform" />
        </div>
        <p className="text-xs text-muted-foreground animate-pulse">Carregando Edgekit Platform...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <DashboardLayout />;
};

const rootRoute = createRootRoute({
  component: Outlet,
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginPage,
});

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: '_dashboard',
  component: DashboardGuard,
});

const indexRoute = createRoute({
  getParentRoute: () => dashboardRoute,
  path: '/',
  component: OverviewPage,
});

const databaseRoute = createRoute({
  getParentRoute: () => dashboardRoute,
  path: '/database',
  component: DatabasePage,
});

const authRoute = createRoute({
  getParentRoute: () => dashboardRoute,
  path: '/auth',
  component: AuthPage,
});

const storageRoute = createRoute({
  getParentRoute: () => dashboardRoute,
  path: '/storage',
  component: StoragePage,
});

const realtimeRoute = createRoute({
  getParentRoute: () => dashboardRoute,
  path: '/realtime',
  component: RealtimePage,
});

const settingsRoute = createRoute({
  getParentRoute: () => dashboardRoute,
  path: '/settings',
  component: SettingsPage,
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  dashboardRoute.addChildren([
    indexRoute,
    databaseRoute,
    authRoute,
    storageRoute,
    realtimeRoute,
    settingsRoute,
  ]),
]);

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
