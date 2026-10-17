const asyncHandler = require("express-async-handler");
const RoutePlan = require("../models/RoutePlan");

const createRoutePlan = asyncHandler(async (req, res) => {
  const salesman = req.user.role === "salesman" ? req.user._id : req.body.salesman;
  const plan = await RoutePlan.create({ salesman, date: req.body.date, plannedParties: req.body.plannedParties });
  res.status(201).json(plan);
});

const getRoutePlans = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.user.role === "salesman") filter.salesman = req.user._id;
  else if (req.query.salesman) filter.salesman = req.query.salesman;
  if (req.query.date) filter.date = req.query.date;

  const plans = await RoutePlan.find(filter)
    .populate("salesman", "name")
    .populate("plannedParties", "name address mobile")
    .sort({ date: -1 });
  res.json(plans);
});

module.exports = { createRoutePlan, getRoutePlans };
