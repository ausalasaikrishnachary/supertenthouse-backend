// backend/routes/invoiceRoutes.js
const express = require('express');
const fs = require('fs');
const router = express.Router();
const puppeteer = require('puppeteer');
const db = require('../db');
const orderReader = require('../middleware/orderReader');
const { loadInvoice, escapeInvoice } = require('../services/invoiceData');

const INVOICE_SOURCES = {
  customer: { table: 'orders', prefix: 'CUS' },
  admin: { table: 'admin_orders', prefix: 'ADM' },
  salesman: { table: 'salesman_orders', prefix: 'SAL' }
};

function normalizeOrderSource(orderSource) {
  const normalized = String(orderSource || 'customer').toLowerCase();
  return INVOICE_SOURCES[normalized] ? normalized : 'customer';
}

function formatInvoiceNumber(source, sequence) {
  const year = new Date().getFullYear();
  const prefix = INVOICE_SOURCES[source].prefix;
  return `INV-${prefix}-${year}-${String(sequence).padStart(6, '0')}`;
}

async function getNextInvoiceSequence() {
  const year = new Date().getFullYear();
  const likePattern = `INV-%-${year}-%`;
  const [customerRows] = await db.promise().query(
    'SELECT invoice_number FROM orders WHERE invoice_number LIKE ?',
    [likePattern]
  );
  const [adminRows] = await db.promise().query(
    'SELECT invoice_number FROM admin_orders WHERE invoice_number LIKE ?',
    [likePattern]
  );
  const [salesmanRows] = await db.promise().query(
    'SELECT invoice_number FROM salesman_orders WHERE invoice_number LIKE ?',
    [likePattern]
  );

  const usedSequences = new Set(
    [...customerRows, ...adminRows, ...salesmanRows]
      .map(row => String(row.invoice_number || '').match(/^INV-(CUS|ADM|SAL)-\d{4}-(\d+)$/))
      .filter(Boolean)
      .map(match => Number(match[2]))
      .filter(Number.isFinite)
  );

  let sequence = usedSequences.size + 1;
  while (usedSequences.has(sequence)) {
    sequence += 1;
  }

  return sequence;
}

const { getOrCreateInvoiceNumber } = require('../services/invoiceNumbers');

function getBrowserExecutablePath() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }

  if (process.platform !== 'win32') {
    return undefined;
  }

  const windowsBrowserPaths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
  ];

  return windowsBrowserPaths.find(browserPath => fs.existsSync(browserPath));
}

// ─── Generate PDF Invoice ─────────────────────────────────────────────────────
router.post('/generate-pdf', orderReader, async (req, res) => {
  let browser;

  try {
    const { orderData } = req.body;
    
    if (!orderData) {
      return res.status(400).json({
        success: false,
        message: 'Order data is required'
      });
    }
    const invoiceOrderData = await loadInvoice(db.promise(), orderData, req.orderCustomerId);
    const invoiceNumber = invoiceOrderData.invoiceNumber;
    
    // Generate HTML invoice
    const htmlContent = generateInvoiceHTML(escapeInvoice(invoiceOrderData));
    
    // Launch puppeteer and generate PDF
    const executablePath = getBrowserExecutablePath();
    browser = await puppeteer.launch({
      headless: true,
      ...(executablePath ? { executablePath } : {}),
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    
    const page = await browser.newPage();
    await page.setJavaScriptEnabled(false);
    await page.setRequestInterception(true);
    page.on('request', request => request.abort());
    await page.setContent(htmlContent, {
      waitUntil: 'networkidle0'
    });
    
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '20px',
        bottom: '20px',
        left: '20px',
        right: '20px'
      }
    });
    
    // Send PDF as response
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Invoice_${invoiceNumber.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf"`);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Length', pdf.length);
    res.send(pdf);
    
  } catch (error) {
    console.error('Error generating PDF:', error);
    res.status(error.status || 500).json({
      success: false,
      message: error.status ? error.message : 'Failed to generate PDF'
    });
  } finally {
    if (browser) {
      await browser.close().catch(closeError => {
        console.error('Error closing invoice browser:', closeError);
      });
    }
  }
});

// ─── Generate Invoice HTML ──────────────────────────────────────────────────
function generateInvoiceHTML(order) {
  const now = new Date();
  const invoiceDate = now.toLocaleDateString('en-IN', { 
    day: 'numeric', 
    month: 'long', 
    year: 'numeric' 
  });
  const invoiceTime = now.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });

  const items = Array.isArray(order.items) ? order.items : [];
  
  // ─── FIX: Properly format the event date ──────────────────────────────────
  let eventDateFormatted = 'N/A';
  if (order.eventDate) {
    try {
      const eventDate = new Date(order.eventDate);
      if (!isNaN(eventDate.getTime())) {
        eventDateFormatted = eventDate.toLocaleDateString('en-IN', { 
          day: 'numeric', 
          month: 'long', 
          year: 'numeric' 
        });
      } else {
        eventDateFormatted = order.eventDate;
      }
    } catch (e) {
      eventDateFormatted = order.eventDate;
    }
  }
  
  console.log('📄 Event Date formatted:', eventDateFormatted);
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Invoice #${order.invoiceNumber || order.orderNumber || order.id}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          background: #ffffff;
          padding: 0;
          margin: 0;
          color: #1a1a2e;
        }
        .invoice-container {
          max-width: 900px;
          margin: 0 auto;
          background: #ffffff;
          overflow: hidden;
        }
        .invoice-header {
          background: linear-gradient(135deg, #0c2d67 0%, #1a4a8a 100%);
          padding: 40px 50px;
          color: white;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .invoice-header h1 { font-size: 28px; font-weight: 700; letter-spacing: -0.5px; }
        .invoice-header .subtitle { font-size: 14px; opacity: 0.8; margin-top: 4px; }
        .invoice-number { text-align: right; }
        .invoice-number .number { font-size: 22px; font-weight: 700; letter-spacing: 1px; }
        .invoice-number .date { font-size: 13px; opacity: 0.8; margin-top: 4px; }
        .invoice-body { padding: 40px 50px; }
        .company-info {
          display: flex;
          justify-content: space-between;
          margin-bottom: 30px;
          padding-bottom: 20px;
          border-bottom: 2px solid #f0f0f0;
        }
        .company-info .company-name { font-size: 18px; font-weight: 700; color: #0c2d67; }
        .company-info .company-details { font-size: 13px; color: #666; line-height: 1.6; margin-top: 4px; }
        .customer-info {
          display: flex;
          justify-content: space-between;
          margin-bottom: 30px;
          padding: 20px;
          background: #f8f9fa;
          border-radius: 12px;
        }
        .customer-info .label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #888; margin-bottom: 4px; }
        .customer-info .value { font-size: 15px; font-weight: 500; color: #1a1a2e; }
        .event-details {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
          margin-bottom: 30px;
          padding: 16px 20px;
          background: #f8f9fa;
          border-radius: 12px;
        }
        .event-details .item .label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #888; margin-bottom: 2px; }
        .event-details .item .value { font-size: 14px; font-weight: 500; color: #1a1a2e; }
        .event-details .item.span-full { grid-column: span 3; }
        .items-table {
          width: 100%;
          border-collapse: collapse;
          margin: 20px 0 25px;
        }
        .items-table th {
          background: #f8f9fa;
          text-align: left;
          padding: 12px 16px;
          font-size: 12px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: #666;
          border-bottom: 2px solid #e9ecef;
        }
        .items-table td {
          padding: 14px 16px;
          border-bottom: 1px solid #f0f0f0;
          font-size: 14px;
        }
        .items-table .item-name { font-weight: 500; }
        .items-table .item-total { font-weight: 600; color: #0c2d67; }
        .summary {
          margin-top: 25px;
          padding-top: 20px;
          border-top: 2px solid #f0f0f0;
        }
        .summary-row {
          display: flex;
          justify-content: space-between;
          padding: 6px 0;
          font-size: 14px;
        }
        .summary-row .label { color: #666; }
        .summary-row .value { font-weight: 500; color: #1a1a2e; }
        .summary-row.total {
          margin-top: 10px;
          padding-top: 12px;
          border-top: 2px solid #0c2d67;
          font-size: 18px;
        }
        .summary-row.total .label { font-weight: 700; color: #0c2d67; }
        .summary-row.total .value { font-weight: 700; color: #0c2d67; }
        .coupon-info {
          margin-top: 12px;
          padding: 10px 16px;
          background: #e8f5e9;
          border-radius: 8px;
          font-size: 13px;
          color: #2e7d32;
        }
        .payment-info {
          display: flex;
          justify-content: space-between;
          margin-top: 25px;
          padding: 16px 20px;
          background: #f8f9fa;
          border-radius: 12px;
          font-size: 13px;
        }
        .payment-info .label { color: #666; }
        .payment-info .value { font-weight: 600; }
        .payment-info .status-paid { color: #2e7d32; }
        .payment-info .status-pending { color: #f57c00; }
        .payment-info .status-failed { color: #c62828; }
        .footer {
          margin-top: 30px;
          padding-top: 20px;
          border-top: 1px solid #f0f0f0;
          text-align: center;
          font-size: 12px;
          color: #999;
        }
        .footer .thankyou {
          font-size: 16px;
          font-weight: 600;
          color: #0c2d67;
          margin-bottom: 4px;
        }
        @media print {
          body { background: white; padding: 0; }
          .invoice-container { box-shadow: none; border-radius: 0; }
          .invoice-header { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .items-table th { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        @media (max-width: 600px) {
          .invoice-header { flex-direction: column; text-align: center; padding: 30px 20px; }
          .invoice-number { text-align: center; margin-top: 12px; }
          .invoice-body { padding: 20px; }
          .company-info { flex-direction: column; text-align: center; }
          .customer-info { flex-direction: column; gap: 12px; }
          .event-details { grid-template-columns: 1fr; }
          .items-table { font-size: 12px; }
          .payment-info { flex-direction: column; gap: 8px; }
        }
      </style>
    </head>
    <body>
      <div class="invoice-container">
        <div class="invoice-header">
          <div>
            <h1>INVOICE</h1>
            <div class="subtitle">Event Management Services</div>
          </div>
          <div class="invoice-number">
            <div style="font-size: 12px; opacity: 0.85; text-transform: uppercase; letter-spacing: 0.5px;">Invoice No</div>
            <div class="number">#${order.invoiceNumber || order.invoice_number || order.orderNumber || order.id}</div>
            <div style="font-size: 12px; opacity: 0.85; margin-top: 6px;">Order No: ${order.orderNumber || order.id}</div>
            <div class="date">${invoiceDate} • ${invoiceTime}</div>
          </div>
        </div>
        <div class="invoice-body">
          <div class="company-info">
            <div style="text-align: right;">
              <div style="font-size: 12px; color: #666;">Invoice Date</div>
              <div style="font-size: 14px; font-weight: 500;">${invoiceDate}</div>
            </div>
          </div>

          <div class="customer-info">
            <div>
              <div class="label">Customer</div>
              <div class="value">${order.customerName || 'N/A'}</div>
              <div style="font-size: 13px; color: #666; margin-top: 2px;">${order.customerEmail || 'N/A'}</div>
              <div style="font-size: 13px; color: #666;">${order.customerPhone || 'N/A'}</div>
            </div>
            <div>
              <div class="label">Delivery Address</div>
              <div class="value">${order.address?.fullName || 'N/A'}</div>
              <div style="font-size: 13px; color: #666; margin-top: 2px;">${order.address?.line1 || ''}</div>
              ${order.address?.line2 ? `<div style="font-size: 13px; color: #666;">${order.address.line2}</div>` : ''}
              <div style="font-size: 13px; color: #666;">${order.address?.city || ''}, ${order.address?.state || ''} - ${order.address?.pincode || ''}</div>
              <div style="font-size: 13px; color: #666;">${order.address?.country || 'India'}</div>
            </div>
          </div>

        

          <table class="items-table">
            <thead>
              <tr>
                <th style="width: 50%;">Item</th>
                <th style="width: 15%; text-align: center;">Qty</th>
                <th style="width: 20%; text-align: right;">Price</th>
                <th style="width: 15%; text-align: right;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${items.length > 0 ? items.map(item => `
                <tr>
                  <td class="item-name">${item.name || 'Item'}</td>
                  <td style="text-align: center;">${item.quantity || 0}</td>
                  <td style="text-align: right;">₹${(item.price || 0).toLocaleString('en-IN')}</td>
                  <td style="text-align: right; font-weight: 600;">₹${(item.total || (item.price || 0) * (item.quantity || 0)).toLocaleString('en-IN')}</td>
                </tr>
              `).join('') : `
                <tr>
                  <td colspan="4" style="text-align: center; padding: 20px; color: #999;">No items found</td>
                </tr>
              `}
            </tbody>
          </table>

          <div class="summary">
            <div class="summary-row">
              <span class="label">Subtotal</span>
              <span class="value">₹${(order.subtotal || 0).toLocaleString('en-IN')}</span>
            </div>
            ${(order.couponDiscount || 0) > 0 ? `
              <div class="summary-row">
                <span class="label">Discount (${order.couponCode || 'Coupon'})</span>
                <span class="value" style="color: #2e7d32;">-₹${(order.couponDiscount || 0).toLocaleString('en-IN')}</span>
              </div>
            ` : ''}
            <div class="summary-row total">
              <span class="label">Grand Total</span>
              <span class="value">₹${(order.grandTotal || 0).toLocaleString('en-IN')}</span>
            </div>
          </div>

          <div class="payment-info">
            <div>
              <span class="label">Payment Status: </span>
              <span class="value status-${(order.paymentStatus || 'PENDING').toLowerCase()}">${(order.paymentStatus || 'PENDING').toUpperCase()}</span>
            </div>
          </div>

          <div class="footer">
            <div class="thankyou">Thank You for Your Order!</div>
            <div>This is a system-generated invoice. For any queries, please contact our support team.</div>
            <div style="margin-top: 8px; font-size: 11px; color: #bbb;">www.iiqbets.com</div>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
}

router.getOrCreateInvoiceNumber = getOrCreateInvoiceNumber;
router.getNextInvoiceSequence = getNextInvoiceSequence;
module.exports = router;
