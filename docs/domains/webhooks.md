# 🪝 Domínio: Webhooks HTTP & Assinaturas Criptográficas

> Especificação técnica detalhada do despachador de webhooks em background do Edgekit Platform, assinaturas digitais HMAC-SHA256, proteção contra ataques de repetição e testes de entrega.

---

## 1. Visão Geral do Subsistema de Webhooks

Os **Webhooks HTTP (Event Hooks)** permitem que o Edgekit Platform notifique microsserviços externos, APIs corporativas, bots do Slack/Discord ou automações serverless em tempo real sempre que eventos ocorrerem na plataforma (como mutações no banco D1, novos usuários cadastrados ou uploads de arquivos).

```
                      Mutações no D1 / Eventos da API
                                    │
                                    ▼
                     `dispatchWebhooks(event, data)`
                                    │
                  ┌─────────────────┴─────────────────┐
                  ▼                                   ▼
        Gera Assinatura HMAC            `c.executionCtx.waitUntil(...)`
     `X-Edgekit-Signature: sha256=...`       (Executa em background)
                  │                                   │
                  └─────────────────┬─────────────────┘
                                    ▼
                         HTTP POST para a URL Externa
```

---

## 2. Assinatura Criptográfica HMAC-SHA256 (`X-Edgekit-Signature`)

Para que o servidor de destino tenha certeza de que o webhook foi emitido legitimamente pelo Edgekit Platform (e não por um invasor falsificando requisições), cada disparo inclui uma assinatura digital calculada via **WebCrypto HMAC-SHA256**.

### 2.1. Cabeçalhos Enviados na Requisição
Toda requisição de webhook envia os seguintes cabeçalhos HTTP:

| Cabeçalho | Descrição | Exemplo |
| :--- | :--- | :--- |
| **`Content-Type`** | Tipo do payload | `application/json` |
| **`User-Agent`** | Identificador do agente | `Edgekit-Platform-Webhooks/1.0` |
| **`X-Edgekit-Event`** | Nome do evento disparado | `db:pedidos:insert` ou `test.ping` |
| **`X-Edgekit-Delivery-Id`** | ID único do disparo (para idempotência) | `cK9_xYZ812` |
| **`X-Edgekit-Timestamp`** | Timestamp UNIX em milissegundos | `1730376000000` |
| **`X-Edgekit-Signature`** | Assinatura HMAC calculada com o segredo | `sha256=a8f7c19b02e...` |

### 2.2. Como o Destino Valida a Assinatura
O servidor que recebe o webhook pode validar a autenticidade em Node.js, Python, Go ou qualquer linguagem:

```ts
import crypto from 'node:crypto'

function verifyWebhook(rawBody: string, signatureHeader: string, secret: string): boolean {
  const expectedSig = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex')

  return crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expectedSig))
}
```

---

## 3. Despacho Não-Bloqueante em Background (`waitUntil`)

Um dos maiores problemas de webhooks em backends tradicionais é atrasar a resposta da API caso a URL de destino demore para responder ou esteja fora do ar.

No Edgekit Platform:
* O envio é encapsulado dentro de **`c.executionCtx.waitUntil`** da Cloudflare.
* A API responde com **HTTP 201/200 imediatamente** ao usuário que fez a mutação.
* A Cloudflare continua executando o envio do webhook em background no edge.
* Cada disparo possui um **timeout estrito de 6 segundos** (`AbortSignal.timeout(6000)`) para evitar conexões presas consumindo recursos.

---

## 4. Filtros & Padrões de Subscrição de Eventos

Ao cadastrar um webhook na tabela `_ek_webhooks`, o desenvolvedor define a lista de eventos subscritos (`events`):

* **`["*"]`:** O webhook recebe todas as mutações e eventos gerados na plataforma.
* **`["INSERT", "UPDATE"]`:** O webhook só recebe mutações dessas ações específicas.
* **`["pedidos.*"]` ou `["db:pedidos:insert"]`:** O webhook só é acionado quando houver mutações na tabela `pedidos`.
* **`["test.ping"]`:** Eventos de teste disparados pelo painel.

---

## 5. Endpoints Administrativos de Webhooks (`/api/v1/webhooks`)

Todos os endpoints exigem sessão de administrador ou chave `service_role`:

| Método | Rota | Descrição |
| :--- | :--- | :--- |
| `GET` | `/api/v1/webhooks` | Lista todos os webhooks cadastrados e seu status. |
| `POST` | `/api/v1/webhooks` | Cadastra novo webhook com URL, eventos e segredo HMAC. |
| `GET` | `/api/v1/webhooks/:id` | Retorna detalhes do webhook por ID. |
| `PUT` | `/api/v1/webhooks/:id` | Atualiza URL, eventos, segredo ou status (ativo/inativo). |
| `DELETE`| `/api/v1/webhooks/:id` | Exclui o webhook definitivamente. |
| `POST` | `/api/v1/webhooks/:id/test` | **Ping Tester:** dispara um evento de teste real para a URL e retorna o código HTTP de resposta, tempo de latência em milissegundos e prévia do corpo recebido. |
