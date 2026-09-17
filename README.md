# Pub/Sub JavaScript

## API + PostgreSQL

A API usa Express, Prisma e PostgreSQL. O Postgres do Docker usa a porta
**5433** por padrão (para não colidir com um Postgres local na 5432). Inicie o
banco e aplique as migrations com:

```powershell
npm run db:up
npx prisma migrate deploy
npm run db:seed
npm start
```

Verificação de saúde: `GET http://localhost:3000/health`

Endpoints disponíveis:

- `GET /orders?page=1&limit=20&order=desc`
- `GET /orders?customer.id=7788&status=paid&seller.id=55`
- `GET /orders?product.id=abc-1344`
- `GET /orders/ORD-2025-0001`
- `GET /orders/ORD-2025-0001/items`
- `GET /orders/financial-summary?seller.id=55&start_date=2025-01-01&end_date=2025-12-31`

Os totais dos pedidos e dos itens são calculados com base em
`unit_price * quantity`. Pedidos `canceled` não entram em `total_orders`,
`total_revenue`, ticket médio nem `by_payment_method`; entram só em
`by_status.canceled`.

Os status aceitos são `created`, `paid`, `shipped`, `delivered` e `canceled`.
Em `financial-summary`, `by_payment_method` usa as chaves `pix`, `credit_card` e
`boleto`.

## Configuração do Google Cloud

Use o projeto, o tópico e a subscription já criados pelo professor:

- Project: `serjava-demo`
- Tópico: `aula-pub` (`projects/serjava-demo/topics/aula-pub`)
- Subscription: `grupo-g` (`projects/serjava-demo/subscriptions/grupo-g`)

Copie `.env.example` para `.env` e defina `GOOGLE_APPLICATION_CREDENTIALS`
apontando para o JSON da conta de serviço (arquivo fora do Git).

## Execução

Abra dois terminais neste diretório. A API (`npm start`) e o consumer podem
rodar juntos. Inicie o subscriber:

```powershell
npm run subscribe
```

O worker lê `grupo-g` (pedidos do sistema de vendas da aula). Publicar no
tópico (`npm run publish` / `npm run publish:sample`) só funciona se a conta
de serviço tiver permissão de publisher em `aula-pub`. Sem isso, a demo da API
usa o seed (`ORD-2025-0001`).

O consumer persiste os pedidos de forma transacional no PostgreSQL e confirma
uma mensagem do Pub/Sub depois que a transação é efetivada. Payload inválido é
confirmado (ack) para não reentregar em loop; falha de banco dá nack.

O cliente Pub/Sub usa `GOOGLE_CLOUD_PROJECT`, `PUBSUB_TOPIC` (`aula-pub`),
`PUBSUB_SUBSCRIPTION` (`grupo-g`) e exige `GOOGLE_APPLICATION_CREDENTIALS`.
