require("dotenv").config();

const prisma = require("../lib/prisma");
const { pubsub, subscriptionName } = require("../lib/pubsub");

const subscription = pubsub.subscription(subscriptionName);

function required(value, name) {
  if (value === undefined || value === null) throw new Error(`${name} is required`);
  return value;
}

function first(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

const statusAliases = {
  created: "created",
  paid: "paid",
  shipped: "shipped",
  delivered: "delivered",
  canceled: "canceled",
  cancelled: "canceled",
  pending: "created",
  approved: "paid",
  separated: "paid",
};

function mapOrderStatus(status) {
  const key = String(status || "").trim().toLowerCase();
  const mapped = statusAliases[key];
  if (!mapped) throw new Error(`Invalid status: ${status}`);
  return mapped;
}

function isTransientError(error) {
  const code = error.code || "";
  if (["P1001", "P1002", "P1008", "P1017", "P2024", "P2034"].includes(code)) return true;
  const message = String(error.message || "").toLowerCase();
  return message.includes("can't reach database server") || message.includes("connection refused");
}

async function persistOrder(payload) {
  const orderUuid = required(payload.uuid, "uuid");
  const customer = required(payload.customer, "customer");
  const seller = required(payload.seller, "seller");
  const items = required(payload.items, "items");
  const status = mapOrderStatus(required(payload.status, "status"));
  const createdAtValue = required(first(payload.created_at, payload.createdAt), "created_at");

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
          subCategoryId: item.category?.sub_category?.id || item.category?.subCategory?.id || "unknown",
          subCategoryName: item.category?.sub_category?.name || item.category?.subCategory?.name || "unknown",
        },
        create: {
          id: product.id,
          title: product.title,
          categoryId: item.category?.id || "unknown",
          categoryName: item.category?.name || "unknown",
          subCategoryId: item.category?.sub_category?.id || item.category?.subCategory?.id || "unknown",
          subCategoryName: item.category?.sub_category?.name || item.category?.subCategory?.name || "unknown",
        },
      });
    }

    await transaction.order.create({
      data: {
        orderUuid,
        createdAt: new Date(createdAtValue),
        channel: payload.channel || "unknown",
        status,
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
            unitPrice: first(item.unit_price, item.unitPrice),
            quantity: item.quantity,
          })),
        },
        payment: payload.payment
          ? { create: {
              method: payload.payment.method || "unknown",
              status: payload.payment.status || "unknown",
              transactionId: first(
                payload.payment.transaction_id,
                payload.payment.transactionId,
              ) || "unknown",
            } }
          : undefined,
        shipment: payload.shipment
          ? { create: {
              carrier: payload.shipment.carrier || "unknown",
              service: payload.shipment.service || "unknown",
              status: payload.shipment.status || "unknown",
              trackingCode: first(
                payload.shipment.tracking_code,
                payload.shipment.trackingCode,
              ) || "unknown",
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
    if (isTransientError(error)) {
      message.nack();
      return;
    }
    message.ack();
  }
});

subscription.on("error", (error) => console.error("Subscription error:", error.message));

console.log(`Waiting for orders on ${subscriptionName}...`);

module.exports = { persistOrder, mapOrderStatus };
