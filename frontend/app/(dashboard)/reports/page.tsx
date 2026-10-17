"use client";

import { useEffect, useState } from "react";
import {
  Typography, Box, Tabs, Tab, Paper, Table, TableHead, TableRow, TableCell,
  TableBody, TableContainer, Grid, Chip,
} from "@mui/material";
import api from "@/lib/api";

interface Gstr1Row { _id: string; taxableValue: number; totalAmount: number; sgstRate: number; cgstRate: number; igstRate: number; }
interface FinancialStatement {
  balanceSheet: { assets: { total: number }; liabilities: { total: number }; equity: { total: number } };
  profitAndLoss: { income: { total: number }; expense: { total: number }; netProfit: number };
}
interface PurchaseDashboard {
  todaysPurchase: number; monthlyPurchase: number; totalPurchaseUptoDate: number;
  totalPaymentPaid: number; totalPaymentPending: number;
}
interface StockReport {
  totalItems: number; totalStockValue: number;
  lowStock: { _id: string; name: string; unit: string; stockQty: number; reorderLevel: number }[];
}
interface DayBookEntry {
  date: string; reference: string; type: string;
  debitAccount?: string; creditAccount?: string; amount: number; narration?: string;
}
interface DayBook { entries: DayBookEntry[]; totalDebit: number; totalCredit: number; }
interface TrialBalanceRow { ledger: string; group?: string; nature?: string; debit: number; credit: number; }
interface TrialBalance { rows: TrialBalanceRow[]; totalDebit: number; totalCredit: number; }
interface Debtor { _id: string; name: string; dealerCode?: string; mobile?: string; outstanding: number; creditLimit: number; overLimit: boolean; salesman?: string; }
interface Creditor { _id: string; name: string; dealerCode?: string; mobile?: string; payable: number; }
interface PartyBalances { debtors: Debtor[]; creditors: Creditor[]; totalReceivable: number; totalPayable: number; }
interface CashFlow {
  moneyIn: number; moneyOut: number; netCashFlow: number;
  receiptsCount: number; cashSalesCount: number; paymentsCount: number;
  cashBalance: number; bankBalance: number;
}

export default function ReportsPage() {
  const [tab, setTab] = useState(0);
  const [gstr1, setGstr1] = useState<Gstr1Row[]>([]);
  const [financial, setFinancial] = useState<FinancialStatement | null>(null);
  const [purchaseDash, setPurchaseDash] = useState<PurchaseDashboard | null>(null);
  const [stock, setStock] = useState<StockReport | null>(null);
  const [dayBook, setDayBook] = useState<DayBook | null>(null);
  const [trialBalance, setTrialBalance] = useState<TrialBalance | null>(null);
  const [partyBalances, setPartyBalances] = useState<PartyBalances | null>(null);
  const [cashFlow, setCashFlow] = useState<CashFlow | null>(null);

  useEffect(() => {
    api.get("/reports/gstr1").then((res) => setGstr1(res.data)).catch(() => {});
    api.get("/reports/financial-statement").then((res) => setFinancial(res.data)).catch(() => {});
    api.get("/reports/purchase-dashboard").then((res) => setPurchaseDash(res.data)).catch(() => {});
    api.get("/reports/stock").then((res) => setStock(res.data)).catch(() => {});
    api.get("/reports/day-book").then((res) => setDayBook(res.data)).catch(() => {});
    api.get("/reports/trial-balance").then((res) => setTrialBalance(res.data)).catch(() => {});
    api.get("/reports/party-balances").then((res) => setPartyBalances(res.data)).catch(() => {});
    api.get("/reports/cash-flow").then((res) => setCashFlow(res.data)).catch(() => {});
  }, []);

  return (
    <>
      <Typography variant="h5" fontWeight={700} mb={2}>Reports</Typography>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3 }}>
        <Tab label="GSTR-1" />
        <Tab label="Financial Statement" />
        <Tab label="Purchase Dashboard" />
        <Tab label="Stock / Low Stock" />
        <Tab label="Day Book" />
        <Tab label="Trial Balance" />
        <Tab label="Debtors / Creditors" />
        <Tab label="Cash Flow" />
      </Tabs>

      {tab === 0 && (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>HSN Code</TableCell>
                <TableCell align="right">Taxable Value</TableCell>
                <TableCell align="right">SGST %</TableCell>
                <TableCell align="right">CGST %</TableCell>
                <TableCell align="right">IGST %</TableCell>
                <TableCell align="right">Total (incl. tax)</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {gstr1.map((r) => (
                <TableRow key={r._id} hover>
                  <TableCell>{r._id}</TableCell>
                  <TableCell align="right">₹{r.taxableValue.toLocaleString("en-IN")}</TableCell>
                  <TableCell align="right">{r.sgstRate}</TableCell>
                  <TableCell align="right">{r.cgstRate}</TableCell>
                  <TableCell align="right">{r.igstRate}</TableCell>
                  <TableCell align="right">₹{r.totalAmount.toLocaleString("en-IN")}</TableCell>
                </TableRow>
              ))}
              {gstr1.length === 0 && <TableRow><TableCell colSpan={6} align="center">No sales data yet</TableCell></TableRow>}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {tab === 1 && financial && (
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3 }}>
              <Typography variant="subtitle1" fontWeight={600} mb={2}>Balance Sheet (snapshot)</Typography>
              <Box display="flex" justifyContent="space-between" mb={1}><span>Assets</span><b>₹{financial.balanceSheet.assets.total.toLocaleString("en-IN")}</b></Box>
              <Box display="flex" justifyContent="space-between" mb={1}><span>Liabilities</span><b>₹{financial.balanceSheet.liabilities.total.toLocaleString("en-IN")}</b></Box>
              <Box display="flex" justifyContent="space-between"><span>Equity</span><b>₹{financial.balanceSheet.equity.total.toLocaleString("en-IN")}</b></Box>
            </Paper>
          </Grid>
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3 }}>
              <Typography variant="subtitle1" fontWeight={600} mb={2}>Profit &amp; Loss</Typography>
              <Box display="flex" justifyContent="space-between" mb={1}><span>Income</span><b>₹{financial.profitAndLoss.income.total.toLocaleString("en-IN")}</b></Box>
              <Box display="flex" justifyContent="space-between" mb={1}><span>Expense</span><b>₹{financial.profitAndLoss.expense.total.toLocaleString("en-IN")}</b></Box>
              <Box display="flex" justifyContent="space-between"><span>Net Profit</span><b>₹{financial.profitAndLoss.netProfit.toLocaleString("en-IN")}</b></Box>
            </Paper>
          </Grid>
        </Grid>
      )}

      {tab === 2 && purchaseDash && (
        <Grid container spacing={2}>
          {[
            { label: "Today's Purchase", value: purchaseDash.todaysPurchase },
            { label: "Monthly Purchase", value: purchaseDash.monthlyPurchase },
            { label: "Total Purchase Upto Date", value: purchaseDash.totalPurchaseUptoDate },
            { label: "Total Payment Paid", value: purchaseDash.totalPaymentPaid },
            { label: "Total Payment Pending", value: purchaseDash.totalPaymentPending },
          ].map((c) => (
            <Grid item xs={12} sm={6} md={4} key={c.label}>
              <Paper sx={{ p: 3 }}>
                <Typography variant="body2" color="text.secondary">{c.label}</Typography>
                <Typography variant="h5" fontWeight={700}>₹{c.value.toLocaleString("en-IN")}</Typography>
              </Paper>
            </Grid>
          ))}
        </Grid>
      )}

      {tab === 3 && stock && (
        <>
          <Grid container spacing={2} mb={3}>
            <Grid item xs={12} sm={6} md={4}>
              <Paper sx={{ p: 3 }}>
                <Typography variant="body2" color="text.secondary">Total Active Items</Typography>
                <Typography variant="h5" fontWeight={700}>{stock.totalItems}</Typography>
              </Paper>
            </Grid>
            <Grid item xs={12} sm={6} md={4}>
              <Paper sx={{ p: 3 }}>
                <Typography variant="body2" color="text.secondary">Total Stock Value (at purchase rate)</Typography>
                <Typography variant="h5" fontWeight={700}>₹{stock.totalStockValue.toLocaleString("en-IN")}</Typography>
              </Paper>
            </Grid>
            <Grid item xs={12} sm={6} md={4}>
              <Paper sx={{ p: 3 }}>
                <Typography variant="body2" color="text.secondary">Items Below Reorder Level</Typography>
                <Typography variant="h5" fontWeight={700} color={stock.lowStock.length > 0 ? "error" : "text.primary"}>{stock.lowStock.length}</Typography>
              </Paper>
            </Grid>
          </Grid>

          <Typography variant="subtitle1" fontWeight={600} mb={1}>Low Stock Alert</Typography>
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Item</TableCell>
                  <TableCell align="right">Current Stock</TableCell>
                  <TableCell align="right">Reorder Level</TableCell>
                  <TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {stock.lowStock.map((i) => (
                  <TableRow key={i._id} hover>
                    <TableCell>{i.name}</TableCell>
                    <TableCell align="right">{i.stockQty} {i.unit}</TableCell>
                    <TableCell align="right">{i.reorderLevel} {i.unit}</TableCell>
                    <TableCell><Chip size="small" color={i.stockQty <= 0 ? "error" : "warning"} label={i.stockQty <= 0 ? "Out of Stock" : "Low Stock"} /></TableCell>
                  </TableRow>
                ))}
                {stock.lowStock.length === 0 && <TableRow><TableCell colSpan={4} align="center">Nothing below reorder level</TableCell></TableRow>}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}

      {tab === 4 && dayBook && (
        <>
          <Typography variant="body2" color="text.secondary" mb={2}>
            Every posted transaction (vouchers, sales, purchases), chronologically. Total
            Debit always equals Total Credit - that is a reconciliation check, not a coincidence.
          </Typography>
          <TableContainer component={Paper}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Date</TableCell><TableCell>Reference</TableCell><TableCell>Type</TableCell>
                  <TableCell>Debit Account</TableCell><TableCell>Credit Account</TableCell>
                  <TableCell align="right">Amount</TableCell><TableCell>Narration</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {dayBook.entries.map((e, i) => (
                  <TableRow key={i} hover>
                    <TableCell>{new Date(e.date).toLocaleDateString("en-IN")}</TableCell>
                    <TableCell>{e.reference}</TableCell>
                    <TableCell><Chip size="small" label={e.type.replace("_", " ")} /></TableCell>
                    <TableCell>{e.debitAccount || "-"}</TableCell>
                    <TableCell>{e.creditAccount || "-"}</TableCell>
                    <TableCell align="right">₹{e.amount.toLocaleString("en-IN")}</TableCell>
                    <TableCell>{e.narration || "-"}</TableCell>
                  </TableRow>
                ))}
                {dayBook.entries.length === 0 && <TableRow><TableCell colSpan={7} align="center">No transactions yet</TableCell></TableRow>}
              </TableBody>
              {dayBook.entries.length > 0 && (
                <TableHead>
                  <TableRow>
                    <TableCell colSpan={5}><b>Total</b></TableCell>
                    <TableCell align="right"><b>₹{dayBook.totalDebit.toLocaleString("en-IN")}</b></TableCell>
                    <TableCell />
                  </TableRow>
                </TableHead>
              )}
            </Table>
          </TableContainer>
        </>
      )}

      {tab === 5 && trialBalance && (
        <>
          <Box display="flex" gap={2} mb={2}>
            <Chip color={trialBalance.totalDebit === trialBalance.totalCredit ? "success" : "error"}
              label={`Total Debit ₹${trialBalance.totalDebit.toLocaleString("en-IN")}`} />
            <Chip color={trialBalance.totalDebit === trialBalance.totalCredit ? "success" : "error"}
              label={`Total Credit ₹${trialBalance.totalCredit.toLocaleString("en-IN")}`} />
          </Box>
          <TableContainer component={Paper}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Ledger</TableCell><TableCell>Group</TableCell>
                  <TableCell align="right">Debit</TableCell><TableCell align="right">Credit</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {trialBalance.rows.map((r, i) => (
                  <TableRow key={i} hover>
                    <TableCell>{r.ledger}</TableCell>
                    <TableCell>{r.group || "-"}</TableCell>
                    <TableCell align="right">{r.debit ? `₹${r.debit.toLocaleString("en-IN")}` : "-"}</TableCell>
                    <TableCell align="right">{r.credit ? `₹${r.credit.toLocaleString("en-IN")}` : "-"}</TableCell>
                  </TableRow>
                ))}
                {trialBalance.rows.length === 0 && <TableRow><TableCell colSpan={4} align="center">No ledger balances yet</TableCell></TableRow>}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}

      {tab === 6 && partyBalances && (
        <>
          <Grid container spacing={2} mb={3}>
            <Grid item xs={12} sm={6}>
              <Paper sx={{ p: 3 }}>
                <Typography variant="body2" color="text.secondary">Total Receivable (Debtors owe us)</Typography>
                <Typography variant="h5" fontWeight={700} color="success.main">₹{partyBalances.totalReceivable.toLocaleString("en-IN")}</Typography>
              </Paper>
            </Grid>
            <Grid item xs={12} sm={6}>
              <Paper sx={{ p: 3 }}>
                <Typography variant="body2" color="text.secondary">Total Payable (We owe Creditors)</Typography>
                <Typography variant="h5" fontWeight={700} color="error.main">₹{partyBalances.totalPayable.toLocaleString("en-IN")}</Typography>
              </Paper>
            </Grid>
          </Grid>

          <Typography variant="subtitle1" fontWeight={600} mb={1}>Debtors (Dealers who owe us money)</Typography>
          <TableContainer component={Paper} sx={{ mb: 3 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Dealer</TableCell><TableCell>Code</TableCell><TableCell>Mobile</TableCell>
                  <TableCell>Salesman</TableCell>
                  <TableCell align="right">Outstanding</TableCell><TableCell align="right">Credit Limit</TableCell>
                  <TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {partyBalances.debtors.map((d) => (
                  <TableRow key={d._id} hover>
                    <TableCell>{d.name}</TableCell>
                    <TableCell>{d.dealerCode || "-"}</TableCell>
                    <TableCell>{d.mobile || "-"}</TableCell>
                    <TableCell>{d.salesman || "-"}</TableCell>
                    <TableCell align="right">₹{d.outstanding.toLocaleString("en-IN")}</TableCell>
                    <TableCell align="right">₹{(d.creditLimit || 0).toLocaleString("en-IN")}</TableCell>
                    <TableCell>{d.overLimit && <Chip size="small" color="error" label="Over Limit" />}</TableCell>
                  </TableRow>
                ))}
                {partyBalances.debtors.length === 0 && <TableRow><TableCell colSpan={7} align="center">No dealer owes money right now</TableCell></TableRow>}
              </TableBody>
            </Table>
          </TableContainer>

          <Typography variant="subtitle1" fontWeight={600} mb={1}>Creditors (Suppliers we owe money to)</Typography>
          <TableContainer component={Paper}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Supplier</TableCell><TableCell>Code</TableCell><TableCell>Mobile</TableCell>
                  <TableCell align="right">Payable</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {partyBalances.creditors.map((c) => (
                  <TableRow key={c._id} hover>
                    <TableCell>{c.name}</TableCell>
                    <TableCell>{c.dealerCode || "-"}</TableCell>
                    <TableCell>{c.mobile || "-"}</TableCell>
                    <TableCell align="right">₹{c.payable.toLocaleString("en-IN")}</TableCell>
                  </TableRow>
                ))}
                {partyBalances.creditors.length === 0 && <TableRow><TableCell colSpan={4} align="center">We don't owe any supplier right now</TableCell></TableRow>}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}

      {tab === 7 && cashFlow && (
        <>
          <Typography variant="body2" color="text.secondary" mb={2}>
            Money in vs. money out this month (Receipts + Cash Sales vs. Payments), and the current Cash/Bank balances.
          </Typography>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6} md={3}>
              <Paper sx={{ p: 3 }}>
                <Typography variant="body2" color="text.secondary">Money In ({cashFlow.receiptsCount + cashFlow.cashSalesCount} txns)</Typography>
                <Typography variant="h5" fontWeight={700} color="success.main">₹{cashFlow.moneyIn.toLocaleString("en-IN")}</Typography>
              </Paper>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Paper sx={{ p: 3 }}>
                <Typography variant="body2" color="text.secondary">Money Out ({cashFlow.paymentsCount} txns)</Typography>
                <Typography variant="h5" fontWeight={700} color="error.main">₹{cashFlow.moneyOut.toLocaleString("en-IN")}</Typography>
              </Paper>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Paper sx={{ p: 3 }}>
                <Typography variant="body2" color="text.secondary">Net Cash Flow</Typography>
                <Typography variant="h5" fontWeight={700} color={cashFlow.netCashFlow >= 0 ? "success.main" : "error.main"}>₹{cashFlow.netCashFlow.toLocaleString("en-IN")}</Typography>
              </Paper>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Paper sx={{ p: 3 }}>
                <Typography variant="body2" color="text.secondary">Cash + Bank Balance</Typography>
                <Typography variant="h5" fontWeight={700}>₹{(cashFlow.cashBalance + cashFlow.bankBalance).toLocaleString("en-IN")}</Typography>
                <Typography variant="caption" color="text.secondary">Cash ₹{cashFlow.cashBalance.toLocaleString("en-IN")} · Bank ₹{cashFlow.bankBalance.toLocaleString("en-IN")}</Typography>
              </Paper>
            </Grid>
          </Grid>
        </>
      )}
    </>
  );
}
