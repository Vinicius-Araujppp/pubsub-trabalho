require("dotenv").config();

const { PubSub } = require("@google-cloud/pubsub");
const prisma = require("../lib/prisma");

const pubsub = new PubSub({
  projectId: process.env.GOOGLE_CLOUD_PROJECT || "serjava-demo",
});
const subscriptionName = process.env.PUBSUB_SUBSCRIPTION || "eventos-consumidor";
const subscription = pubsub.subscription(subscriptionName);

function required(value, name) {
  if (value === undefined || value === null) throw new Error(`${name} is required`);
  return value;
}

async function persistOrder(payload) {
  const orderUuid = required(payload.uuid, "uuid");
  const customer = required(payload.customer, "customer");
  const seller = required(payload.seller, "seller");
  const items = required(payload.items, "items");

  await prisma.$transaction(async (transaction) => {
    const existing = await transaction.order.findUnique({ where: { orderUuid } });
    if (existing) return;

    await transaction.customer.upsert({
      where: { id: BigInt(customer.id) },
      update: { name: customer.name, email: customer.email, document: customer.document },
      create: {
        id: BigInt(customer.id),
        name: customer.name,
        email: customer.email,
        document: customer.document,
      },
    });

    for (const item of items) {
      const product = required(item.product, "item.product");
      await transaction.product.upsert({
        where: { id: product.id },
        update: {
          title: product.title,
          categoryId: item.category?.id || "unknown",
          categoryName: item.category?.name || "unknown",
          subCategoryId: item.category?.sub_category?.id || "unknown",
          subCategoryName: item.category?.sub_category?.name || "unknown",
        },
        create: {
          id: product.id,
          title: product.title,
          categoryId: item.category?.id || "unknown",
          categoryName: item.category?.name || "unknown",
          subCategoryId: item.category?.sub_category?.id || "unknown",
          subCategoryName: item.category?.sub_category?.name || "unknown",
        },
      });
    }

    await transaction.order.create({
      data: {
        orderUuid,
        createdAt: new Date(required(payload.created_at, "created_at")),
        channel: payload.channel || "unknown",
        status: payload.status,
        customerId: BigInt(customer.id),
        sellerId: BigInt(seller.id),
        sellerName: seller.name,
        sellerCity: seller.city,
        sellerState: seller.state,
        metadata: payload.metadata || {},
        items: {
          create: items.map((item) => ({
            id: item.id,
            productId: item.product.id,
            unitPrice: item.unit_price,
            quantity: item.quantity,
          })),
        },
        payment: payload.payment
          ? { create: {
              method: payload.payment.method,
              status: payload.payment.status,
              transactionId: payload.payment.transaction_id,
            } }
          : undefined,
        shipment: payload.shipment
          ? { create: {
              carrier: payload.shipment.carrier,
              service: payload.shipment.service,
              status: payload.shipment.status,
              trackingCode: payload.shipment.tracking_code,
            } }
          : undefined,
      },
    });
  });
}

subscription.on("message", async (message) => {
  try {
    await persistOrder(JSON.parse(message.data.toString()));
    message.ack();
  } catch (error) {
    console.error("Could not persist order:", error.message);
    message.nack();
  }
});

subscription.on("error", (error) => console.error("Subscription error:", error.message));

console.log(`Waiting for orders on ${subscriptionName}...`);

module.exports = { persistOrder };