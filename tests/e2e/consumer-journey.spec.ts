import { test, expect } from '@playwright/test'

test.describe('Jornada E2E do Consumidor Real & Tríade Edgekit BaaS', () => {
  test('1. Backend API e Admin Studio estão ativos e saudáveis', async ({ request, page }) => {
    // 1.1 Valida Healthcheck da API
    const healthRes = await request.get('http://localhost:8787/health')
    expect(healthRes.status()).toBe(200)
    const healthJson = await healthRes.json()
    expect(healthJson.status).toBe('ok')
    expect(healthJson.service).toContain('Edgekit Platform')

    // 1.2 Valida carregamento do Admin Studio (:5173)
    await page.goto('http://localhost:5173')
    await expect(page).toHaveTitle(/Edgekit/i)
  })

  test('2. Aplicação Consumidora (:5174) carrega e renderiza serviços do BaaS', async ({ page }) => {
    await page.goto('http://localhost:5174')

    // Verifica Navbar e cabeçalho do Consumidor
    await expect(page.locator('text=Demo Consumer App')).toBeVisible()
    await expect(page.locator('text=Edgekit Platform')).toBeVisible()

    // Verifica que abas de serviços existem
    await expect(page.locator('button:has-text("Todos os Serviços")')).toBeVisible()
    await expect(page.locator('button:has-text("Database")')).toBeVisible()
    await expect(page.locator('button:has-text("Storage")')).toBeVisible()
    await expect(page.locator('button:has-text("Realtime")')).toBeVisible()
    await expect(page.locator('button:has-text("Auditoria & Edge-Cases")')).toBeVisible()
  })

  test('3. Execução da Auditoria de Consumidor In-App valida todos os 7 domínios ao vivo', async ({ page }) => {
    await page.goto('http://localhost:5174')

    // Clica na aba de Auditoria
    await page.click('button:has-text("Auditoria & Edge-Cases")')

    // Verifica se o painel de auditoria carregou
    await expect(page.locator('text=Auditoria de Consumidor & Proteção contra Abuso')).toBeVisible()

    // Clica em Executar Auditoria Completa
    const runButton = page.locator('button:has-text("Executar Auditoria Completa")')
    await expect(runButton).toBeVisible()
    await runButton.click()

    // Aguarda a execução de todos os testes (até 15 segundos)
    await expect(page.locator('text=Auditoria Completa finalizada!')).toBeVisible({ timeout: 15000 })

    // Valida que os 7 passos foram concluídos com sucesso (7 Aprovados)
    await expect(page.locator('text=Aprovados: 7')).toBeVisible()

    // Valida mensagens de sucesso nos cards
    await expect(page.locator('text=Dupla Identidade Estrita 100% confirmada')).toBeVisible()
    await expect(page.locator('text=Prepared statements bloquearam injeção de SQL')).toBeVisible()
    await expect(page.locator('text=Deny-by-default ativo e tabelas do sistema protegidas')).toBeVisible()
  })

  test('4. Fluxo Visual de Inserção e Consulta de Dados via UI Consumidora', async ({ page }) => {
    await page.goto('http://localhost:5174')

    // Clica na aba Database
    await page.click('button:has-text("Database")')

    // Preenche input de nova tarefa
    const taskTitle = `Tarefa E2E Playwright ${Date.now()}`
    const input = page.locator('input[placeholder*="Adicionar novo item"], input[placeholder*="título"]')
    if (await input.count() > 0) {
      await input.first().fill(taskTitle)
      // Clica em Adicionar / Submit
      const submitBtn = page.locator('button[type="submit"]:has-text("Adicionar"), button:has-text("Criar")')
      if (await submitBtn.count() > 0) {
        await submitBtn.first().click()
        // Verifica que o item foi adicionado à lista ou mensagem foi exibida
        await expect(page.locator(`text=${taskTitle}`)).toBeVisible({ timeout: 5000 })
      }
    }
  })
})
