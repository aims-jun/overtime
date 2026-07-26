import crypto from 'node:crypto';
import http from 'node:http';
import { existsSync, readFileSync } from 'node:fs';

const DEFAULT_ENV_FILE =
  '/Users/jun/Library/Mobile Documents/com~apple~CloudDocs/아웃백쀼/coupang_api_sync/.env';
const COUPANG_HOST = 'https://api-gateway.coupang.com';
const PORT = Number(process.env.COUPANG_LEDGER_API_PORT || 8787);

loadEnv(process.env.COUPANG_LEDGER_ENV || DEFAULT_ENV_FILE);

const accessKey = requiredEnv('COUPANG_ACCESS_KEY');
const secretKey = requiredEnv('COUPANG_SECRET_KEY');
const vendorId = requiredEnv('COUPANG_VENDOR_ID');
const spreadsheetId = process.env.SPREADSHEET_ID || '1QUGLygOmgjwWMv1Sd1FdlryPWYr4HVu99_tlRS0g5d8';
const googleServiceAccountFile = process.env.GOOGLE_SERVICE_ACCOUNT_FILE || '';

const ORDER_RAW_SHEET = 'API_RAW_주문';
const DAILY_INPUT_SHEET = '13_일일판매입력';
const PRODUCT_SHEET = '03_등록상품';
const ORDER_RAW_HEADER = [
  'sync_key',
  'paid_date',
  'paid_at',
  'order_id',
  'option_id',
  'sku_id',
  'product_name',
  'quantity',
  'unit_sales_price',
  'sales_amount',
  'currency',
  'synced_at',
];

function loadEnv(path) {
  const text = readFileSync(path, 'utf8');
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const [key, ...rest] = line.split('=');
    process.env[key.trim()] ||= rest.join('=').trim().replace(/^['"]|['"]$/g, '');
  }
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

class GoogleSheetsClient {
  constructor(serviceAccountFile, targetSpreadsheetId) {
    if (!serviceAccountFile || serviceAccountFile.includes('/absolute/path/')) {
      throw new Error('GOOGLE_SERVICE_ACCOUNT_FILE is not configured.');
    }
    if (!existsSync(serviceAccountFile)) {
      throw new Error(`Google service account file not found: ${serviceAccountFile}`);
    }
    this.serviceAccount = JSON.parse(readFileSync(serviceAccountFile, 'utf8'));
    this.spreadsheetId = targetSpreadsheetId;
    this.tokenValue = '';
    this.tokenExpiresAt = 0;
  }

  async token() {
    if (this.tokenValue && Date.now() < this.tokenExpiresAt - 60000) return this.tokenValue;
    const now = Math.floor(Date.now() / 1000);
    const header = { alg: 'RS256', typ: 'JWT' };
    const claims = {
      iss: this.serviceAccount.client_email,
      scope: 'https://www.googleapis.com/auth/spreadsheets',
      aud: this.serviceAccount.token_uri,
      iat: now,
      exp: now + 3600,
    };
    const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`;
    const signature = crypto.sign('RSA-SHA256', Buffer.from(signingInput), this.serviceAccount.private_key);
    const assertion = `${signingInput}.${signature.toString('base64url')}`;
    const response = await fetch(this.serviceAccount.token_uri, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(`Google token error: ${JSON.stringify(payload)}`);
    this.tokenValue = payload.access_token;
    this.tokenExpiresAt = Date.now() + Number(payload.expires_in || 3600) * 1000;
    return this.tokenValue;
  }

  async request(suffix, options = {}) {
    const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}${suffix}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${await this.token()}`,
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });
    const text = await response.text();
    const payload = text ? JSON.parse(text) : {};
    if (!response.ok) throw new Error(`Google Sheets ${response.status}: ${JSON.stringify(payload)}`);
    return payload;
  }

  async getValues(range) {
    const encoded = encodeURIComponent(range);
    const payload = await this.request(`/values/${encoded}?valueRenderOption=UNFORMATTED_VALUE`);
    return payload.values || [];
  }

  async updateValues(range, rows) {
    const encoded = encodeURIComponent(range);
    return this.request(`/values/${encoded}?valueInputOption=USER_ENTERED`, {
      method: 'PUT',
      body: JSON.stringify({ majorDimension: 'ROWS', values: rows }),
    });
  }

  async appendValues(range, rows) {
    if (!rows.length) return { updates: { updatedRows: 0 } };
    const encoded = encodeURIComponent(range);
    return this.request(`/values/${encoded}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
      method: 'POST',
      body: JSON.stringify({ majorDimension: 'ROWS', values: rows }),
    });
  }

  async batchUpdate(requests) {
    return this.request(':batchUpdate', {
      method: 'POST',
      body: JSON.stringify({ requests }),
    });
  }

  async metadata() {
    return this.request('?fields=sheets.properties');
  }

  async ensureSheet(title, header) {
    const metadata = await this.metadata();
    const titles = new Set((metadata.sheets || []).map((sheet) => sheet.properties.title));
    if (!titles.has(title)) {
      await this.batchUpdate([
        {
          addSheet: {
            properties: {
              title,
              gridProperties: { rowCount: 1000, columnCount: Math.max(header.length, 12) },
            },
          },
        },
      ]);
    }
    const currentHeader = await this.getValues(`${title}!A1:${columnLetter(header.length)}1`);
    if (!currentHeader.length || JSON.stringify(currentHeader[0]) !== JSON.stringify(header)) {
      await this.updateValues(`${title}!A1:${columnLetter(header.length)}1`, [header]);
    }
  }

  async existingKeys(sheet, column, startRow = 2) {
    const values = await this.getValues(`${sheet}!${column}${startRow}:${column}`);
    return new Set(values.filter((row) => row[0]).map((row) => String(row[0])));
  }
}

function columnLetter(index1Based) {
  let index = index1Based;
  let letters = '';
  while (index > 0) {
    const remainder = (index - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    index = Math.floor((index - 1) / 26);
  }
  return letters;
}

function coupangAuth(method, path, query) {
  const signedDate = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z').slice(2);
  const message = `${signedDate}${method}${path}${query}`;
  const signature = crypto.createHmac('sha256', secretKey).update(message).digest('hex');
  return `CEA algorithm=HmacSHA256, access-key=${accessKey}, signed-date=${signedDate}, signature=${signature}`;
}

async function coupangGet(path, params) {
  const query = new URLSearchParams(params).toString();
  const response = await fetch(`${COUPANG_HOST}${path}?${query}`, {
    headers: {
      Authorization: coupangAuth('GET', path, query),
      'Content-Type': 'application/json;charset=UTF-8',
    },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Coupang ${response.status}: ${text}`);
  }
  return text ? JSON.parse(text) : {};
}

async function fetchOrders(paidFrom, paidTo) {
  const path = `/v2/providers/rg_open_api/apis/api/v1/vendors/${vendorId}/rg/orders`;
  const orders = [];
  let nextToken = '';
  do {
    const payload = await coupangGet(path, {
      paidDateFrom: paidFrom,
      paidDateTo: paidTo,
      ...(nextToken ? { nextToken } : {}),
    });
    orders.push(...(payload.data || []));
    nextToken = payload.nextToken || '';
  } while (nextToken);
  return orders;
}

function toKoreanDate(ms) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(Number(ms)));
}

function flattenOrders(orders) {
  return orders.flatMap((order) =>
    (order.orderItems || []).map((item, index) => {
      const quantity = Number(item.salesQuantity || 0);
      const unitSalesPrice = Number(item.unitSalesPrice || item.salesPrice || 0);
      return {
        syncKey: `ORDER:${order.orderId}:${item.vendorItemId}:${index}`,
        date: toKoreanDate(order.paidAt),
        paidAt: order.paidAt,
        orderId: String(order.orderId),
        optionId: String(item.vendorItemId),
        productName: item.productName || '',
        quantity,
        unitSalesPrice,
        revenue: Math.round(quantity * unitSalesPrice),
        currency: item.currency || 'KRW',
      };
    }),
  );
}

async function loadOptionSkuMap(sheets) {
  const values = await sheets.getValues(`${PRODUCT_SHEET}!A5:C1000`);
  const map = new Map();
  for (const row of values.slice(1)) {
    const optionId = row[1] ? String(row[1]) : '';
    const skuId = row[2] ? String(row[2]) : '';
    if (optionId && skuId) map.set(optionId, skuId);
  }
  return map;
}

function toSheetRows(orderRows, optionSkuMap) {
  const syncedAt = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' });
  const rawRows = [];
  const dailyRows = [];

  for (const row of orderRows) {
    const skuId = optionSkuMap.get(row.optionId) || `옵션:${row.optionId}`;
    const unmapped = optionSkuMap.has(row.optionId) ? '' : ':UNMAPPED_OPTION';
    rawRows.push([
      row.syncKey,
      row.date,
      String(row.paidAt),
      row.orderId,
      row.optionId,
      skuId,
      row.productName,
      row.quantity,
      row.unitSalesPrice,
      row.revenue,
      row.currency,
      syncedAt,
    ]);
    dailyRows.push([
      row.date,
      skuId,
      '',
      row.quantity,
      row.revenue,
      0,
      `API_ORDER:${row.orderId}:${row.optionId}${unmapped}`,
    ]);
  }

  return { rawRows, dailyRows };
}

async function syncOrdersToSheets(orderRows) {
  const sheets = new GoogleSheetsClient(googleServiceAccountFile, spreadsheetId);
  await sheets.ensureSheet(ORDER_RAW_SHEET, ORDER_RAW_HEADER);
  const optionSkuMap = await loadOptionSkuMap(sheets);
  const { rawRows, dailyRows } = toSheetRows(orderRows, optionSkuMap);

  const existingRawKeys = await sheets.existingKeys(ORDER_RAW_SHEET, 'A', 2);
  const existingDailyMemos = await sheets.existingKeys(DAILY_INPUT_SHEET, 'G', 6);
  const newRawRows = rawRows.filter((row) => !existingRawKeys.has(String(row[0])));
  const newDailyRows = dailyRows.filter((row) => !existingDailyMemos.has(String(row[6])));

  await sheets.appendValues(`${ORDER_RAW_SHEET}!A:L`, newRawRows);
  await sheets.appendValues(`${DAILY_INPUT_SHEET}!A:G`, newDailyRows);

  return {
    enabled: true,
    rawInserted: newRawRows.length,
    dailyInserted: newDailyRows.length,
    unmappedOptions: rawRows.filter((row) => String(row[5]).startsWith('옵션:')).length,
  };
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': 'http://127.0.0.1:5174',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  if (!req.url) return sendJson(res, 404, { error: 'Not found' });
  if (req.method === 'OPTIONS') return sendJson(res, 204, {});

  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === '/api/health') {
      return sendJson(res, 200, {
        ok: true,
        vendorId,
        source: 'coupang-proxy',
        googleSheetsConfigured:
          Boolean(googleServiceAccountFile) &&
          !googleServiceAccountFile.includes('/absolute/path/') &&
          existsSync(googleServiceAccountFile),
      });
    }
    if (url.pathname === '/api/orders' || url.pathname === '/api/orders/sync') {
      const from = url.searchParams.get('from');
      const to = url.searchParams.get('to');
      if (!from || !to) return sendJson(res, 400, { error: 'from and to are required. Use YYYYMMDD.' });
      const orders = await fetchOrders(from, to);
      const rows = flattenOrders(orders);
      let sheetWrite = { enabled: false, message: 'GET 조회입니다. 시트 저장은 /api/orders/sync POST를 사용하세요.' };
      if (url.pathname === '/api/orders/sync') {
        if (req.method !== 'POST') return sendJson(res, 405, { error: 'Use POST for /api/orders/sync.' });
        try {
          sheetWrite = await syncOrdersToSheets(rows);
        } catch (error) {
          sheetWrite = {
            enabled: false,
            message: error instanceof Error ? error.message : 'Google Sheets write failed.',
          };
        }
      }
      return sendJson(res, 200, {
        vendorId,
        from,
        to,
        orderCount: orders.length,
        rows,
        sheetWrite,
        syncedAt: new Date().toISOString(),
      });
    }
    return sendJson(res, 404, { error: 'Not found' });
  } catch (error) {
    return sendJson(res, 500, { error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Coupang proxy listening on http://127.0.0.1:${PORT}`);
});
