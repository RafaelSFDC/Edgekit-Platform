import React, { useState } from 'react';
import { Users, Building2, Shield } from 'lucide-react';
import { useI18n } from '../i18n/context';
import { useTableRowsQuery } from '../hooks/api/use-database';
import { usePublicConfigQuery } from '../hooks/api/use-auth';
import { PageLayout } from '../components/layout/PageLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { UserListTab } from '../components/auth/UserListTab';
import { OrganizationsTab } from '../components/auth/OrganizationsTab';
import { AuthFeaturesTab } from '../components/auth/AuthFeaturesTab';

type AuthActiveTab = 'users' | 'organizations' | 'features';

export const AuthPage: React.FC = () => {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<AuthActiveTab>('users');

  const { data: users = [], refetch, isLoading } = useTableRowsQuery('users');
  const { data: publicConfig } = usePublicConfigQuery();

  return (
    <PageLayout>
      <PageHeader
        title={t.auth.title}
        description={t.auth.subtitle}
        actions={
          <div className="flex items-center gap-1.5 bg-muted/60 p-1 rounded-xl border border-border/70">
            <Button
              variant={activeTab === 'users' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveTab('users')}
              className="text-xs h-7.5 cursor-pointer gap-1.5"
            >
              <Users className="size-3.5" />
              <span>Usuários</span>
            </Button>

            <Button
              variant={activeTab === 'organizations' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveTab('organizations')}
              className="text-xs h-7.5 cursor-pointer gap-1.5"
            >
              <Building2 className="size-3.5" />
              <span>Organizações</span>
            </Button>

            <Button
              variant={activeTab === 'features' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveTab('features')}
              className="text-xs h-7.5 cursor-pointer gap-1.5"
            >
              <Shield className="size-3.5" />
              <span>Recursos & SDK</span>
            </Button>
          </div>
        }
      />

      {activeTab === 'users' && (
        <UserListTab
          users={users}
          isLoading={isLoading}
          onRefresh={refetch}
        />
      )}

      {activeTab === 'organizations' && (
        <OrganizationsTab allUsers={users} />
      )}

      {activeTab === 'features' && (
        <AuthFeaturesTab publicConfig={publicConfig} />
      )}
    </PageLayout>
  );
};
