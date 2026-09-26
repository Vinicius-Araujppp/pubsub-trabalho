require("dotenv").config();

const prisma = require("../lib/prisma");
const { pubsub, subscriptionName } = require("../lib/pubsub");

const subscription = pubsub.subscription(subscriptionName);

// Garante que um campo obrigatório existe no payload.
// Se vier nulo ou indefinido, lança um erro com o nome do campo.
function required(value, name) {
  if (value === undefined || value === null) throw new Error(`${name} is required`);
  return value;
}

// Retorna o primeiro valor que não seja nulo, indefinido ou string vazia.
// Usado para aceitar campos que podem ter nomes diferentes no payload
// (ex: unit_price ou unitPrice).
function first(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

// Tabela de equivalência de status.
// O sistema de vendas pode mandar nomes diferentes para o mesmo status,
// então normalizamos tudo para os 5 valores aceites no nosso banco.
const statusAliases = {
  created: "created",
  paid: "paid",
  shipped: "shipped",
  delivered: "delivered",
  canceled: "canceled",
  cancelled: "canceled",  // inglês britânico
  pending: "created",     // mesmo conceito que created
  approved: "paid",       // mesmo conceito que paid
  separated: "paid",      // veio no payload de exemplo do professor
};

// Converte o status recebido no payload para o status padrão do nosso banco.
// Se vier um status desconhecido, lança um erro.
function mapOrderStatus(status) {
  const key = String(status || "").trim().toLowerCase();
  const mapped = statusAliases[key];
  if (!mapped) throw new Error(`Invalid status: ${status}`);
  return mapped;
}

// Verifica se o erro é temporário (ex: banco fora do ar, conexão recusada).
// Erros temporários devem fazer a mensagem voltar para a fila (nack).
// Erros permanentes (dados inválidos) devem ser descartados (ack).
function isTransientError(error) {
  const code = error.code || "";
  if (["P1001", "P1002", "P1008", "P1017", "P2024", "P2034"].includes(code)) return true;
  const message = String(error.message || "").toLowerCase();
  return message.includes("can't reach database server")
    || message.includes("connection refused")
    || message.includes("deadlock detected")
    || message.includes("transaction already closed")
    || message.includes("unable to start a transaction");
}

// Aguarda um número de milissegundos antes de continuar.
// Usado entre tentativas de reprocessamento para não sobrecarregar o banco.
function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

// Função principal do worker: recebe o payload de um pedido e salva tudo no banco.
// Usa uma transação para garantir que ou salva tudo (pedido, cliente, produtos, itens,
// pagamento, envio) ou não salva nada — nunca fica com dados pela metade.
// Tenta até 3 vezes em caso de erro temporário antes de desistir.
async function persistOrder(payload) {
  const orderUuid = required(payload.uuid, "uuid");
  const customer = required(payload.customer, "customer");
  const seller = required(payload.seller, "seller");
  const items = required(payload.items, "items");
  const status = mapOrderStatus(required(payload.status, "status"));
  const createdAtValue = required(first(payload.created_at, payload.createdAt), "created_at");

  // Ordena os itens por id do produto para evitar deadlock quando dois pedidos
  // tentam gravar o mesmo produto ao mesmo tempo em ordem diferente.
  const orderedItems = [...items].sort((left, right) => (
    String(left.product?.id || "").localeCompare(String(right.product?.id || ""))
  ));

  // Timeout de 30 segundos para pedidos com muitos itens não expirarem.
  const saveTransaction = () => prisma.$transaction(async (transaction) => {

    // Se o pedido já existe no banco (mensagem duplicada do Pub/Sub), ignora.
    const existing = await transaction.order.findUnique({ where: { orderUuid } });
    if (existing) return;

    // Salva ou atualiza o cliente. upsert = insere se não existir, atualiza se já existir.
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

    // Salva ou atualiza cada produto dos itens do pedido.
    for (const item of orderedItems) {
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

    // Cria o pedido com todos os seus relacionamentos de uma vez.
    // O campo indexed_at é preenchido automaticamente pelo banco com a hora atual.
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
          create: orderedItems.map((item) => ({
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
  }, { timeout: 30000 });

  // Tenta salvar até 3 vezes. Se for erro temporário, espera um pouco e tenta de novo.
  // Se for erro permanente ou esgotarem as tentativas, lança o erro para o handler.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await saveTransaction();
      return;
    } catch (error) {
      if (!isTransientError(error) || attempt === 2) throw error;
      await wait(200 * (attempt + 1));
    }
  }
}

// Handler que processa cada mensagem que chega na fila grupo-g do Pub/Sub.
// Se salvar com sucesso: ack() avisa ao Google que pode remover da fila.
// Se for erro temporário: nack() devolve à fila para tentar de novo depois.
// Se for erro permanente (payload inválido): ack() descarta para não ficar em loop infinito.
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

// Se a própria conexão com o Pub/Sub der erro, imprime no terminal.
subscription.on("error", (error) => console.error("Subscription error:", error.message));

console.log(`Waiting for orders on ${subscriptionName}...`);

module.exports = { persistOrder, mapOrderStatus };
