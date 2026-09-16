require("dotenv").config();

const { PubSub } = require("@google-cloud/pubsub");

const projectId = process.env.GOOGLE_CLOUD_PROJECT || "serjava-demo";
const topicName = process.env.PUBSUB_TOPIC || "eventos";
const pubsub = new PubSub({ projectId });

// O PDF também lista `canceled`, mas o consumer atual descarta esses pedidos
// em vez de persistir, então eles ficam de fora da massa gerada.
const statuses = ["created", "paid", "shipped", "delivered"];
const paymentMethods = ["pix", "credit_card", "boleto"];
const channels = ["mobile_app", "web", "marketplace"];

const customers = [
  { id: 7788, name: "Maria Oliveira", email: "maria@email.com", document: "987.654.321-00" },
  { id: 49494, name: "João Pereira", email: "joao.pereira@email.com", document: "123.456.789-09" },
  { id: 51203, name: "Ana Souza", email: "ana.souza@email.com", document: "456.789.123-45" },
  { id: 60871, name: "Carlos Lima", email: "carlos.lima@email.com", document: "321.654.987-11" },
];

const sellers = [
  { id: 55, name: "Tech Store", city: "São Paulo", state: "SP" },
  { id: 72, name: "Casa & Cia", city: "Campinas", state: "SP" },
  { id: 91, name: "Mundo Fashion", city: "Belo Horizonte", state: "MG" },
];

// A categoria fica gravada no produto, então cada produto tem sempre a mesma.
const catalog = [
  {
    id: "abc-1344",
    title: "televisao bonita",
    unit_price: 2500.0,
    category: { id: "ELEC", name: "Eletrônicos", sub_category: { id: "PHONE", name: "Smartphones" } },
  },
  {
    id: "elec-2201",
    title: "Notebook Ultra 14",
    unit_price: 4890.9,
    category: { id: "ELEC", name: "Eletrônicos", sub_category: { id: "NOTE", name: "Notebooks" } },
  },
  {
    id: "elec-3310",
    title: "Fone Bluetooth Pro",
    unit_price: 349.5,
    category: { id: "ELEC", name: "Eletrônicos", sub_category: { id: "AUDIO", name: "Áudio" } },
  },
  {
    id: "casa-1180",
    title: "Cafeteira Expresso",
    unit_price: 799.0,
    category: { id: "HOME", name: "Casa e Cozinha", sub_category: { id: "KITCH", name: "Eletroportáteis" } },
  },
  {
    id: "casa-2075",
    title: "Jogo de Panelas Antiaderente",
    unit_price: 459.9,
    category: { id: "HOME", name: "Casa e Cozinha", sub_category: { id: "COOK", name: "Panelas" } },
  },
  {
    id: "moda-5512",
    title: "Tênis de Corrida Leve",
    unit_price: 289.9,
    category: { id: "FASH", name: "Moda", sub_category: { id: "SHOE", name: "Calçados" } },
  },
];

const carriers = [
  { carrier: "Correios", service: "SEDEX" },
  { carrier: "Jadlog", service: "Package" },
  { carrier: "Loggi", service: "Express" },
];

const shipmentStatusByOrder = {
  created: "pending",
  paid: "processing",
  shipped: "shipped",
  delivered: "delivered",
};

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(list) {
  return list[randomInt(0, list.length - 1)];
}

function pickMany(list, quantity) {
  const pool = [...list];
  const chosen = [];
  for (let index = 0; index < quantity && pool.length > 0; index += 1) {
    chosen.push(...pool.splice(randomInt(0, pool.length - 1), 1));
  }
  return chosen;
}

function randomDateWithinDays(days) {
  const now = Date.now();
  return new Date(now - randomInt(0, days) * 86400000 - randomInt(0, 86399) * 1000);
}

function trackingCode() {
  return `BR${randomInt(100000000, 999999999)}`;
}

function buildOrder(prefix, sequence) {
  const status = pick(statuses);
  const products = pickMany(catalog, randomInt(1, 3));
  const items = products.map((product, index) => ({
    id: index + 1,
    product: { id: product.id, title: product.title },
    unit_price: product.unit_price,
    quantity: randomInt(1, 4),
    category: product.category,
  }));

  for (const item of items) {
    item.total = Number((item.unit_price * item.quantity).toFixed(2));
  }

  const customer = pick(customers);
  const seller = pick(sellers);
  const shipping = pick(carriers);
  const channel = pick(channels);

  return {
    uuid: `${prefix}-${String(sequence).padStart(4, "0")}`,
    created_at: randomDateWithinDays(90).toISOString(),
    channel,
    total: Number(items.reduce((sum, item) => sum + item.total, 0).toFixed(2)),
    status,
    customer,
    seller,
    items,
    shipment: {
      carrier: shipping.carrier,
      service: shipping.service,
      status: shipmentStatusByOrder[status],
      tracking_code: trackingCode(),
    },
    payment: {
      method: pick(paymentMethods),
      status: status === "created" ? "pending" : "approved",
      transaction_id: `pay_${randomInt(100000000, 999999999)}`,
    },
    metadata: {
      source: channel === "mobile_app" ? "app" : "web",
      user_agent: "Mozilla/5.0 (compatible; MarketplaceBot/1.0)",
      ip_address: `10.0.${randomInt(0, 255)}.${randomInt(1, 254)}`,
    },
  };
}

// Pedido literal do enunciado, útil para demonstrar o contrato do payload.
function sampleOrder() {
  return {
    uuid: "ORD-2025-0001",
    created_at: "2025-10-01T10:15:00Z",
    channel: "mobile_app",
    total: 5000.0,
    status: "paid",
    customer: {
      id: 7788,
      name: "Maria Oliveira",
      email: "maria@email.com",
      document: "987.654.321-00",
    },
    seller: { id: 55, name: "Tech Store", city: "São Paulo", state: "SP" },
    items: [
      {
        id: 1,
        product: { id: "abc-1344", title: "televisao bonita" },
        unit_price: 2500.0,
        quantity: 2,
        category: {
          id: "ELEC",
          name: "Eletrônicos",
          sub_category: { id: "PHONE", name: "Smartphones" },
        },
        total: 5000.0,
      },
    ],
    shipment: {
      carrier: "Correios",
      service: "SEDEX",
      status: "shipped",
      tracking_code: "BR123456789",
    },
    payment: { method: "pix", status: "approved", transaction_id: "pay_987654321" },
    metadata: { source: "app", user_agent: "Mozilla/5.0...", ip_address: "10.0.0.1" },
  };
}

function parseArgs(argv) {
  const options = { count: 1, sample: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--sample") {
      options.sample = true;
    } else if (arg === "--count" || arg === "-c") {
      const parsed = Number.parseInt(argv[index + 1], 10);
      if (!Number.isInteger(parsed) || parsed < 1) {
        throw new Error("--count must be a positive integer");
      }
      options.count = parsed;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}\nUso: node publisher.js [--count N] [--sample]`);
    }
  }
  return options;
}

// Prefixo por execução para nunca repetir um uuid já persistido.
function runPrefix() {
  const stamp = Date.now().toString(36).slice(-4).toUpperCase();
  return `ORD-${new Date().getFullYear()}-${stamp}`;
}

async function publishOrder(topic, order) {
  const messageId = await topic.publishMessage({
    data: Buffer.from(JSON.stringify(order)),
    attributes: { type: "pedido.criado", uuid: order.uuid },
  });
  return { uuid: order.uuid, status: order.status, total: order.total, messageId };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const topic = pubsub.topic(topicName);
  const prefix = runPrefix();
  const orders = options.sample
    ? [sampleOrder()]
    : Array.from({ length: options.count }, (_value, index) => buildOrder(prefix, index + 1));

  const results = await Promise.all(orders.map((order) => publishOrder(topic, order)));

  if (results.length <= 20) {
    for (const result of results) {
      const total = result.total.toFixed(2).padStart(10);
      console.log(`${result.uuid} | ${result.status.padEnd(9)} | R$ ${total} | msg ${result.messageId}`);
    }
  }
  const revenue = results.reduce((sum, result) => sum + result.total, 0);
  console.log(`\n${results.length} pedido(s) publicado(s) em "${topicName}" | total R$ ${revenue.toFixed(2)}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { buildOrder, sampleOrder, parseArgs };
