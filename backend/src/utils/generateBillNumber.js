// Simple sequential number generator, e.g. SB-2026-00001 (or DLR-2026-000125 with padLength=6)
const generateBillNumber = async (Model, prefix, field = "billNumber", padLength = 5) => {
  const year = new Date().getFullYear();
  const count = await Model.countDocuments({ [field]: new RegExp(`^${prefix}-${year}-`) });
  const seq = String(count + 1).padStart(padLength, "0");
  return `${prefix}-${year}-${seq}`;
};

module.exports = generateBillNumber;
