import React, { useState } from 'react';
import {
  Home,
  Database,
  Users,
  HardDrive,
  Activity,
  Settings,
  Search,
  ExternalLink,
} from 'lucide-react';
import { Link, useRouterState } from '@tanstack/react-router';
import { useI18n } from '../../i18n/context';
import { useStatsQuery } from '../../hooks/api/use-stats';
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuBadge,
  useSidebar,
} from '@/components/ui/sidebar';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export const AppSidebar: React.FC = () => {
  const { t } = useI18n();
  const { state, toggleSidebar } = useSidebar();
  const [searchQuery, setSearchQuery] = useState('');

  const { data: stats } = useStatsQuery();

  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;
  const isCollapsed = state === 'collapsed';

  const matchesSearch = (label: string) => {
    if (!searchQuery.trim()) return true;
    return label.toLowerCase().includes(searchQuery.toLowerCase());
  };

  const navItems = [
    {
      to: '/',
      label: t.sidebar.home,
      icon: <Home className="size-4 shrink-0" />,
      badge: undefined,
    },
    {
      to: '/database',
      label: t.sidebar.database,
      icon: <Database className="size-4 shrink-0" />,
      badge: stats?.totalTables !== undefined ? stats.totalTables : undefined,
    },
    {
      to: '/auth',
      label: t.sidebar.auth,
      icon: <Users className="size-4 shrink-0" />,
      badge: stats?.totalUsers !== undefined ? stats.totalUsers : undefined,
    },
    {
      to: '/storage',
      label: t.sidebar.storage,
      icon: <HardDrive className="size-4 shrink-0" />,
      badge: stats?.totalFiles !== undefined ? stats.totalFiles : undefined,
    },
    {
      to: '/realtime',
      label: t.sidebar.realtime,
      icon: <Activity className="size-4 shrink-0" />,
      badge: undefined,
    },
    {
      to: '/settings',
      label: t.sidebar.settings,
      icon: <Settings className="size-4 shrink-0" />,
      badge: undefined,
    },
  ];

  return (
    <Sidebar collapsible="icon" className="select-none">
      {/* 1. Barra de Busca Rápida Estilo Cloudflare (Ctrl + K) */}
      <SidebarHeader className="border-b border-border/50 pb-2">
        {!isCollapsed ? (
          <div className="relative flex items-center">
            <Search className="absolute left-2.5 size-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t.sidebar.quickSearch}
              className="w-full h-8 pl-8 pr-12 rounded-md bg-muted/50 border border-border/80 text-xs text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-primary focus:border-primary transition-all"
            />
            <kbd className="absolute right-2 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground bg-card border border-border/70 rounded">
              Ctrl K
            </kbd>
          </div>
        ) : (
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  onClick={toggleSidebar}
                  className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground mx-auto transition-colors"
                >
                  <Search className="size-4" />
                </button>
              }
            />
            <TooltipContent side="right">{t.sidebar.quickSearch}</TooltipContent>
          </Tooltip>
        )}
      </SidebarHeader>

      {/* 2. Conteúdo de Navegação */}
      <SidebarContent className="pt-2">
        <SidebarMenu>
          {navItems
            .filter((item) => matchesSearch(item.label))
            .map((item) => {
              const isActive = currentPath === item.to;

              const linkButton = (
                <SidebarMenuButton
                  asChild
                  isActive={isActive}
                  className={cn(isCollapsed && 'size-8 justify-center p-0 mx-auto')}
                >
                  <Link
                    to={item.to}
                    className={cn(
                      'flex items-center gap-2.5',
                      isCollapsed && 'size-8 justify-center p-0'
                    )}
                  >
                    {item.icon}
                    {!isCollapsed && <span className="truncate">{item.label}</span>}
                    {!isCollapsed && item.badge !== undefined && (
                      <SidebarMenuBadge>{item.badge}</SidebarMenuBadge>
                    )}
                  </Link>
                </SidebarMenuButton>
              );

              return (
                <SidebarMenuItem key={item.to}>
                  {isCollapsed ? (
                    <Tooltip>
                      <TooltipTrigger render={linkButton} />
                      <TooltipContent side="right">{item.label}</TooltipContent>
                    </Tooltip>
                  ) : (
                    linkButton
                  )}
                </SidebarMenuItem>
              );
            })}
        </SidebarMenu>
      </SidebarContent>

      {/* 3. Rodapé com link para Scalar OpenAPI Docs */}
      <SidebarFooter className="border-t border-border/50 p-2">
        {!isCollapsed ? (
          <a
            href="/docs"
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between px-3 py-2 text-xs text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors"
          >
            <span className="truncate">{t.sidebar.openApiDocs}</span>
            <ExternalLink className="size-3.5 shrink-0" />
          </a>
        ) : (
          <Tooltip>
            <TooltipTrigger
              render={
                <a
                  href="/docs"
                  target="_blank"
                  rel="noreferrer"
                  className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground mx-auto transition-colors"
                >
                  <ExternalLink className="size-4" />
                </a>
              }
            />
            <TooltipContent side="right">{t.sidebar.openApiDocs}</TooltipContent>
          </Tooltip>
        )}
      </SidebarFooter>
    </Sidebar>
  );
};
