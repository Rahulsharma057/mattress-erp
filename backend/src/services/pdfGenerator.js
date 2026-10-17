const PDFDocument = require("pdfkit");
const { amountInWords } = require("../utils/amountInWords");
const { round2 } = require("../utils/billCalc");
const { fetchLogoAsPngBuffer } = require("../utils/cloudinaryImage");

// Renders a salary slip PDF and resolves with a Buffer, ready to upload to Cloudinary.
const generateSalarySlipPDF = (slip, employee) => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(18).text("Sunrise Foam Industries", { align: "center" });
    doc.fontSize(11).fillColor("gray").text("Salary Slip", { align: "center" });
    doc.moveDown(1.5);
    doc.fillColor("black");

    doc.fontSize(11);
    doc.text(`Employee: ${employee.name}  (${employee.designation || "-"})`);
    doc.text(`Month/Year: ${slip.month}/${slip.year}`);
    doc.text(`Present Days: ${slip.presentDays} / ${slip.totalDays}`);
    doc.moveDown();

    doc.text(`Basic Pay: ₹${slip.basicPay}`);
    doc.text(`Overtime: ₹${slip.overtimeAmount}`);
    (slip.allowances || []).forEach((a) => doc.text(`${a.label}: +₹${a.amount}`));
    doc.moveDown(0.5);
    (slip.deductions || []).forEach((d) => doc.text(`${d.label}: -₹${d.amount}`));
    doc.moveDown();

    doc.fontSize(13).text(`Gross Pay: ₹${slip.grossPay}`);
    doc.text(`Total Deductions: ₹${slip.totalDeductions}`);
    doc.fontSize(14).text(`Net Pay: ₹${slip.netPay}`, { underline: true });

    doc.end();
  });
};

// Renders a Receipt/Payment voucher as a printable PDF and resolves with a Buffer - streamed
// straight back in the HTTP response (see voucherController.getVoucherReceipt), never
// uploaded anywhere. Viewing/printing/downloading this must never create a new voucher or
// ledger entry, so it only ever READS an already-posted Voucher - it never writes one.
const generateVoucherReceiptPDF = (voucher, { partyName, settlementName, invoiceRefs }) => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const isReceipt = voucher.voucherType === "receipt";
    const title = isReceipt ? "Receipt Voucher" : "Payment Voucher";

    doc.fontSize(18).text("Sunrise Foam Industries", { align: "center" });
    doc.fontSize(11).fillColor("gray").text(title, { align: "center" });
    doc.moveDown(1.5);
    doc.fillColor("black");

    doc.fontSize(11);
    doc.text(`Voucher No: ${voucher.voucherNumber}`);
    doc.text(`Date: ${new Date(voucher.date).toLocaleDateString("en-IN")}`);
    doc.text(`Status: Posted`);
    doc.moveDown();

    doc.text(`${isReceipt ? "Received From" : "Paid To"}: ${partyName}`);
    doc.text(`${isReceipt ? "Received Into" : "Paid From"} Account: ${settlementName}`);
    doc.moveDown();

    doc.fontSize(14).text(`Amount: Rs. ${voucher.amount.toLocaleString("en-IN")}`, { underline: true });
    doc.fontSize(11).text(`In Words: ${amountInWords(voucher.amount)}`);
    doc.moveDown();

    if (voucher.paymentMode) doc.text(`Payment Mode: ${voucher.paymentMode.replace("_", " ")}`);
    if (voucher.referenceNumber) doc.text(`Transaction Reference: ${voucher.referenceNumber}`);
    if (invoiceRefs && invoiceRefs.length > 0) doc.text(`Against Invoice(s): ${invoiceRefs.join(", ")}`);
    if (voucher.narration) doc.text(`Narration: ${voucher.narration}`);

    doc.end();
  });
};

// Renders the full item-wise Sales Invoice (the Sales Bill itself - every line item, HSN,
// qty/rate/GST breakdown and payment status) as a printable PDF, resolving with a Buffer -
// streamed straight back in the HTTP response (see salesBillController.getSalesBillInvoice),
// never uploaded anywhere. This is deliberately NOT the Receipt Voucher (generateVoucherReceiptPDF
// above, which only shows a single payment's amount/narration) - it only ever READS an
// already-saved SalesBill, it never writes one.
//
// `bill` must already have `party`, `items.item` (+ nested `items.item.hsn`), and
// `items.variant` populated - see getSalesBillInvoice. `amountPaid`/`balanceDue` are computed
// by the caller from real posted Receipt vouchers (services/accountingPostings data), never
// invented here.
//
// NOTE: there is no discount field anywhere in the data model (models/BillItem.js) - every
// line's Discount column below is always ₹0 rather than a fabricated value, since this ERP
// has no discount mechanism to read from.
const generateSalesInvoicePDF = (bill, { partyDetails, amountPaid, balanceDue }) => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: "A4" });
    const chunks = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const left = doc.page.margins.left;
    const pageWidth = doc.page.width - left - doc.page.margins.right;
    const bottomLimit = doc.page.height - doc.page.margins.bottom;

    doc.fontSize(18).fillColor("black").text("Sunrise Foam Industries", { align: "center" });
    doc.fontSize(11).fillColor("gray").text("Tax Invoice", { align: "center" });
    doc.fillColor("black");
    doc.moveDown(1);

    // ---- Header: invoice meta (left) + Bill To party details (right), real data only ----
    const topY = doc.y;
    doc.fontSize(10).font("Helvetica-Bold").text(`Invoice No: ${bill.billNumber}`, left, topY, { width: 260 });
    doc.font("Helvetica");
    doc.text(`Date: ${new Date(bill.date).toLocaleDateString("en-IN")}`, left, doc.y, { width: 260 });
    doc.text(`Status: ${bill.status.charAt(0).toUpperCase() + bill.status.slice(1)}`, left, doc.y, { width: 260 });

    const billToX = left + 300;
    const billToWidth = pageWidth - 300;
    doc.font("Helvetica-Bold").text("Bill To:", billToX, topY, { width: billToWidth });
    doc.text(partyDetails?.name || "-", billToX, doc.y, { width: billToWidth });
    doc.font("Helvetica");
    if (partyDetails?.address) doc.text(partyDetails.address, billToX, doc.y, { width: billToWidth });
    const cityLine = [partyDetails?.city, partyDetails?.state, partyDetails?.pincode].filter(Boolean).join(", ");
    if (cityLine) doc.text(cityLine, billToX, doc.y, { width: billToWidth });
    if (partyDetails?.gstin) doc.text(`GSTIN: ${partyDetails.gstin}`, billToX, doc.y, { width: billToWidth });
    if (partyDetails?.mobile) doc.text(`Mobile: ${partyDetails.mobile}`, billToX, doc.y, { width: billToWidth });

    doc.x = left;
    doc.y = Math.max(doc.y, topY + 70);
    doc.moveDown(1);

    // ---- Item-wise table ----
    const cols = [
      { label: "#", width: 18, align: "left" },
      { label: "Item", width: 112, align: "left" },
      { label: "HSN", width: 46, align: "left" },
      { label: "Qty", width: 36, align: "right" },
      { label: "Rate", width: 52, align: "right" },
      { label: "Disc.", width: 40, align: "right" },
      { label: "Taxable", width: 68, align: "right" },
      { label: "GST", width: 68, align: "right" },
      { label: "Total", width: 75, align: "right" },
    ];
    let cx = left;
    const colX = cols.map((c) => { const x = cx; cx += c.width; return x; });

    const drawRow = (cells, { header = false } = {}) => {
      doc.font(header ? "Helvetica-Bold" : "Helvetica").fontSize(header ? 9 : 8.5);
      const rowY = doc.y;
      let rowHeight = 14;
      cells.forEach((text, i) => {
        const h = doc.heightOfString(String(text), { width: cols[i].width - 4 });
        if (h > rowHeight) rowHeight = h;
      });
      cells.forEach((text, i) => {
        doc.text(String(text), colX[i] + 2, rowY, { width: cols[i].width - 4, align: cols[i].align });
      });
      doc.y = rowY + rowHeight + 5;
      doc.moveTo(left, doc.y - 2).lineTo(left + pageWidth, doc.y - 2).strokeColor(header ? "#2e7d32" : "#eee").lineWidth(header ? 1.2 : 0.5).stroke();
      doc.strokeColor("black").lineWidth(1);
    };

    drawRow(cols.map((c) => c.label), { header: true });

    let subtotal = 0;
    let totalTax = 0;
    (bill.items || []).forEach((line, idx) => {
      if (doc.y > bottomLimit - 60) {
        doc.addPage();
        doc.y = doc.page.margins.top;
        drawRow(cols.map((c) => c.label), { header: true });
      }
      const base = line.quantity * line.rate;
      const gstRate = (line.sgst || 0) + (line.cgst || 0) + (line.igst || 0);
      const taxAmt = line.amount - base;
      subtotal += base;
      totalTax += taxAmt;

      const sizeLabel = line.variant && !line.variant.isUnspecified ? ` (${line.variant.sizeLabel})` : "";
      const itemLabel = `${line.item?.name || "-"}${sizeLabel}`;
      const hsnCode = line.item?.hsn?.code || "-";

      drawRow([
        idx + 1,
        itemLabel,
        hsnCode,
        `${line.quantity} ${line.item?.unit || ""}`,
        `Rs.${line.rate.toFixed(2)}`,
        "Rs.0.00",
        `Rs.${base.toFixed(2)}`,
        `${gstRate}% / Rs.${taxAmt.toFixed(2)}`,
        `Rs.${line.amount.toFixed(2)}`,
      ]);
    });

    doc.moveDown(0.5);
    if (doc.y > bottomLimit - 130) {
      doc.addPage();
      doc.y = doc.page.margins.top;
    }

    // ---- Summary ----
    const summaryLabelX = left + pageWidth - 220;
    const summaryValueX = left + pageWidth - 100;
    const summaryRow = (label, value, bold = false) => {
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(bold ? 11 : 9.5);
      const y = doc.y;
      doc.text(label, summaryLabelX, y, { width: 115 });
      doc.text(value, summaryValueX, y, { width: 95, align: "right" });
      doc.y = y + (bold ? 16 : 13);
    };

    summaryRow("Subtotal:", `Rs.${subtotal.toFixed(2)}`);
    summaryRow("Total Discount:", "Rs.0.00");
    summaryRow("Taxable Amount:", `Rs.${subtotal.toFixed(2)}`);
    summaryRow("GST (CGST+SGST/IGST):", `Rs.${totalTax.toFixed(2)}`);
    doc.moveDown(0.2);
    summaryRow("Grand Total:", `Rs.${bill.totalAmount.toFixed(2)}`, true);
    summaryRow("Amount Paid:", `Rs.${amountPaid.toFixed(2)}`);
    summaryRow("Balance Due:", `Rs.${balanceDue.toFixed(2)}`, true);

    const paymentStatus = balanceDue <= 0 ? "PAID" : amountPaid > 0 ? "PARTIALLY PAID" : "UNPAID";
    doc.moveDown(0.5);
    doc.fontSize(12).font("Helvetica-Bold").text(`Payment Status: ${paymentStatus}`, summaryLabelX, doc.y, { width: 220, align: "right" });

    doc.end();
  });
};

const INV_GREEN = "#2e7d32";
const INV_GREEN_LIGHT = "#e8f5e9";
const INV_BORDER = "#9fb8a0";
const INV_GRAY = "#555555";

// Renders the full Tax Invoice-cum-Delivery-Challan for one Dispatch, matching the company's
// reference invoice layout: letterhead, BILL TO / SHIP TO / TRANSPORT DETAILS boxes, item
// table, amount-in-words + Payment Received In, tax summary, terms & conditions, and
// signatory - resolving with a Buffer, streamed straight back in the HTTP response (see
// dispatchController.getDispatchInvoice), never uploaded anywhere. Read-only: only ever reads
// an already-saved SalesBill/Dispatch/CompanySettings, never writes one.
//
// `bill` must already have `items.item` (+ nested `items.item.hsn`) and `items.variant`
// populated. `billTo`/`dispatch.shipTo`/`dispatch.transport` are snapshots already frozen on
// the respective documents (see models/SalesBill.billingSnapshot and models/Dispatch.shipTo/
// transport). `company` is the CompanySettings singleton (see companySettingsController) -
// every field on it is optional, and a section whose fields are ALL blank (terms &
// conditions) is omitted entirely rather than printed empty or fabricated. If
// `company.logoUrl` is set, it's fetched and embedded in the header (falls back to the
// text-only header on any fetch failure - see utils/cloudinaryImage.fetchLogoAsPngBuffer,
// which is why this function is async). `paymentInfo` (see
// dispatchController.resolvePaymentReceivedInfo) is the real "Payment Received In" data,
// resolved purely from posted Receipt vouchers and their ledgers - there is no configured
// company bank account anywhere in this ERP to fall back to (see
// models/CompanySettings.js's note on why that was removed).

const generateDispatchInvoicePDF = async (
  bill,
  dispatch,
  { billTo, copyLabel, company, paymentInfo }
) => {
  const logoBuffer = await fetchLogoAsPngBuffer(company?.logoUrl);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 36, size: "A4" });
    const chunks = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const left = doc.page.margins.left;
    const pageWidth =
      doc.page.width - left - doc.page.margins.right;
    const right = left + pageWidth;
    const bottomLimit =
      doc.page.height - doc.page.margins.bottom;

    const GREEN = "#2e7d32";
    const LIGHT_GREEN = "#e8f5e9";
    const BORDER = "#9fb8a0";
    const GRAY = "#555555";

    const fmtDate = (value) => {
      if (!value) return "-";

      const d = new Date(value);

      return Number.isNaN(d.getTime())
        ? "-"
        : d.toLocaleDateString("en-IN");
    };

    const money = (value) =>
      `Rs. ${Number(value || 0).toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;

    // ---------- Label and value helper ----------
    const drawLabelValue = (
      x,
      y,
      width,
      label,
      value,
      labelWidth = 58
    ) => {
      doc
        .font("Helvetica-Bold")
        .fontSize(8)
        .fillColor("black")
        .text(label, x, y, { width: labelWidth });

      doc.font("Helvetica").fontSize(8).fillColor("black");

      const safeValue =
        value === undefined ||
        value === null ||
        value === ""
          ? "-"
          : String(value);

      const valueHeight = doc.heightOfString(safeValue, {
        width: Math.max(20, width - labelWidth),
      });

      doc.text(
        safeValue,
        x + labelWidth,
        y,
        {
          width: Math.max(20, width - labelWidth),
        }
      );

      return y + Math.max(valueHeight, 10) + 2;
    };

    // ---------- Header / Letterhead ----------
    doc
      .font("Helvetica-Bold")
      .fontSize(7.5)
      .fillColor(GRAY)
      .text(
        String(copyLabel || "ORIGINAL FOR BUYER").toUpperCase(),
        left,
        doc.y,
        {
          width: pageWidth,
          align: "right",
        }
      );

    doc.moveDown(0.35);

    const headerTop = doc.y;
    const leftWidth = pageWidth * 0.64;
    const logoSize = 40;
    const logoX = left;

    const textX = logoBuffer
      ? left + logoSize + 9
      : left;

    const textWidth =
      leftWidth - (textX - left) - 5;

    if (logoBuffer) {
      try {
        doc.image(logoBuffer, logoX, headerTop, {
          fit: [logoSize, logoSize],
        });
      } catch (_) {
        // Continue without logo if image decoding fails.
      }
    }

    doc
      .font("Helvetica-Bold")
      .fontSize(14)
      .fillColor("black")
      .text(
        company?.name || "SUNRISE FOAM INDUSTRIES",
        textX,
        headerTop,
        { width: textWidth }
      );

    doc.font("Helvetica").fontSize(7.6).fillColor(GRAY);

    const address = [
      company?.addressLine1,
      company?.addressLine2,
    ]
      .filter(Boolean)
      .join(", ");

    if (address) {
      doc.text(address, textX, doc.y, {
        width: textWidth,
      });
    }

    const contact1 = [
      company?.gstin && `GSTIN: ${company.gstin}`,
      company?.phone && `Ph.: ${company.phone}`,
    ]
      .filter(Boolean)
      .join("  |  ");

    if (contact1) {
      doc.text(contact1, textX, doc.y, {
        width: textWidth,
      });
    }

    const contact2 = [
      company?.email && `Email: ${company.email}`,
      company?.website,
    ]
      .filter(Boolean)
      .join("  |  ");

    if (contact2) {
      doc.text(contact2, textX, doc.y, {
        width: textWidth,
      });
    }

    // Invoice metadata box
    const metaX = left + leftWidth + 8;
    const metaWidth = right - metaX;

    doc.rect(metaX, headerTop, metaWidth, 18).fill(GREEN);

    doc
      .fillColor("white")
      .font("Helvetica-Bold")
      .fontSize(10)
      .text("INVOICE", metaX, headerTop + 4, {
        width: metaWidth,
        align: "center",
      });

    let metaY = headerTop + 24;

    const meta = (label, value) => {
      doc
        .font("Helvetica")
        .fontSize(7.5)
        .fillColor(GRAY)
        .text(label, metaX, metaY, {
          width: metaWidth * 0.48,
        });

      doc
        .font("Helvetica-Bold")
        .fontSize(7.5)
        .fillColor("black")
        .text(String(value || "-"), metaX + metaWidth * 0.48, metaY, {
          width: metaWidth * 0.52,
          align: "right",
        });

      metaY += 12;
    };

    meta("Invoice No.", bill.billNumber);
    meta("Invoice Date", fmtDate(bill.date));
    meta("Place Supply", (billTo?.state || "-").toUpperCase());

    doc.fillColor("black");
    doc.x = left;
    doc.y = Math.max(headerTop + logoSize, metaY) + 5;

    doc
      .moveTo(left, doc.y)
      .lineTo(right, doc.y)
      .strokeColor(GREEN)
      .lineWidth(1)
      .stroke();

    doc.moveDown(0.55);

    // ---------- Bill To / Ship To / Transport Details ----------
    const gap = 8;
    const boxWidth = (pageWidth - gap * 2) / 3;
    const pad = 6;
    const boxTop = doc.y;

    const addressFor = (person) =>
      [
        person?.address,
        person?.city,
        person?.state,
        person?.pincode,
      ]
        .filter(Boolean)
        .join(", ") || "-";

    const transport = dispatch.transport || {};
    const shipTo = dispatch.shipTo || {};

    const drawInfoBox = (title, x, rows) => {
      doc
        .font("Helvetica-Bold")
        .fontSize(8.2)
        .fillColor(GREEN)
        .text(title, x + pad, boxTop + pad, {
          width: boxWidth - pad * 2,
        });

      doc
        .moveTo(x + pad, boxTop + 19)
        .lineTo(x + boxWidth - pad, boxTop + 19)
        .strokeColor(BORDER)
        .lineWidth(0.5)
        .stroke();

      let y = boxTop + 24;

      for (const [label, value] of rows) {
        y = drawLabelValue(
          x + pad,
          y,
          boxWidth - pad * 2,
          label,
          value,
          54
        );
      }

      return y + pad;
    };

    const box1Bottom = drawInfoBox("BILL TO", left, [
      ["Name:", billTo?.name],
      ["Dealer Code:", billTo?.dealerCode],
      ["Address:", addressFor(billTo)],
      ["GSTIN:", billTo?.gstin],
      ["Mobile:", billTo?.mobile],
    ]);

    const box2Bottom = drawInfoBox(
      "SHIP TO",
      left + boxWidth + gap,
      [
        ["Name:", shipTo?.name],
        ["Dealer Code:", shipTo?.dealerCode],
        ["Address:", addressFor(shipTo)],
        ["GSTIN:", shipTo?.gstin],
        ["Mobile:", shipTo?.mobile],
      ]
    );

    const box3Bottom = drawInfoBox(
      "TRANSPORT DETAILS",
      left + 2 * (boxWidth + gap),
      [
        ["Transporter:", transport.transporterName],
        ["LR No.:", transport.lrNumber],
        [
          "LR Date:",
          transport.lrDate ? fmtDate(transport.lrDate) : "-",
        ],
        ["Vehicle No.:", transport.vehicleNumber],
        ["E-Way Bill:", transport.ewayBillNumber],
        ["Driver Name:", transport.driverName],
        ["Driver Ph.:", transport.driverPhone],
      ]
    );

    const infoBottom = Math.max(
      box1Bottom,
      box2Bottom,
      box3Bottom
    );

    [
      left,
      left + boxWidth + gap,
      left + 2 * (boxWidth + gap),
    ].forEach((x) => {
      doc
        .rect(x, boxTop, boxWidth, infoBottom - boxTop)
        .strokeColor(BORDER)
        .lineWidth(0.55)
        .stroke();
    });

    doc.x = left;
    doc.y = infoBottom + 10;

    // ---------- Items Table ----------
    const cols = [
      { label: "S.No.", width: 30, align: "left" },
      { label: "Product Description", width: 130, align: "left" },
      { label: "Size", width: 77, align: "left" },
      { label: "HSN Code", width: 52, align: "left" },
      { label: "Qty.", width: 32, align: "right" },
      { label: "Unit", width: 37, align: "left" },
      { label: "Rate (Rs.)", width: 67, align: "right" },
      { label: "Amount (Rs.)", width: 93, align: "right" },
    ];

    // Scale columns to available A4 content width.
    const baseColsWidth = cols.reduce(
      (sum, col) => sum + col.width,
      0
    );

    const scale = pageWidth / baseColsWidth;

    cols.forEach((col) => {
      col.width *= scale;
    });

    let cursorX = left;

    const colX = cols.map((col) => {
      const x = cursorX;
      cursorX += col.width;
      return x;
    });

    const drawTableRow = (
      values,
      {
        header = false,
        bg = null,
        bold = false,
      } = {}
    ) => {
      doc
        .font(header || bold ? "Helvetica-Bold" : "Helvetica")
        .fontSize(8);

      const y = doc.y;
      let height = 14;

      values.forEach((value, index) => {
        height = Math.max(
          height,
          doc.heightOfString(String(value ?? ""), {
            width: cols[index].width - 5,
          })
        );
      });

      if (bg) {
        doc
          .rect(left, y - 2, pageWidth, height + 5)
          .fill(bg);
      }

      doc.fillColor(header ? "white" : "black");

      values.forEach((value, index) => {
        doc.text(
          String(value ?? ""),
          colX[index] + 2,
          y,
          {
            width: cols[index].width - 5,
            align: cols[index].align,
          }
        );
      });

      doc.fillColor("black");
      doc.y = y + height + 5;

      doc
        .moveTo(left, doc.y - 2)
        .lineTo(right, doc.y - 2)
        .strokeColor(header ? GREEN : "#dddddd")
        .lineWidth(header ? 0.8 : 0.4)
        .stroke();
    };

    const drawContinuedHeader = () => {
      doc.addPage();
      doc.y = doc.page.margins.top;

      doc
        .font("Helvetica")
        .fontSize(8)
        .fillColor(GRAY)
        .text(`${bill.billNumber} - continued`, left, doc.y, {
          width: pageWidth,
        });

      doc.moveDown(0.5);

      drawTableRow(
        cols.map((col) => col.label),
        {
          header: true,
          bg: GREEN,
        }
      );
    };

    drawTableRow(
      cols.map((col) => col.label),
      {
        header: true,
        bg: GREEN,
      }
    );

    let subtotal = 0;
    let totalQty = 0;

    const items = bill.items || [];

    items.forEach((line, index) => {
      if (doc.y > bottomLimit - 45) {
        drawContinuedHeader();
      }

      const quantity = Number(line.quantity || 0);
      const rate = Number(line.rate || 0);
      const amount = quantity * rate;

      subtotal += amount;
      totalQty += quantity;

      drawTableRow([
        index + 1,
        line.item?.name || "-",
        line.variant && !line.variant.isUnspecified
          ? line.variant.sizeLabel || "-"
          : "-",
        line.item?.hsn?.code || "-",
        quantity,
        line.item?.unit || "",
        Number(rate).toLocaleString("en-IN", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }),
        money(amount),
      ]);
    });

    if (doc.y > bottomLimit - 32) {
      drawContinuedHeader();
    }

    const units = new Set(
      items
        .map((line) => line.item?.unit)
        .filter(Boolean)
    );

    drawTableRow(
      [
        "",
        "Total",
        "",
        "",
        totalQty,
        units.size === 1 ? [...units][0] : "",
        "",
        money(subtotal),
      ],
      {
        bg: LIGHT_GREEN,
        bold: true,
      }
    );

    doc.moveDown(0.45);

    // Keep the summary section together where possible.
    if (doc.y > bottomLimit - 210) {
      doc.addPage();
      doc.y = doc.page.margins.top;
    }

    // ---------- Amount in Words / Bank Details / Tax Summary ----------
    const colGap = 14;
    const leftColWidth = pageWidth * 0.51;
    const rightX = left + leftColWidth + colGap;
    const rightWidth = pageWidth - leftColWidth - colGap;
    const summaryTop = doc.y;

    doc
      .font("Helvetica-Bold")
      .fontSize(8.5)
      .fillColor("black")
      .text(
        "Amount Chargeable (in words):",
        left,
        summaryTop,
        { width: leftColWidth }
      );

    doc
      .font("Helvetica")
      .fontSize(8)
      .text(
        amountInWords(bill.totalAmount),
        left,
        doc.y,
        { width: leftColWidth }
      );

    let leftY = doc.y + 9;

    const pr = paymentInfo || {
      amountPaid: 0,
      accounts: [],
    };

    const accounts = Array.isArray(pr.accounts)
      ? pr.accounts
      : [];

    // Display actual ledger details only.
    // Do not add hardcoded bank account information.
    const describeAccount = (account) => {
      const details = [
        account.bankName,
        account.bankAccountHolderName &&
          `A/c Name: ${account.bankAccountHolderName}`,
        account.bankAccountNumber &&
          `A/c No.: ${account.bankAccountNumber}`,
        account.bankIfscCode &&
          `IFSC: ${account.bankIfscCode}`,
        account.bankBranch &&
          `Branch: ${account.bankBranch}`,
      ].filter(Boolean);

      if (details.length) {
        return {
          name: account.name || "Account",
          details,
        };
      }

      if (account.isBankAccount) {
        return {
          name: account.name || "Bank Account",
          details: ["Bank details not on file"],
        };
      }

      return {
        name: account.name || "Cash",
        details: [],
      };
    };

    doc
      .font("Helvetica-Bold")
      .fontSize(8.5)
      .fillColor(GREEN)
      .text(
        "BANK DETAILS / PAYMENT RECEIVED IN",
        left,
        leftY,
        { width: leftColWidth }
      );

    leftY += 13;

    if (accounts.length === 0) {
      doc
        .font("Helvetica")
        .fontSize(8)
        .fillColor("black")
        .text(
          "No payment received",
          left,
          leftY,
          { width: leftColWidth }
        );

      leftY += 12;
    } else {
      accounts.forEach((account) => {
        const described = describeAccount(account);

        doc
          .font("Helvetica-Bold")
          .fontSize(7.8)
          .fillColor("black")
          .text(
            described.name,
            left,
            leftY,
            { width: leftColWidth }
          );

        leftY += 10;

        described.details.forEach((detail) => {
          const height = doc.heightOfString(detail, {
            width: leftColWidth - 5,
          });

          doc
            .font("Helvetica")
            .fontSize(7.6)
            .fillColor("black")
            .text(
              detail,
              left + 5,
              leftY,
              { width: leftColWidth - 5 }
            );

          leftY += height + 2;
        });
      });

      const isPartial =
        Number(pr.amountPaid || 0) > 0 &&
        Number(pr.amountPaid || 0) <
          Number(bill.totalAmount || 0);

      if (isPartial) {
        const note =
          `${money(pr.amountPaid)} of ` +
          `${money(bill.totalAmount)} received`;

        const height = doc.heightOfString(note, {
          width: leftColWidth,
        });

        doc
          .font("Helvetica-Bold")
          .fontSize(7.8)
          .fillColor("black")
          .text(
            note,
            left,
            leftY + 2,
            { width: leftColWidth }
          );

        leftY += height + 5;
      }
    }

    // ---------- Tax Calculation ----------
    const groupByRate = (field) => {
      const groups = new Map();

      for (const line of items) {
        const rate = Number(line[field] || 0);

        if (rate <= 0) continue;

        const amount =
          (
            Number(line.quantity || 0) *
            Number(line.rate || 0) *
            rate
          ) / 100;

        groups.set(
          rate,
          (groups.get(rate) || 0) + amount
        );
      }

      return [...groups.entries()].sort(
        (a, b) => a[0] - b[0]
      );
    };

    const cgstGroups = groupByRate("cgst");
    const sgstGroups = groupByRate("sgst");
    const igstGroups = groupByRate("igst");

    const totalTax = [
      ...cgstGroups,
      ...sgstGroups,
      ...igstGroups,
    ].reduce(
      (sum, [, amount]) => sum + amount,
      0
    );

    const roundOff = round2(
      Number(bill.totalAmount || 0) -
        round2(subtotal + totalTax)
    );

    let taxY = summaryTop;

    const taxRow = (
      label,
      value,
      {
        bold = false,
        highlight = false,
      } = {}
    ) => {
      const rowHeight = bold ? 15 : 12;

      if (highlight) {
        doc
          .rect(
            rightX,
            taxY - 2,
            rightWidth,
            rowHeight
          )
          .fill(LIGHT_GREEN);
      }

      doc
        .font(bold ? "Helvetica-Bold" : "Helvetica")
        .fontSize(bold ? 8.5 : 7.7)
        .fillColor("black")
        .text(
          label,
          rightX + 4,
          taxY,
          { width: rightWidth * 0.62 - 6 }
        );

      doc.text(
        value,
        rightX + rightWidth * 0.62,
        taxY,
        {
          width: rightWidth * 0.38 - 4,
          align: "right",
        }
      );

      taxY += rowHeight;
    };

    taxRow("Total Amount Before Tax", money(subtotal));
    taxRow("Discount", "0.00");
    taxRow("Taxable Amount", money(subtotal));

    cgstGroups.forEach(([rate, amount]) => {
      taxRow("CGST (%)", String(rate));
      taxRow("CGST Amount", money(amount));
    });

    sgstGroups.forEach(([rate, amount]) => {
      taxRow("SGST (%)", String(rate));
      taxRow("SGST Amount", money(amount));
    });

    igstGroups.forEach(([rate, amount]) => {
      taxRow("IGST (%)", String(rate));
      taxRow("IGST Amount", money(amount));
    });

    taxRow("Round Off", money(roundOff));

    taxRow(
      "Total Invoice Amount",
      money(bill.totalAmount),
      {
        bold: true,
        highlight: true,
      }
    );

    doc
      .rect(
        rightX,
        summaryTop - 2,
        rightWidth,
        taxY - summaryTop + 2
      )
      .strokeColor(BORDER)
      .lineWidth(0.5)
      .stroke();

    doc.x = left;
    doc.y = Math.max(leftY, taxY) + 12;

    // ---------- Terms & Conditions ----------
    const terms = Array.isArray(company?.termsAndConditions)
      ? company.termsAndConditions.filter(Boolean)
      : [];

    if (terms.length) {
      if (doc.y > bottomLimit - 85) {
        doc.addPage();
        doc.y = doc.page.margins.top;
      }

      const tcTop = doc.y;
      const pad = 6;

      doc
        .font("Helvetica-Bold")
        .fontSize(8.5)
        .fillColor(GREEN)
        .text(
          "TERMS & CONDITIONS",
          left + pad,
          tcTop + pad,
          { width: pageWidth - pad * 2 }
        );

      doc
        .moveTo(left + pad, tcTop + 20)
        .lineTo(right - pad, tcTop + 20)
        .strokeColor(BORDER)
        .lineWidth(0.5)
        .stroke();

      let y = tcTop + 25;

      terms.forEach((term, index) => {
        const line = `${index + 1}. ${term}`;

        const height = doc.heightOfString(line, {
          width: pageWidth - pad * 2,
        });

        if (y + height > bottomLimit - 30) {
          doc.addPage();
          y = doc.page.margins.top;
        }

        doc
          .font("Helvetica")
          .fontSize(7.8)
          .fillColor("black")
          .text(
            line,
            left + pad,
            y,
            { width: pageWidth - pad * 2 }
          );

        y += height + 2;
      });

      doc
        .rect(
          left,
          tcTop,
          pageWidth,
          y + pad - tcTop
        )
        .strokeColor(BORDER)
        .lineWidth(0.5)
        .stroke();

      doc.x = left;
      doc.y = y + pad + 10;
    }

    // ---------- Authorized Signatory ----------
    if (doc.y > bottomLimit - 45) {
      doc.addPage();
      doc.y = doc.page.margins.top;
    }

    const signatureWidth = 165;
    const signatureX = right - signatureWidth;
    const signatureY = doc.y;

    doc
      .font("Helvetica-Bold")
      .fontSize(8)
      .fillColor("black")
      .text(
        `For ${company?.name || "SUNRISE FOAM INDUSTRIES"}`,
        signatureX,
        signatureY,
        {
          width: signatureWidth,
          align: "center",
        }
      );

    doc
      .moveTo(signatureX, signatureY + 26)
      .lineTo(right, signatureY + 26)
      .strokeColor(BORDER)
      .lineWidth(0.5)
      .stroke();

    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor("black")
      .text(
        "Authorized Signatory",
        signatureX,
        signatureY + 30,
        {
          width: signatureWidth,
          align: "center",
        }
      );

    // ---------- Green Footer ----------
    let footerY =
      doc.page.height -
      doc.page.margins.bottom -
      20;

    if (doc.y > footerY - 5) {
      doc.addPage();

      footerY =
        doc.page.height -
        doc.page.margins.bottom -
        20;
    }

    doc
      .rect(left, footerY, pageWidth, 20)
      .fill(GREEN);

    doc
      .fillColor("white")
      .font("Helvetica-Bold")
      .fontSize(9)
      .text(
        "Thank You For Your Business!",
        left,
        footerY + 5,
        {
          width: pageWidth,
          align: "center",
        }
      );

    doc.end();
  });
};


module.exports = { generateSalarySlipPDF, generateVoucherReceiptPDF, generateSalesInvoicePDF, generateDispatchInvoicePDF };
