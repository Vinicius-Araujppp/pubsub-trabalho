-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('pending', 'approved', 'shipped', 'delivered');

-- CreateTable
CREATE TABLE "cliente" (
    "id" BIGINT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "document" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pedido" (
    "id" UUID NOT NULL,
    "order_uuid" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,
    "indexed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "channel" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL,
    "customer_id" BIGINT NOT NULL,
    "seller_id" BIGINT NOT NULL,
    "seller_name" TEXT NOT NULL,
    "seller_city" TEXT NOT NULL,
    "seller_state" TEXT NOT NULL,
    "metadata" JSONB,

    CONSTRAINT "pedido_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "produto" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "category_name" TEXT NOT NULL,
    "sub_category_id" TEXT NOT NULL,
    "sub_category_name" TEXT NOT NULL,

    CONSTRAINT "produto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_pedido" (
    "id" INTEGER NOT NULL,
    "order_id" UUID NOT NULL,
    "product_id" TEXT NOT NULL,
    "unit_price" DECIMAL(14,2) NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "item_pedido_pkey" PRIMARY KEY ("order_id","id")
);

-- CreateTable
CREATE TABLE "pagamento" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "method" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "transaction_id" TEXT NOT NULL,

    CONSTRAINT "pagamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "envio" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "carrier" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "tracking_code" TEXT NOT NULL,

    CONSTRAINT "envio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pedido_order_uuid_key" ON "pedido"("order_uuid");

-- CreateIndex
CREATE INDEX "pedido_customer_id_idx" ON "pedido"("customer_id");

-- CreateIndex
CREATE INDEX "pedido_seller_id_idx" ON "pedido"("seller_id");

-- CreateIndex
CREATE INDEX "pedido_status_idx" ON "pedido"("status");

-- CreateIndex
CREATE INDEX "pedido_created_at_idx" ON "pedido"("created_at");

-- CreateIndex
CREATE INDEX "item_pedido_product_id_idx" ON "item_pedido"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "pagamento_order_id_key" ON "pagamento"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "envio_order_id_key" ON "envio"("order_id");

-- AddForeignKey
ALTER TABLE "pedido" ADD CONSTRAINT "pedido_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_pedido" ADD CONSTRAINT "item_pedido_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "pedido"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_pedido" ADD CONSTRAINT "item_pedido_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagamento" ADD CONSTRAINT "pagamento_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "pedido"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "envio" ADD CONSTRAINT "envio_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "pedido"("id") ON DELETE CASCADE ON UPDATE CASCADE;
