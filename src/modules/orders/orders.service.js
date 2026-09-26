const prisma = require("../../lib/prisma");

// Lista dos status válidos aceites nos filtros da API.
const allowedStatuses = ["created", "paid", "shipped", "delivered", "canceled"];

// Métodos de pagamento fixos que sempre aparecem no financial-summary.
const paymentMethods = ["pix", "credit_card", "boleto"];

// Status que não entram no cálculo de receita (pedidos cancelados não geram valor).
const excludedFromRevenue = new Set(["canceled"]);

// Converte qualquer valor para número. Se vier nulo ou indefinido, retorna 0.
function toNumber(value) {
  return Number(value || 0);
}

// Monta o objeto de um item conforme o contrato do payload do professor.
// Calcula o total do item dinamicamente (unit_price * quantity).
// Nunca usa um valor de total gravado no banco — sempre recalcula.
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

// Monta o objeto completo de um pedido conforme o contrato do payload do professor.
// O total do pedido é calculado somando o total de cada item — nunca vem do banco.
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

// Define quais tabelas relacionadas carregar junto com cada pedido.
// Sem isso o Prisma traria só o pedido, sem cliente, itens, pagamento e envio.
const orderInclude = {
  customer: true,
  items: { include: { product: true }, orderBy: { id: "asc" } },
  payment: true,
  shipment: true,
};

// Converte um valor de query string para inteiro positivo.
// Se vier inválido, usa o valor padrão (fallback). Respeita um limite máximo.
function parsePositiveInteger(value, fallback, maximum) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, maximum);
}

// Converte um valor para BigInt (número inteiro grande).
// Usado para ids de cliente e seller que são números muito grandes.
// Lança erro 400 se o valor não puder ser convertido.
function parseBigInt(value, name) {
  try {
    return BigInt(value);
  } catch (_error) {
    const error = new Error(`${name} must be an integer`);
    error.statusCode = 400;
    throw error;
  }
}

// Converte uma string para objeto Date.
// Lança erro 400 se a data for inválida.
function parseDate(value, name) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    const error = new Error(`${name} must be a valid date`);
    error.statusCode = 400;
    throw error;
  }
  return date;
}

// Verifica se o valor é uma data no formato YYYY-MM-DD (sem hora).
function isDateOnly(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "").trim());
}

// Converte a data de início para meia-noite UTC (00:00:00).
// Garante que o primeiro dia do intervalo entra completo no filtro.
function parseStartDate(value, name) {
  if (isDateOnly(value)) return new Date(`${value.trim()}T00:00:00.000Z`);
  return parseDate(value, name);
}

// Converte a data de fim para 23:59:59 UTC.
// Garante que o último dia do intervalo entra completo no filtro.
function parseEndDate(value, name) {
  if (isDateOnly(value)) return new Date(`${value.trim()}T23:59:59.999Z`);
  return parseDate(value, name);
}

// Normaliza o método de pagamento para um dos três valores fixos aceites.
// Trata variações como "credit card", "credit_card" e "creditcard" como a mesma coisa.
// Retorna null se não reconhecer o método.
function normalizePaymentMethod(method) {
  const normalized = String(method || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ");
  if (normalized === "pix") return "pix";
  if (normalized === "credit card" || normalized === "creditcard") return "credit_card";
  if (normalized === "boleto") return "boleto";
  return null;
}

// Monta o objeto de filtros (WHERE) para as queries no banco.
// Aceita filtros por cliente, seller, produto, status e intervalo de datas.
// O parâmetro dateField define qual campo de data usar (created_at ou indexed_at).
function buildWhere(query, dateField = "createdAt") {
  const where = {};
  const customerId = query["customer.id"];
  const productId = query["product.id"];
  const sellerId = query["seller.id"];

  if (customerId) where.customerId = parseBigInt(customerId, "customer.id");
  if (sellerId) where.sellerId = parseBigInt(sellerId, "seller.id");

  // items.some significa: "pedidos que tenham pelo menos um item com esse produto"
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
    where[dateField] = {};
    if (query.start_date) where[dateField].gte = parseStartDate(query.start_date, "start_date");
    if (query.end_date) where[dateField].lte = parseEndDate(query.end_date, "end_date");
  }
  return where;
}

// Retorna a lista de pedidos com paginação e ordenação por data.
// Suporta todos os filtros de buildWhere via query string.
// Responde com os dados e um objeto pagination com total de registros.
async function listOrders(query) {
  const page = parsePositiveInteger(query.page, 1, 1000000);
  const limit = parsePositiveInteger(query.limit, 20, 100);
  const where = buildWhere(query);
  const sortOrder = query.order === "asc" ? "asc" : "desc";

  // Executa a busca e a contagem ao mesmo tempo numa única ida ao banco.
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

// Retorna um pedido específico pelo UUID de negócio (ex: ORD-2025-0001).
// Retorna 404 se o pedido não existir.
async function getOrder(uuid) {
  const order = await prisma.order.findUnique({ where: { orderUuid: uuid }, include: orderInclude });
  if (!order) {
    const error = new Error("Order not found");
    error.statusCode = 404;
    throw error;
  }
  return serializeOrder(order);
}

// Retorna apenas o array de itens de um pedido, sem os outros dados do pedido.
// Cada item já vem com o total calculado (unit_price * quantity).
async function getOrderItems(uuid) {
  const order = await prisma.order.findUnique({
    where: { orderUuid: uuid },
    include: { items: { include: { product: true }, orderBy: { id: "asc" } } },
  });
  if (!order) {
    const error = new Error("Order not found");
    error.statusCode = 404;
    throw error;
  }
  return (order.items || []).map(serializeItem);
}

// Tabela de mapeamento dos status internos para as chaves do financial-summary.
// O banco usa created/paid; o PDF do professor usa pending/approved no JSON de exemplo.
const summaryStatusKey = {
  created: "pending",
  paid: "approved",
  shipped: "shipped",
  delivered: "delivered",
  canceled: "canceled",
};

// Calcula o resumo financeiro de um período filtrado por seller e intervalo de datas.
// Usa indexed_at (hora que o pedido entrou no banco) como campo de data.
// Pedidos cancelados contam no by_status mas não entram na receita nem na média.
// Os três métodos de pagamento sempre aparecem no response, mesmo que zerados.
async function financialSummary(query) {
  const where = buildWhere(query, "indexedAt");
  const orders = await prisma.order.findMany({
    where,
    include: { items: true, payment: true },
  });

  const summary = {
    total_orders: 0,
    total_revenue: 0,
    average_order_value: 0,
    // Chaves conforme o JSON de exemplo do PDF do professor
    by_status: { pending: 0, approved: 0, shipped: 0, delivered: 0 },
    // Sempre retorna as 3 chaves, mesmo que não haja pedidos com aquele método
    by_payment_method: Object.fromEntries(
      paymentMethods.map((method) => [method, { count: 0, total: 0 }]),
    ),
  };

  for (const order of orders) {
    // Incrementa o contador do status correspondente
    const statusKey = summaryStatusKey[order.status];
    if (statusKey && summary.by_status[statusKey] !== undefined) {
      summary.by_status[statusKey] += 1;
    }

    // Pedidos cancelados não entram na receita nem na contagem de pagamentos
    if (excludedFromRevenue.has(order.status)) continue;

    // Recalcula o total do pedido somando os itens (não confia em valor gravado)
    const total = order.items.reduce(
      (sum, item) => sum + toNumber(item.unitPrice) * item.quantity,
      0,
    );

    summary.total_orders += 1;
    summary.total_revenue += total;

    const method = order.payment ? normalizePaymentMethod(order.payment.method) : null;
    if (method) {
      summary.by_payment_method[method].count += 1;
      summary.by_payment_method[method].total += total;
    }
  }

  // Média calculada só depois de ter o total e a contagem finais
  summary.average_order_value = summary.total_orders
    ? summary.total_revenue / summary.total_orders
    : 0;

  return summary;
}

module.exports = { allowedStatuses, buildWhere, listOrders, getOrder, getOrderItems, financialSummary };
