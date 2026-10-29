import React from 'react';
import {
  Globe,
  Sun,
  Moon,
  LogOut,
  User,
  Zap,
} from 'lucide-react';
import { EdgekitLogo } from '../common/EdgekitLogo';
import { useI18n } from '../../i18n/context';
import { useTheme } from '../../theme/context';
import { useAuth } from '../../context/auth-context';
import { useSidebar, SidebarTrigger } from '@/components/ui/sidebar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { Link, useRouterState } from '@tanstack/react-router';
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';

export const TopHeader: React.FC = () => {
  const { locale, setLocale, t } = useI18n();
  const { resolvedTheme, toggleTheme } = useTheme();
  const { logout } = useAuth();
  const { state } = useSidebar();

  const routerState = useRouterState();
  const pathname = routerState.location.pathname;

  const getBreadcrumbs = () => {
    switch (pathname) {
      case '/database':
        return t.breadcrumbs.database;
      case '/auth':
        return t.breadcrumbs.auth;
      case '/storage':
        return t.breadcrumbs.storage;
      case '/realtime':
        return t.breadcrumbs.realtime;
      case '/settings':
        return t.breadcrumbs.settings;
      case '/':
      default:
        return t.breadcrumbs.overview;
    }
  };

  const currentPage = getBreadcrumbs();

  return (
    <header className="sticky top-0 z-40 flex h-12 w-full border-b border-border bg-card/90 backdrop-blur-md select-none">
      {/* 1. Célula Superior Esquerda (Alinhada com a largura da Sidebar) */}
      <div
        className={cn(
          'flex h-full items-center border-r border-border bg-card transition-[width] duration-200 ease-in-out shrink-0',
          state === 'collapsed'
            ? 'w-[var(--sidebar-width-icon)] justify-center px-0'
            : 'w-full lg:w-[var(--sidebar-width)] justify-between px-3'
        )}
      >
        <Link to="/" className="flex items-center gap-2 overflow-hidden outline-hidden">
          {/* Logo oficial do Edgekit Platform */}
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-orange-500/10 border border-orange-500/20 text-orange-500 shadow-xs">
            <EdgekitLogo size={20} module="platform" />
          </div>

          {state !== 'collapsed' && (
            <div className="flex items-center gap-1.5 overflow-hidden whitespace-nowrap">
              <span className="font-bold tracking-tight text-foreground text-sm">Edgekit</span>
              <span className="font-semibold text-orange-500 text-sm">Platform</span>
              <span className="ml-1 rounded px-1.5 py-0.2 text-[10px] font-mono font-medium bg-muted text-muted-foreground border border-border">
                edge
              </span>
            </div>
          )}
        </Link>

        {/* Mobile toggle button */}
        <div className="lg:hidden">
          <SidebarTrigger />
        </div>
      </div>

      {/* 2. Barra Superior Direita com Breadcrumbs integrados */}
      <div className="flex flex-1 items-center justify-between px-3 sm:px-4 gap-3 overflow-hidden">
        {/* Esquerda: Breadcrumbs na barra superior + Trigger desktop */}
        <div className="flex items-center gap-2 overflow-hidden">
          <SidebarTrigger className="hidden lg:flex shrink-0" />
          <Breadcrumb>
            <BreadcrumbList className="text-xs whitespace-nowrap">
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link to="/" className="text-muted-foreground hover:text-foreground">
                    {t.breadcrumbs.home}
                  </Link>
                </BreadcrumbLink>
              </BreadcrumbItem>

              {pathname !== '/' && (
                <>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbPage className="font-semibold text-foreground">
                      {currentPage}
                    </BreadcrumbPage>
                  </BreadcrumbItem>
                </>
              )}
            </BreadcrumbList>
          </Breadcrumb>
        </div>

        {/* Direita: Status Cloudflare & Avatar do Administrador */}
        <div className="ml-auto flex items-center gap-2 sm:gap-3 shrink-0">
          <Badge
            variant="outline"
            className="flex items-center gap-1.5 px-2.5 py-0.5 text-[11px] font-medium border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 select-none"
          >
            <Zap className="size-3 text-emerald-500 fill-emerald-500" />
            <span>Cloudflare Edge (Online)</span>
          </Badge>

          {/* Avatar e Menu do Usuário */}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 rounded-full border border-border"
                />
              }
            >
              <User className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuGroup>
                <DropdownMenuLabel>
                  <p className="font-semibold text-foreground truncate">Admin Studio</p>
                  <p className="text-[11px] text-muted-foreground font-mono font-normal truncate">
                    Cloudflare BaaS
                  </p>
                </DropdownMenuLabel>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem
                  onClick={() => setLocale(locale === 'pt-BR' ? 'en' : 'pt-BR')}
                  className="justify-between"
                >
                  <div className="flex items-center gap-2">
                    <Globe className="size-4" />
                    <span>{locale === 'pt-BR' ? 'Idioma' : 'Language'}</span>
                  </div>
                  <span className="font-semibold text-[10px] uppercase bg-muted px-1.5 py-0.5 rounded border border-border/70 text-foreground">
                    {locale === 'pt-BR' ? 'PT-BR' : 'EN'}
                  </span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={toggleTheme} className="justify-between">
                  <div className="flex items-center gap-2">
                    {resolvedTheme === 'dark' ? (
                      <Moon className="size-4 text-primary" />
                    ) : (
                      <Sun className="size-4 text-amber-500" />
                    )}
                    <span>{locale === 'pt-BR' ? 'Aparência' : 'Appearance'}</span>
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    {resolvedTheme === 'dark'
                      ? (locale === 'pt-BR' ? 'Escuro' : 'Dark')
                      : (locale === 'pt-BR' ? 'Claro' : 'Light')}
                  </span>
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => logout()}
              >
                <LogOut className="size-4" />
                <span>{locale === 'pt-BR' ? 'Finalizar sessão' : 'Sign out'}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
};
