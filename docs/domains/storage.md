# 🪣 Domínio: Armazenamento de Arquivos (Cloudflare R2 Storage)

> Especificação técnica detalhada do subsistema de armazenamento de arquivos no Cloudflare R2, URLs pré-assinadas com HMAC-SHA256, suporte a streaming HTTP Range e políticas de bucket.

---

## 1. Visão Geral da Arquitetura de Storage

O subsistema de storage do Edgekit Platform é construído diretamente sobre o **Cloudflare R2** (compatível com S3, com custo zero de transferência de saída / *egress fees*):

| Ambiente | Armazenamento Físico | Fallback de Desenvolvimento |
| :--- | :--- | :--- |
| **Produção** | Cloudflare R2 (`env.STORAGE_BUCKET`) | Não aplicável |
| **Local / Testes** | Sistema de arquivos local (`.local/storage`) | Node.js `fs/promises` transparente |

O código do backend encapsula toda a persistência de forma que o desenvolvedor use a mesma API no ambiente local e em produção sem alterar nenhuma linha de código.

---

## 2. Gestão de Buckets & Políticas de Quota

Cada bucket de arquivos é cadastrado e gerenciado na tabela `_ek_storage_buckets`:

### 2.1. Atributos de Configuração do Bucket
* **`name`:** Nome identificador único do bucket (ex: `documentos`, `avatares`, `relatorios`).
* **`isPublic`:** Booleano que define se os arquivos podem ser baixados publicamente ou se exigem autenticação/URL assinada.
* **`maxSizeBytes`:** Limite máximo permitido por arquivo em bytes (ex: `5242880` para 5MB). Uploads maiores são rejeitados imediatamente no gateway com **HTTP 403 `POLICY_VIOLATION`**.
* **`allowedMimeTypes`:** Lista JSON de tipos MIME autorizados (ex: `["image/*", "application/pdf"]`). Arquivos executáveis ou tipos não autorizados são bloqueados antes da gravação.
* **`readRule` & `writeRule`:** Regras declarativas de acesso (`public`, `authenticated`, `admin`).

---

## 3. URLs Pré-Assinadas (HMAC-SHA256)

Para servir arquivos privados (ex: contratos, notas fiscais, exames médicos) sem expor o bucket publicamente e sem forçar o Worker a fazer download e repasse de dados pesados, o Edgekit Platform utiliza **URLs Pré-Assinadas com HMAC-SHA256**.

### 3.1. Geração da URL Assinada (`POST /api/v1/storage/:bucket/signed-url`)
* O cliente autenticado solicita uma URL temporária informando a chave do arquivo e o tempo de expiração desejado:
```json
{
  "key": "contratos/1730376000-contrato.pdf",
  "action": "read",
  "expiresInSeconds": 3600
}
```
* O backend computa a assinatura digital:
```ts
const message = `${bucket}:${key}:${action}:${expiresAtMs}`
const signature = await signHmacSha256(BETTER_AUTH_SECRET, message)
```
* Retorna a URL assinada:
```
https://api.seusite.com/api/v1/storage/docs/file/contratos/doc.pdf?action=read&expires=1730379600000&sig=a8f5c...
```

### 3.2. Validação da Assinatura
Quando a requisição de download chega em `GET /api/v1/storage/:bucket/file/*`:
1. Se o arquivo for público (`isPublic: true`), a entrega é imediata.
2. Se o arquivo for privado, o backend verifica:
   - Se o usuário possui sessão ativa de admin ou chave `service_role`; OU
   - Se a query string contém `sig` e `expires` válidos, onde `Date.now() <= expires` e `HMAC(message) === sig`.
3. Se a assinatura foi adulterada ou o tempo expirou, retorna **HTTP 403 `FORBIDDEN_FILE`**.

---

## 4. Suporte a Streaming & HTTP Range Requests (HTTP 206)

Arquivos multimídia (como vídeos MP4, faixas de áudio ou PDFs grandes) exigem suporte a **requisições parciais por faixas de bytes** para permitir avanço rápido (*seeking*) no player e carregamento sob demanda.

### 4.1. Funcionamento do Header `Range`
* O cliente envia o cabeçalho:
```http
GET /api/v1/storage/videos/file/aula.mp4 HTTP/1.1
Range: bytes=0-1048575
```
* O backend lê apenas o trecho solicitado do Cloudflare R2 ou do disco local e responde com:
```http
HTTP/1.1 206 Partial Content
Content-Type: video/mp4
Content-Range: bytes 0-1048575/15728640
Content-Length: 1048576
Accept-Ranges: bytes
```

Isso garante que um vídeo de 500MB não precise ser carregado integralmente na memória para o usuário assistir aos primeiros 5 segundos.

---

## 5. Endpoints da Storage API

| Método | Rota | Descrição | Nível de Acesso |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/storage/buckets` | Lista buckets cadastrados e suas políticas | Público / Admin |
| `POST` | `/api/v1/storage/buckets` | Cria novo bucket com cotas e restrições | Admin / Service Role |
| `PUT` | `/api/v1/storage/buckets/:name` | Atualiza políticas do bucket | Admin / Service Role |
| `GET` | `/api/v1/storage/:bucket/list` | Lista arquivos armazenados no bucket | Conforme política |
| `POST` | `/api/v1/storage/:bucket/upload` | Upload multipart/form-data com validação | Conforme política |
| `POST` | `/api/v1/storage/:bucket/signed-url` | Gera URL assinada com HMAC-SHA256 | Usuário Autenticado |
| `GET` | `/api/v1/storage/:bucket/file/*` | Download ou streaming com Range header | Público ou Assinado |
| `DELETE`| `/api/v1/storage/:bucket/file/*` | Remove arquivo do R2 e tabela de metadados | Conforme política |
