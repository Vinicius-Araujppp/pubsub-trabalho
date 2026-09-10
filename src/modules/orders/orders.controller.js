const service = require("./orders.service");

async function list(req, res, next) {
  try {
    res.json(await service.listOrders(req.query));
  } catch (error) {
    next(error);
  }
}

async function detail(req, res, next) {
  try {
    res.json(await service.getOrder(req.params.uuid));
  } catch (error) {
    next(error);
  }
}

async function items(req, res, next) {
  try {
    res.json(await service.getOrderItems(req.params.uuid));
  } catch (error) {
    next(error);
  }
}

async function summary(req, res, next) {
  try {
    res.json(await service.financialSummary(req.query));
  } catch (error) {
    next(error);
  }
}

module.exports = { list, detail, items, summary };