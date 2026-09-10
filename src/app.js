require("dotenv").config();

const express = require("express");
const cors = require("cors");
const ordersRoutes = require("./modules/orders/orders.routes");

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.get("/health", (_req, res) => res.json({ status: "ok" }));
app.use("/orders", ordersRoutes);

app.use((error, _req, res, _next) => {
  const statusCode = error.statusCode || 500;
  if (statusCode >= 500) console.error(error);
  res.status(statusCode).json({ error: statusCode >= 500 ? "Internal server error" : error.message });
});

module.exports = app;