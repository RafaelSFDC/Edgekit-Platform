import assert from 'node:assert';
import { router } from '../src/router';
import { ptBR } from '../src/i18n/locales/pt-BR';
import { en } from '../src/i18n/locales/en';

async function verifyWebDashboard() {
  console.log('🚀 Iniciando validação estrutural do Frontend Edgekit Platform...');

  // 1. Validar rotas públicas (/login e /setup)
  const routes = router.routesByPath as Record<string, any>;
  assert.ok(routes['/login'], 'A rota /login deve existir no router');
  assert.strictEqual(
    routes['/login'].parentRoute?.id,
    '__root__',
    'A rota /login deve ser filha direta da raiz'
  );
  console.log('✅ Rota /login validada com sucesso fora do layout protegido');

  assert.ok(routes['/setup'], 'A rota /setup deve existir no router');
  assert.strictEqual(
    routes['/setup'].parentRoute?.id,
    '__root__',
    'A rota /setup deve ser filha direta da raiz'
  );
  console.log('✅ Rota /setup validada com sucesso fora do layout protegido');

  // 2. Validar rotas protegidas da Dashboard
  const dashboardRoutes = ['/', '/database', '/auth', '/storage', '/realtime', '/settings'];
  for (const path of dashboardRoutes) {
    const route = routes[path];
    assert.ok(route, `A rota ${path} deve estar registrada`);
    assert.strictEqual(
      route.parentRoute?.id,
      '/_dashboard',
      `A rota ${path} deve ser filha de /_dashboard`
    );
  }
  console.log('✅ Todas as rotas protegidas (/, /database, /auth, /storage, /realtime, /settings) pertencem a _dashboard');

  // 3. Validar exportação dos métodos essenciais do serviço de API
  const apiServices = await import('../src/services/api');
  assert.strictEqual(typeof apiServices.checkSetupStatus, 'function', 'checkSetupStatus deve ser uma função');
  assert.strictEqual(typeof apiServices.performSetup, 'function', 'performSetup deve ser uma função');
  assert.strictEqual(typeof apiServices.loginAdminCredentials, 'function', 'loginAdminCredentials deve ser uma função');
  assert.strictEqual(typeof apiServices.loginAuth, 'function', 'loginAuth deve ser uma função');
  assert.strictEqual(typeof apiServices.logoutAuth, 'function', 'logoutAuth deve ser uma função');
  assert.strictEqual(typeof apiServices.fetchAuthMe, 'function', 'fetchAuthMe deve ser uma função');
  assert.strictEqual(typeof apiServices.fetchTables, 'function', 'fetchTables deve ser uma função');
  assert.strictEqual(typeof apiServices.runStructuredQuery, 'function', 'runStructuredQuery deve ser uma função');
  assert.strictEqual(typeof apiServices.fetchFunctionsList, 'function', 'fetchFunctionsList deve ser uma função');
  assert.strictEqual(typeof apiServices.invokeFunctionTest, 'function', 'invokeFunctionTest deve ser uma função');
  assert.strictEqual(typeof apiServices.fetchGeneratedTypes, 'function', 'fetchGeneratedTypes deve ser uma função');
  assert.strictEqual(typeof apiServices.runSql, 'function', 'runSql deve ser uma função');
  console.log('✅ Métodos de comunicação da API do Dashboard Web validados!');

  // 4. Validar chaves de tradução
  assert.ok(ptBR.overview.title, 'ptBR deve ter overview.title');
  assert.ok(ptBR.database.title, 'ptBR deve ter database.title');
  assert.ok(ptBR.storage.title, 'ptBR deve ter storage.title');
  assert.ok(ptBR.realtime.title, 'ptBR deve ter realtime.title');
  assert.ok(ptBR.settings.title, 'ptBR deve ter settings.title');

  assert.ok(en.overview.title, 'en deve ter overview.title');
  assert.ok(en.database.title, 'en deve ter database.title');
  assert.ok(en.storage.title, 'en deve ter storage.title');
  assert.ok(en.realtime.title, 'en deve ter realtime.title');
  assert.ok(en.settings.title, 'en deve ter settings.title');
  console.log('✅ Dicionários de internacionalização i18n (pt-BR e en) validados!');

  console.log('\n🎉 Todos os testes de validação do Frontend Web passaram com sucesso!\n');
}

verifyWebDashboard().catch((err) => {
  console.error('❌ Falha na validação:', err);
  process.exit(1);
});
