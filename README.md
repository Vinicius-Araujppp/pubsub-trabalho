# Pub/Sub JavaScript

## API + PostgreSQL

The API uses Express, Prisma and PostgreSQL. Start the database and apply the
schema with:

```powershell
npm run db:up
npx prisma migrate dev --name init
npm run db:seed
npm start
```

Health check: `GET http://localhost:3000/health`

Available endpoints:

- `GET /orders?page=1&limit=20&order=desc`
- `GET /orders?customer.id=7788&status=paid&seller.id=55`
- `GET /orders?product.id=abc-1344`
- `GET /orders/ORD-2025-0001`
- `GET /orders/ORD-2025-0001/items`
- `GET /orders/financial-summary?seller.id=55&start_date=2025-01-01&end_date=2025-12-31`

Order totals and item totals are calculated from `unit_price * quantity`.
Canceled orders are excluded from financial revenue. The accepted statuses are
`created`, `paid`, `shipped`, `delivered` and `canceled`.

## Google Cloud setup

```powershell
gcloud config set project serjava-demo
gcloud services enable pubsub.googleapis.com
gcloud pubsub topics create eventos
gcloud pubsub subscriptions create eventos-consumidor --topic=eventos
```

Authenticate without storing a key in this project:

```powershell
gcloud auth application-default login
```

For a service account, set `GOOGLE_APPLICATION_CREDENTIALS` to a new rotated
key file kept outside this repository.

## Run

Open two terminals in this directory. Start the subscriber first:

```powershell
npm run subscribe
```

Then publish a message:

```powershell
npm run publish
```

The consumer persists orders transactionally in PostgreSQL and acknowledges a
Pub/Sub message only after the transaction commits.

Topic and subscription names can be changed with `PUBSUB_TOPIC` and
`PUBSUB_SUBSCRIPTION`.