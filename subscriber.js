require("dotenv").config();

const { pubsub, subscriptionName } = require("./src/lib/pubsub");
const subscription = pubsub.subscription(subscriptionName);

subscription.on("message", (message) => {
  try {
    const payload = JSON.parse(message.data.toString());
    console.log("Message received:", payload);
    message.ack();
  } catch (error) {
    console.error("Could not process message:", error.message);
    message.nack();
  }
});

subscription.on("error", (error) => {
  console.error("Subscription error:", error.message);
  process.exitCode = 1;
});

console.log(`Waiting for messages on ${subscriptionName}...`);