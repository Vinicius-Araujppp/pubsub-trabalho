require("dotenv").config();

const { PubSub } = require("@google-cloud/pubsub");

const projectId = process.env.GOOGLE_CLOUD_PROJECT || "serjava-demo";
const topicName = process.env.PUBSUB_TOPIC || "eventos";
const pubsub = new PubSub({ projectId });

async function publishMessage() {
  const payload = {
    type: "pedido.criado",
    orderId: 123,
    createdAt: new Date().toISOString(),
  };

  const messageId = await pubsub.topic(topicName).publishMessage({
    data: Buffer.from(JSON.stringify(payload)),
  });

  console.log(`Message published: ${messageId}`);
}

publishMessage().catch((error) => {
  console.error("Could not publish message:", error.message);
  process.exitCode = 1;
});