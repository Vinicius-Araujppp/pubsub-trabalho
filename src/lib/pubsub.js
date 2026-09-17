const { PubSub } = require("@google-cloud/pubsub");

const projectId = process.env.GOOGLE_CLOUD_PROJECT || "serjava-demo";
const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

if (!credentialsPath) {
  throw new Error(
    "GOOGLE_APPLICATION_CREDENTIALS is required and must point to the service account JSON key",
  );
}

function shortName(value, kind, fallback) {
  const raw = (value || fallback).trim();
  const marker = `/${kind}/`;
  const index = raw.indexOf(marker);
  if (raw.startsWith("projects/") && index >= 0) {
    return raw.slice(index + marker.length);
  }
  return raw;
}

const topicName = shortName(process.env.PUBSUB_TOPIC, "topics", "aula-pub");
const subscriptionName = shortName(process.env.PUBSUB_SUBSCRIPTION, "subscriptions", "grupo-g");

const pubsub = new PubSub({
  projectId,
  keyFilename: credentialsPath,
});

module.exports = { pubsub, projectId, topicName, subscriptionName };
