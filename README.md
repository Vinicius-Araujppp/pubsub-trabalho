# Pub/Sub JavaScript

## Google Cloud setup

```powershell
gcloud config set project serjava-demo
gcloud services enable pubsub.googleapis.com
gcloud pubsub topics create eventos
gcloud pubsub subscriptions create eventos-consumidor --topic=eventos
```

Authenticate without storing a key in this project:

```powershell
gcloud auth application-default login
```

For a service account, set `GOOGLE_APPLICATION_CREDENTIALS` to a new rotated
key file kept outside this repository.

## Run

Open two terminals in this directory. Start the subscriber first:

```powershell
npm run subscribe
```

Then publish a message:

```powershell
npm run publish
```

Topic and subscription names can be changed with `PUBSUB_TOPIC` and
`PUBSUB_SUBSCRIPTION`.