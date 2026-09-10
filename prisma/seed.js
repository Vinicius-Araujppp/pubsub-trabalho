require("dotenv").config();

const prisma = require("../src/lib/prisma");

async function main() {
  const product = await prisma.product.upsert({
    where: { id: "abc-1344" },
    update: {},
    create: {
      id: "abc-1344",
      title: "televisao bonita",
      categoryId: "ELEC",
      categoryName: "Eletrônicos",
      subCategoryId: "PHONE",
      subCategoryName: "Smartphones",
    },
  });
  const customer = await prisma.customer.upsert({
    where: { id: 7788n },
    update: {},
    create: {
      id: 7788n,
      name: "Maria Oliveira",
      email: "maria@email.com",
      document: "987.654.321-00",
    },
  });
  const order = await prisma.order.upsert({
    where: { orderUuid: "ORD-2025-0001" },
    update: {},
    create: {
      orderUuid: "ORD-2025-0001",
      createdAt: new Date("2025-10-01T10:15:00Z"),
      channel: "mobile_app",
      status: "paid",
      customerId: customer.id,
      sellerId: 55n,
      sellerName: "Tech Store",
      sellerCity: "São Paulo",
      sellerState: "SP",
      metadata: { source: "seed" },
      items: { create: [{ id: 1, productId: product.id, unitPrice: 2500, quantity: 2 }] },
      payment: { create: { method: "pix", status: "approved", transactionId: "pay_987654321" } },
      shipment: { create: {
        carrier: "Correios",
        service: "SEDEX",
        status: "shipped",
        trackingCode: "BR123456789",
      } },
    },
  });
  console.log(`Seeded ${order.orderUuid}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());