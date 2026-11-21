import React, { Suspense, lazy } from 'react';
import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  Navigate,
} from '@tanstack/react-router';
import { DashboardLayout } from './components/layout/DashboardLayout';
import { useAuth } from './context/auth-context';
import { EdgekitLogo } from './components/common/EdgekitLogo';
import { ErrorFallback } from './components/common/ErrorBoundary';

// Code-splitting com React.lazy para reduzir o bundle monolítico inicial
const LazyLoginPage = lazy(() => import('./pages/LoginPage').then((m) => ({ default: m.LoginPage })));
const LazySetupPage = lazy(() => import('./pages/SetupPage').then((m) => ({ default: m.SetupPage })));
const LazyOverviewPage = lazy(() => import('./pages/OverviewPage').then((m) => ({ default: m.OverviewPage })));
const LazyDatabasePage = lazy(() => import('./pages/DatabasePage').then((m) => ({ default: m.DatabasePage })));
const LazyAuthPage = lazy(() => import('./pages/AuthPage').then((m) => ({ default: m.AuthPage })));
const LazyStoragePage = lazy(() => import('./pages/StoragePage').then((m) => ({ default: m.StoragePage })));
const LazyRealtimePage = lazy(() => import('./pages/RealtimePage').then((m) => ({ default: m.RealtimePage })));
const LazySettingsPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })));

const PageLoadingFallback: React.FC = () => (
  <div className="flex h-full min-h-[300px] w-full flex-col items-center justify-center bg-transparent gap-3 py-12 animate-in fade-in-50 duration-200">
    <div className="flex size-10 items-center justify-center rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-500 animate-pulse">
      <EdgekitLogo size={24} module="platform" />
    </div>
    <p className="text-xs text-muted-foreground animate-pulse">Carregando módulo...</p>
  </div>
);

function withSuspense<P extends object>(Component: React.ComponentType<P>): React.FC<P> {
  return function SuspendedRoute(props: P) {
    return (
      <Suspense fallback={<PageLoadingFallback />}>
        <Component {...props} />
      </Suspense>
    );
  };
}

const DashboardGuard: React.FC = () => {
  const { isAuthenticated, isLoading, isSetupComplete } = useAuth();

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

  if (!isSetupComplete) {
    return <Navigate to="/setup" replace />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <DashboardLayout />;
};

const rootRoute = createRootRoute({
  component: Outlet,
  errorComponent: ({ error }) => <ErrorFallback error={error} />,
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: withSuspense(LazyLoginPage),
});

const setupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/setup',
  component: withSuspense(LazySetupPage),
});

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: '_dashboard',
  component: DashboardGuard,
});

const indexRoute = createRoute({
  getParentRoute: () => dashboardRoute,
  path: '/',
  component: withSuspense(LazyOverviewPage),
});

const databaseRoute = createRoute({
  getParentRoute: () => dashboardRoute,
  path: '/database',
  component: withSuspense(LazyDatabasePage),
});

const authRoute = createRoute({
  getParentRoute: () => dashboardRoute,
  path: '/auth',
  component: withSuspense(LazyAuthPage),
});

const storageRoute = createRoute({
  getParentRoute: () => dashboardRoute,
  path: '/storage',
  component: withSuspense(LazyStoragePage),
});

const realtimeRoute = createRoute({
  getParentRoute: () => dashboardRoute,
  path: '/realtime',
  component: withSuspense(LazyRealtimePage),
});

const settingsRoute = createRoute({
  getParentRoute: () => dashboardRoute,
  path: '/settings',
  component: withSuspense(LazySettingsPage),
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  setupRoute,
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
  defaultErrorComponent: ({ error }) => <ErrorFallback error={error} />,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
