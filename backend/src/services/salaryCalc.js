// Basic per-day salary computation. Extend with PF/ESI/TDS deductions as needed.
const computeSalary = ({ basicPay, totalDays, presentDays, overtimeHours = 0, overtimeRatePerHour = 0, allowances = [], deductions = [] }) => {
  const perDayPay = basicPay / totalDays;
  const earnedBasic = perDayPay * presentDays;
  const overtimeAmount = overtimeHours * overtimeRatePerHour;

  const totalAllowances = allowances.reduce((sum, a) => sum + a.amount, 0);
  const totalDeductions = deductions.reduce((sum, d) => sum + d.amount, 0);

  const grossPay = earnedBasic + overtimeAmount + totalAllowances;
  const netPay = grossPay - totalDeductions;

  return {
    earnedBasic: Math.round(earnedBasic),
    overtimeAmount: Math.round(overtimeAmount),
    grossPay: Math.round(grossPay),
    totalDeductions: Math.round(totalDeductions),
    netPay: Math.round(netPay),
  };
};

module.exports = { computeSalary };
