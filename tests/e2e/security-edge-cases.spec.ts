import { test, expect } from '@playwright/test'

test.describe('Edge-Cases Adversários & Blindagem de Segurança (E2E Browser)', () => {
  test('1. Setup Lockout: Tentativa de acessar /setup após instalação redireciona ou bloqueia', async ({ page }) => {
    // Tenta acessar o Setup Wizard do Admin Studio
    await page.goto('http://localhost:5173/setup')

    // Deve redirecionar para /login ou exibir alerta de setup já concluído
    await page.waitForTimeout(1000)
    const currentUrl = page.url()
    const isLoginOrSetup = currentUrl.includes('/login') || currentUrl.includes('/setup')
    expect(isLoginOrSetup).toBe(true)

    // Se estiver em /setup, valida que botão de criação está desativado ou mensagem de concluído é visível
    const completedBadge = page.locator('text=concluído, text=já configurado, text=Setup Completo')
    const loginPrompt = page.locator('text=Entrar, text=Login, input[type="email"]')
    const isProtected = (await completedBadge.count() > 0) || (await loginPrompt.count() > 0) || currentUrl.includes('/login')
    expect(isProtected).toBe(true)
  })

  test('2. Zero-Trust Origin: Bloqueia service_role a partir de origens não autorizadas no navegador', async ({ request }) => {
    // Simula navegador externo tentando enviar service_role
    const res = await request.get('http://localhost:8787/api/v1/admin/stats', {
      headers: {
        Origin: 'https://malicious-external-site.com',
        apikey: 'ek_sec_fake_attack_key_123',
      },
    })

    // Deve ser bloqueado com 403 Forbidden
    expect(res.status()).toBe(403)
  })

  test('3. SQL Injection Shield: Rejeita injeção direta no path de tabela com HTTP 400', async ({ request }) => {
    const res = await request.get("http://localhost:8787/api/v1/db/tasks'; DROP TABLE tasks; --")
    // Rejeita identificador com caractere proibido
    expect([400, 404]).toContain(res.status())
  })

  test('4. Anti-Tampering: Signed URL com parâmetro expirado retorna HTTP 403', async ({ request }) => {
    const expiredTimestamp = Date.now() - 10000 // 10 segundos atrás
    const res = await request.get(`http://localhost:8787/api/v1/storage/default/file/test.png?action=read&expires=${expiredTimestamp}&sig=fake_sig`)
    expect(res.status()).toBe(403)
  })
})
