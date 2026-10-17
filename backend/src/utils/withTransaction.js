const mongoose = require("mongoose");

// Runs `fn(session)` inside a real Mongo multi-document transaction and commits it - or
// rolls back every write inside it - as one atomic unit. Requires a replica set (a plain
// standalone `mongod` does not support transactions); MongoDB Atlas clusters are a replica
// set even on the free M0 tier, so this works there out of the box.
//
// Every model call inside `fn` MUST be given the session (`{ session }` on a write,
// `.session(session)` on a query/read) or it silently runs OUTSIDE the transaction instead
// of failing - that is the one easy way to get this wrong, so double-check every call site.
const withTransaction = async (fn) => {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
};

module.exports = withTransaction;
