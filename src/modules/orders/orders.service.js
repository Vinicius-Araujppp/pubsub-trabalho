const prisma = require("../../lib/prisma");

const allowedStatuses = ["created", "paid", "shipped", "delivered", "canceled"];

function toNumber(value) {
  return Number(value || 0);
}

function serializeItem(item) {
  const unitPrice = toNumber(item.unitPrice);
  return {
    id: item.id,
    product: {
      id: item.product.id,
      title: item.product.title,
    },
    unit_price: unitPrice,
    quantity: item.quantity,
    category: {
      id: item.product.categoryId,
      name: item.product.categoryName,
      sub_category: {
        id: item.product.subCategoryId,
        name: item.product.subCategoryName,
      },
    },
    total: unitPrice * item.quantity,
  };
}

function serializeOrder(order) {
  const items = (order.items || []).map(serializeItem);
  return {
    uuid: order.orderUuid,
    created_at: order.createdAt.toISOString(),
    channel: order.channel,
    total: items.reduce((sum, item) => sum + item.total, 0),
    status: order.status,
    customer: {
      id: order.customer.id.toString(),
      name: order.customer.name,
      email: order.customer.email,
      document: order.customer.document,
    },
    seller: {
      id: order.sellerId.toString(),
      name: order.sellerName,
      city: order.sellerCity,
      state: order.sellerState,
    },
    items,
    shipment: order.shipment
      ? {
          carrier: order.shipment.carrier,
          service: order.shipment.service,
          status: order.shipment.status,
          tracking_code: order.shipment.trackingCode,
        }
      : null,
    payment: order.payment
      ? {
          method: order.payment.method,
          status: order.payment.status,
          transaction_id: order.payment.transactionId,
        }
      : null,
    metadata: order.metadata || {},
  };
}

const orderInclude = {
  customer: true,
  items: { include: { product: true }, orderBy: { id: "asc" } },
  payment: true,
  shipment: true,
};

function parsePositiveInteger(value, fallback, maximum) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, maximum);
}

function parseBigInt(value, name) {
  try {
    return BigInt(value);
  } catch (_error) {
    const error = new Error(`${name} must be an integer`);
    error.statusCode = 400;
    throw error;
  }
}

function parseDate(value, name) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    const error = new Error(`${name} must be a valid date`);
    error.statusCode = 400;
    throw error;
  }
  return date;
}

function buildWhere(query) {
  const where = {};
  const customerId = query["customer.id"];
  const productId = query["product.id"];
  const sellerId = query["seller.id"];

  if (customerId) where.customerId = parseBigInt(customerId, "customer.id");
  if (sellerId) where.sellerId = parseBigInt(sellerId, "seller.id");
  if (productId) where.items = { some: { productId } };
  if (query.status) {
    if (!allowedStatuses.includes(query.status)) {
      const error = new Error(`Invalid status. Use: ${allowedStatuses.join(", ")}`);
      error.statusCode = 400;
      throw error;
    }
    where.status = query.status;
  }
  if (query.start_date || query.end_date) {
    where.createdAt = {};
    if (query.start_date) where.createdAt.gte = parseDate(query.start_date, "start_date");
    if (query.end_date) where.createdAt.lte = parseDate(query.end_date, "end_date");
  }
  return where;
}

async function listOrders(query) {
  const page = parsePositiveInteger(query.page, 1, 1000000);
  const limit = parsePositiveInteger(query.limit, 20, 100);
  const where = buildWhere(query);
  const sortOrder = query.order === "asc" ? "asc" : "desc";
  const [orders, total] = await prisma.$transaction([
    prisma.order.findMany({
      where,
      include: orderInclude,
      orderBy: { createdAt: sortOrder },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.order.count({ where }),
  ]);

  return {
    data: orders.map(serializeOrder),
    pagination: { page, limit, total, total_pages: Math.ceil(total / limit) },
  };
}

async function getOrder(uuid) {
  const order = await prisma.order.findUnique({ where: { orderUuid: uuid }, include: orderInclude });
  if (!order) {
    const error = new Error("Order not found");
    error.statusCode = 404;
    throw error;
  }
  return serializeOrder(order);
}

async function getOrderItems(uuid) {
  const order = await getOrder(uuid);
  return { uuid: order.uuid, items: order.items };
}

async function financialSummary(query) {
  const where = buildWhere(query);
  const orders = await prisma.order.findMany({
    where,
    include: { items: true, payment: true },
  });
  const summary = {
    total_orders: orders.length,
    total_revenue: 0,
    average_order_value: 0,
    by_status: { created: 0, paid: 0, shipped: 0, delivered: 0, canceled: 0 },
    by_payment_method: {},
  };

  for (const order of orders) {
    summary.by_status[order.status] += 1;
    const total = order.items.reduce(
      (sum, item) => sum + toNumber(item.unitPrice) * item.quantity,
      0,
    );
    if (order.status !== "canceled") summary.total_revenue += total;
    if (order.payment) {
      const method = order.payment.method;
      summary.by_payment_method[method] ||= { count: 0, total: 0 };
      summary.by_payment_method[method].count += 1;
      summary.by_payment_method[method].total += total;
    }
  }
  summary.average_order_value = summary.total_orders
    ? summary.total_revenue / summary.total_orders
    : 0;
  return summary;
}

module.exports = { allowedStatuses, buildWhere, listOrders, getOrder, getOrderItems, financialSummary };