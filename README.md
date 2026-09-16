# Pub/Sub JavaScript

## Documentação

- [DER do Banco de Dados](docs/DER.md) - diagrama, cardinalidades, dicionário
  de dados e decisões de modelagem.

## API + PostgreSQL

A API usa Express, Prisma e PostgreSQL. Inicie o banco de dados e aplique o
schema com:

```powershell
npm run db:up
npx prisma migrate dev --name init
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
`unit_price * quantity`. Pedidos cancelados não entram na receita financeira.
Os status aceitos são `created`, `paid`, `shipped`, `delivered` e `canceled`.

## Configuração do Google Cloud

```powershell
gcloud config set project serjava-demo
gcloud services enable pubsub.googleapis.com
gcloud pubsub topics create eventos
gcloud pubsub subscriptions create eventos-consumidor --topic=eventos
```

Autentique-se sem armazenar uma chave neste projeto:

```powershell
gcloud auth application-default login
```

Para uma conta de serviço, defina `GOOGLE_APPLICATION_CREDENTIALS` apontando
para um novo arquivo de chave rotacionado, mantido fora deste repositório.

## Execução

Abra dois terminais neste diretório. Inicie o subscriber primeiro:

```powershell
npm run subscribe
```

Depois, publique pedidos no tópico:

```powershell
npm run publish              # 1 pedido aleatório
npm run publish:sample       # o pedido ORD-2025-0001 exato do enunciado
npm run publish:mass         # 50 pedidos
npm run publish -- --count 200
```

O `publisher.js` gera pedidos no mesmo contrato de payload que a API devolve:
4 clientes, 3 sellers, 6 produtos com categoria e subcategoria fixas, 1 a 3
itens por pedido, os três métodos de pagamento (`pix`, `credit_card`,
`boleto`) e datas espalhadas nos últimos 90 dias — o suficiente para
demonstrar os filtros, a ordenação e o `/orders/financial-summary` com massa
real. Cada execução usa um prefixo próprio de uuid, então rodar várias vezes
nunca colide com o que já está no banco.

`--sample` publica o payload literal do enunciado, útil para mostrar que o
contrato bate campo a campo.

O consumer persiste os pedidos de forma transacional no PostgreSQL e confirma
uma mensagem do Pub/Sub somente depois que a transação é efetivada.

Os nomes do tópico e da assinatura podem ser alterados com `PUBSUB_TOPIC` e
`PUBSUB_SUBSCRIPTION`.