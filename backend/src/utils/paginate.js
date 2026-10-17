// Applies page/limit query params to a Mongoose query and returns { data, pagination }.
// Usage: const result = await paginate(Model.find(filter).sort(...), req.query);
const paginate = async (query, { page = 1, limit = 50 } = {}) => {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));

  const countQuery = query.model.find(query.getFilter());
  const total = await countQuery.countDocuments();

  const data = await query.skip((pageNum - 1) * limitNum).limit(limitNum);

  return {
    data,
    pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) },
  };
};

module.exports = paginate;
