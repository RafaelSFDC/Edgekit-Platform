# ⚡ Domínio: Tempo Real, WebSockets & Durable Objects

> Especificação técnica detalhada do subsistema de Realtime do Edgekit Platform baseado em Cloudflare Durable Objects, arquitetura multiplexada sobre uma única conexão WebSocket e presença de usuários.

---

## 1. Visão Geral da Arquitetura Realtime

O subsistema de Realtime é projetado para entregar mensagens com latência sub-milisegundo e escala maciça, aproveitando os **Durable Objects** e a **WebSocket Hibernation API** da Cloudflare:

```
                               Cliente Frontend
                        (Navegador / App Mobile / Node)
                                       │
                      1 Única Conexão WebSocket Aberta
                      ws://api.../api/v1/realtime/ws
                                       │
                                       ▼
                         Worker Gateway (Edge Cloudflare)
                                       │
                                       ▼
                       Hub Durable Object (`REALTIME`)
                       ├── WebSocket Hibernation API (Até 32.768 conexões ociosas)
                       ├── WebSocket Tags por Canal (`db:posts`, `chat:1`, `user:123`)
                       └── Presence State Tracker (`presence.join`, `presence.leave`)
```

---

## 2. Por que 1 Conexão Multiplexada por Cliente?

Em aplicações tradicionais mal arquitetadas, o frontend abre múltiplos WebSockets concorrentes (um para chat, um para notificações, um para cada tabela que deseja escutar). 

No Edgekit Platform, isso é considerado um **anti-pattern grave** pelos seguintes motivos:
* **Consumo de Bateria no Mobile:** Múltiplas conexões concorrentes geram múltiplos ciclos de wake-up de CPU e heartbeats de rede paralelos, drenando a bateria do dispositivo.
* **Sobrecarga de Rede:** Cada WebSocket adicional exige um handshake TLS completo, consome portas de rede e piora a latência em redes móveis (3G/4G/5G).
* **Solução Elegante:** O cliente estabelece **apenas 1 conexão WebSocket**. Todos os canais, tabelas e tópicos são assinados ou cancelados dinamicamente através de mensagens leves trafegadas nesse mesmo canal.

---

## 3. Cloudflare Hibernation API & WebSocket Tags

A Cloudflare oferece suporte nativo à hibernação de WebSockets em Durable Objects (`ctx.acceptWebSocket`), permitindo:
1. **Consumo Zero de CPU enquanto Ocioso:**
   Quando os clientes estão apenas ouvindo sem mensagens trafegando, a memória do V8 isolate é suspensa pelo runtime da Cloudflare. A CPU só é tarifada no microssegundo em que uma mensagem é transmitida.
2. **Capacidade para até 32.768 Conexões por DO:**
   Um único Hub Durable Object consegue manter até 32.768 conexões ativas simultaneamente, atendendo com folga praticamente qualquer projeto self-hosted em produção.
3. **Distribuição Cirúrgica com Tags:**
   Cada WebSocket recebe tags correspondentes aos canais em que está inscrito (ex: `channel:db:posts`, `channel:user:usr_123`).
   Quando ocorre uma alteração, o DO despacha a mensagem **exclusivamente** para os sockets que possuem aquela tag via `ctx.getWebSockets(tag)`.

---

## 4. Protocolo de Mensagens do WebSocket

Todas as mensagens trafegadas no WebSocket seguem o padrão JSON estruturado:

### 4.1. Assinar Canal (`subscribe`)
Enviado pelo cliente para começar a escutar eventos de um tópico ou tabela:
```json
{
  "action": "subscribe",
  "channel": "db:pedidos"
}
```
O backend adiciona a tag `"channel:db:pedidos"` ao socket do cliente e responde confirmando a inscrição.

### 4.2. Cancelar Assinatura (`unsubscribe`)
Enviado pelo cliente ao sair de uma tela ou fechar um componente:
```json
{
  "action": "unsubscribe",
  "channel": "db:pedidos"
}
```
O backend remove a tag daquele socket.

### 4.3. Disparo de Broadcast (`broadcast`)
Enviado por um cliente (ou via HTTP pela API) para transmitir dados aos demais ouvintes daquele canal:
```json
{
  "action": "broadcast",
  "channel": "chat:suporte",
  "event": "message.new",
  "payload": {
    "text": "Olá, preciso de ajuda com meu pedido",
    "sender": "Cliente A"
  }
}
```

### 4.4. Evento Recebido pelo Cliente
O cliente recebe a mensagem identificada pelo canal de origem:
```json
{
  "id": "msg_01J9...",
  "channel": "db:pedidos",
  "event": "INSERT",
  "payload": {
    "id": "ped_99",
    "valor": 150.00,
    "status": "pago"
  },
  "timestamp": 1730376000000
}
```

---

## 5. Rastreamento de Presença (Presence API)

O Hub Durable Object gerencia o estado de usuários online por sala/canal:
* **Entrada na Sala:** Quando um usuário conecta ou assina um canal, emite o evento `presence.join` para todos os ouvintes.
* **Desconexão:** Ao fechar a aba ou perder a conexão de rede, o método `webSocketClose` é acionado pelo runtime da Cloudflare, disparando `presence.leave`.
* **Consulta HTTP:** A rota `GET /api/v1/realtime/:channel/presence` retorna a contagem instantânea e a lista de membros ativos na sala.

---

## 6. Integração Nativa com o Banco de Dados (CDC)

Sempre que a Data API (`/api/v1/db/:table`) processa uma mutação (`INSERT`, `UPDATE`, `DELETE`), ela injeta automaticamente uma mensagem no Hub Durable Object:
* **Canal:** `db:<table_name>` (ex: `db:produtos`, `db:comentarios`).
* **Evento:** `INSERT`, `UPDATE` ou `DELETE`.
* **Payload:** O registro criado ou atualizado.

Clientes que assinaram `db:produtos` recebem o estado atualizado em menos de 10 milissegundos sem precisar fazer polling no banco.
