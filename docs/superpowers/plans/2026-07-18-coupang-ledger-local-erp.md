# Coupang Ledger Local ERP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static Coupang ledger prototype with a local SQLite-backed ERP whose manual inputs persist, whose Coupang order, revenue, refund, and settlement sync is deduplicated, and whose dashboard calculates real operating results from stored data.

**Architecture:** The React client talks only to a local Node HTTP API. The server owns validation, SQLite repositories, Coupang synchronization, and profit aggregation; direct SQL stays inside repository modules so a later PostgreSQL adapter can replace SQLite without changing routes or UI. Existing Google Sheets-derived constants are imported once through an idempotent seed module and are no longer read by the client.

**Tech Stack:** React 19, TypeScript 6, Vite 8, Node 22, better-sqlite3, Vitest, Testing Library, Tailwind CSS, shadcn/ui component patterns, Lucide React.

## Global Constraints

- The app runs on one Mac for one user and stores its source of truth in one local SQLite file.
- Google Sheets is used only as the source of the initial imported snapshot; there is no continuous Sheets sync, backup, or export.
- Store all KRW amounts as integers and preserve both source timestamps and Korean business dates for API rows.
- Keep direct SQL inside `server/repositories/`; UI and HTTP route code must not contain SQL.
- Do not create placeholder SKUs for unknown Coupang option IDs; expose them as unmapped work items.
- Use Coupang revenue history for SALE/REFUND, service fee, fee VAT, and item settlement amounts; use settlement histories for monthly payout schedules.
- Do not estimate API-unavailable Growth costs such as return additional delivery fees; store them only from an imported Coupang report or direct input with its source.
- Use Tailwind CSS, shadcn/ui component patterns, and Lucide icons; remove hand-authored SVG paths.
- Keep the interface dense and operational, with fixed control heights, right-aligned numeric cells, explicit empty/loading/error states, and no decorative nested cards.
- Validate desktop and mobile layouts for clipping, overlap, unnecessary whitespace, and horizontal overflow.

---

### Task 1: SQLite foundation and initial ledger import

**Files:**
- Modify: `apps/coupang-ledger/package.json`
- Create: `apps/coupang-ledger/server/db.mjs`
- Create: `apps/coupang-ledger/server/schema.mjs`
- Create: `apps/coupang-ledger/server/repositories/ledger-repository.mjs`
- Create: `apps/coupang-ledger/server/seed/ledger-snapshot.mjs`
- Create: `apps/coupang-ledger/server/seed/import-ledger-snapshot.mjs`
- Create: `apps/coupang-ledger/server/db.test.mjs`
- Modify: `apps/coupang-ledger/.gitignore`

**Interfaces:**
- Produces: `openDatabase(path): Database`, `migrate(db): void`, `createLedgerRepository(db): LedgerRepository`, and `importLedgerSnapshot(repository, snapshot): ImportResult`.
- `LedgerRepository` exposes transaction-safe create/list methods for sourcing candidates, product options, purchase batches, purchase items, and expenses.

- [ ] **Step 1: Add the failing database migration and idempotent import tests**

```js
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { openDatabase } from './db.mjs';
import { migrate } from './schema.mjs';
import { createLedgerRepository } from './repositories/ledger-repository.mjs';
import { importLedgerSnapshot } from './seed/import-ledger-snapshot.mjs';

test('migrate creates every ledger table', () => {
  const db = openDatabase(join(mkdtempSync(join(tmpdir(), 'ledger-')), 'test.sqlite'));
  migrate(db);
  const tables = db.prepare("select name from sqlite_master where type='table'").all().map((row) => row.name);
  expect(tables).toEqual(expect.arrayContaining([
    'sourcing_candidates', 'products', 'product_options', 'purchase_batches',
    'purchase_items', 'expenses', 'api_sync_runs', 'coupang_orders', 'coupang_order_items',
    'coupang_revenue_items', 'coupang_settlements', 'report_imports', 'growth_costs',
  ]));
});

test('initial snapshot import is idempotent', () => {
  const db = openDatabase(':memory:');
  migrate(db);
  const repository = createLedgerRepository(db);
  const snapshot = { sourcingCandidates: [{ sourcingId: 'S-0001', name: '커튼 클립' }], products: [], purchaseLines: [] };
  expect(importLedgerSnapshot(repository, snapshot).sourcingInserted).toBe(1);
  expect(importLedgerSnapshot(repository, snapshot).sourcingInserted).toBe(0);
  expect(repository.listSourcingCandidates()).toHaveLength(1);
});
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `npm test -w apps/coupang-ledger -- server/db.test.mjs`

Expected: FAIL because `db.mjs`, `schema.mjs`, and the repository modules do not exist.

- [ ] **Step 3: Add dependencies, schema, repository, and seed importer**

Add scripts and dependencies:

```json
{
  "scripts": {
    "test": "vitest run",
    "db:seed": "node server/seed/run-seed.mjs"
  },
  "dependencies": {
    "better-sqlite3": "^12.11.1"
  },
  "devDependencies": {
    "vitest": "^4.1.10"
  }
}
```

`openDatabase` must enable foreign keys and WAL for file databases. `migrate` must create all spec tables with unique keys on `sourcing_id`, `(product_id, option_id, sku_id)`, purchase batch name, expense source key, order ID, order item sync key, revenue item sync key, settlement month/type/date, and report row source key. `importLedgerSnapshot` must wrap the full import in one transaction and use `INSERT ... ON CONFLICT DO NOTHING`.

Move the current `ledgerData.ts` snapshot into `server/seed/ledger-snapshot.mjs`; do not import it from the React bundle. Add `.data/` and `*.sqlite*` to the app `.gitignore`.

- [ ] **Step 4: Run the database tests and confirm GREEN**

Run: `npm test -w apps/coupang-ledger -- server/db.test.mjs`

Expected: 2 tests pass with no SQLite errors.

- [ ] **Step 5: Commit the database foundation**

```bash
git add apps/coupang-ledger/package.json apps/coupang-ledger/.gitignore apps/coupang-ledger/server
git commit -m "feat: add sqlite ledger foundation"
```

### Task 2: Manual ledger HTTP API and profit aggregation

**Files:**
- Create: `apps/coupang-ledger/server/validation.mjs`
- Create: `apps/coupang-ledger/server/profit-service.mjs`
- Create: `apps/coupang-ledger/server/routes/ledger-routes.mjs`
- Create: `apps/coupang-ledger/server/test-http.mjs`
- Create: `apps/coupang-ledger/server/profit-service.test.mjs`
- Create: `apps/coupang-ledger/server/routes/ledger-routes.test.mjs`
- Modify: `apps/coupang-ledger/server/coupang-proxy.mjs`

**Interfaces:**
- Consumes: `LedgerRepository` from Task 1.
- Produces: `createLedgerRoutes({ repository, syncOrders }): RequestHandler` and `calculateDashboard(repository, { from, to }): DashboardSummary`.
- HTTP endpoints: `GET/POST/PATCH /api/sourcing`, `GET/POST/PATCH /api/products`, `GET/POST /api/purchase-batches`, `GET/POST /api/expenses`, and `GET /api/dashboard?from=YYYY-MM-DD&to=YYYY-MM-DD`.

- [ ] **Step 1: Write failing allocation and dashboard tests**

```js
test('allocates shared logistics evenly by received quantity', () => {
  const result = allocateBatchCosts({
    logisticsAmount: 70000,
    items: [
      { skuId: 'SKU-A', quantity: 40, purchaseAmount: 80000 },
      { skuId: 'SKU-B', quantity: 60, purchaseAmount: 180000 },
    ],
  });
  expect(result.items[0].allocatedLogistics).toBe(28000);
  expect(result.items[1].allocatedLogistics).toBe(42000);
  expect(result.items.reduce((sum, item) => sum + item.allocatedLogistics, 0)).toBe(70000);
});

test('marks margin pending when a sold SKU has no cost', () => {
  const fakeRepository = ({ sales = [] } = {}) => ({
    listProfitRows: () => sales,
    listExpensesByDate: () => [],
    listRevenueItemsByDate: () => [],
    listSettlementsByMonth: () => [],
  });
  const summary = calculateDashboard(fakeRepository({
    sales: [{ skuId: 'UNKNOWN', quantity: 1, revenue: 9900 }],
  }), { from: '2026-07-01', to: '2026-07-31' });
  expect(summary.marginStatus).toBe('pending_cost');
  expect(summary.unmappedCostCount).toBe(1);
});
```

- [ ] **Step 2: Run the profit tests and confirm RED**

Run: `npm test -w apps/coupang-ledger -- server/profit-service.test.mjs`

Expected: FAIL because `allocateBatchCosts` and `calculateDashboard` are missing.

- [ ] **Step 3: Implement integer allocation and repository-backed dashboard queries**

`allocateBatchCosts` must distribute integer remainders deterministically by input order so allocated logistics always equals the batch total. `calculateDashboard` must return:

```ts
type DashboardSummary = {
  revenue: number;
  soldCost: number | null;
  coupangFees: number;
  advertisingCost: number;
  businessCost: number;
  expectedMargin: number | null;
  confirmedMargin: number | null;
  marginStatus: 'complete' | 'pending_cost' | 'pending_settlement';
  unmappedOptionCount: number;
  unmappedCostCount: number;
};
```

- [ ] **Step 4: Write failing route validation and persistence tests**

```js
test('POST /api/sourcing rejects a blank product name', async () => {
  const testServer = await startTestServer(createLedgerRoutes({ repository }));
  const response = await fetch(`${testServer.baseUrl}/api/sourcing`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: '   ' }),
  });
  const body = await response.json();
  expect(response.status).toBe(400);
  expect(body.fieldErrors.name).toBe('상품명을 입력하세요.');
  await testServer.close();
});

test('POST /api/expenses persists a valid advertising expense', async () => {
  const testServer = await startTestServer(createLedgerRoutes({ repository }));
  const response = await fetch(`${testServer.baseUrl}/api/expenses`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
      date: '2026-07-18', type: 'advertising', amount: 12000, vatMode: 'included', memo: '쿠팡 광고',
    }),
  });
  expect(response.status).toBe(201);
  expect(repository.listExpenses()).toEqual(expect.arrayContaining([expect.objectContaining({ amount: 12000 })]));
  await testServer.close();
});
```

- [ ] **Step 5: Run route tests and confirm RED**

Run: `npm test -w apps/coupang-ledger -- server/routes/ledger-routes.test.mjs`

Expected: FAIL because the ledger routes do not exist.

- [ ] **Step 6: Implement routes and JSON body handling**

Use a shared `readJson(req)` helper with a 1 MB body limit. Return `{ data }` on success and `{ message, fieldErrors }` for validation failures. Batch creation must save the batch and all items in one SQLite transaction. `startTestServer(handler)` must bind an ephemeral `127.0.0.1` port and return `{ baseUrl, close(): Promise<void> }` so route tests exercise real HTTP parsing without Express or Supertest.

- [ ] **Step 7: Run all server tests and commit**

Run: `npm test -w apps/coupang-ledger -- server`

Expected: all server tests pass.

```bash
git add apps/coupang-ledger/server
git commit -m "feat: add manual ledger api and profit calculations"
```

### Task 3: Persist and deduplicate Coupang order, revenue, refund, and settlement synchronization

**Files:**
- Create: `apps/coupang-ledger/server/coupang/order-client.mjs`
- Create: `apps/coupang-ledger/server/coupang/order-sync-service.mjs`
- Create: `apps/coupang-ledger/server/coupang/order-sync-service.test.mjs`
- Create: `apps/coupang-ledger/server/coupang/settlement-client.mjs`
- Create: `apps/coupang-ledger/server/coupang/settlement-sync-service.mjs`
- Create: `apps/coupang-ledger/server/coupang/settlement-sync-service.test.mjs`
- Modify: `apps/coupang-ledger/server/coupang-proxy.mjs`

**Interfaces:**
- Consumes: `LedgerRepository.upsertOrder`, `upsertOrderItem`, `upsertRevenueItem`, `upsertSettlement`, `findOptionByCoupangOptionId`, and `recordSyncRun`.
- Produces: `syncOrders({ from, to }): Promise<SyncResult>`, `syncRevenue({ from, to }): Promise<SyncResult>`, and `syncSettlements({ month }): Promise<SyncResult>`. Each result includes fetched, inserted, duplicate, unmapped, status, and syncedAt counts.

- [ ] **Step 1: Write a failing duplicate and unmapped option test**

```js
test('sync inserts each Coupang item once and reports unknown options', async () => {
  const client = { fetchOrders: async () => [{
    orderId: 100,
    paidAt: 1784300400000,
    orderItems: [{ vendorItemId: 9001, productName: '상품', salesQuantity: 2, unitSalesPrice: 5900 }],
  }] };
  const service = createOrderSyncService({ client, repository });
  const first = await service.syncOrders({ from: '20260701', to: '20260718' });
  const second = await service.syncOrders({ from: '20260701', to: '20260718' });
  expect(first).toMatchObject({ inserted: 1, unmapped: 1 });
  expect(second).toMatchObject({ inserted: 0, duplicate: 1 });
});
```

- [ ] **Step 2: Run the sync test and confirm RED**

Run: `npm test -w apps/coupang-ledger -- server/coupang/order-sync-service.test.mjs`

Expected: FAIL because the sync service does not exist.

- [ ] **Step 3: Extract Coupang signing/fetching and implement DB sync**

The order client keeps HMAC credentials server-side and returns normalized order records. The service creates the item key `ORDER:<orderId>:<vendorItemId>:<itemIndex>`, looks up the option ID without inventing a SKU, inserts in one transaction, and records success or failure in `api_sync_runs`.

Add failing settlement tests before implementation:

```js
test('revenue sync stores SALE and REFUND fees by immutable option ID', async () => {
  const client = { fetchRevenue: async () => [{
    orderId: 100, saleType: 'REFUND', recognitionDate: '2026-07-10',
    items: [{ vendorItemId: 9001, quantity: -1, saleAmount: -9900, serviceFee: -1069, serviceFeeVat: -107, settlementAmount: -8724 }],
  }] };
  const result = await createSettlementSyncService({ client, repository }).syncRevenue({
    from: '2026-07-01', to: '2026-07-31',
  });
  expect(result).toMatchObject({ inserted: 1, refund: 1 });
  expect(repository.listRevenueItems()[0]).toMatchObject({ optionId: '9001', saleType: 'REFUND', serviceFee: -1069 });
});
```

Run: `npm test -w apps/coupang-ledger -- server/coupang/settlement-sync-service.test.mjs`

Expected: FAIL because the settlement sync service does not exist.

Implement revenue pagination against `/v2/providers/openapi/apis/api/v1/revenue-history` for date ranges of at most 31 days and settlement lookup against `/v2/providers/marketplace_openapi/apis/api/v1/settlement-histories` by `YYYY-MM`. Use the immutable `vendorItemId` as the option lookup key. Preserve revenue rows whose `items` array is empty as order-level adjustments requiring review rather than dropping them.

Replace the Google Sheets write branch in `/api/orders/sync` with the new DB sync result. Add `POST /api/revenue/sync?from=YYYY-MM-DD&to=YYYY-MM-DD` and `POST /api/settlements/sync?month=YYYY-MM`. Keep `/api/health` but report `database: 'sqlite'` and last sync timestamps; do not expose secrets or secret file paths.

- [ ] **Step 4: Run all server tests and a live health request**

Run: `npm test -w apps/coupang-ledger -- server`

Expected: order, revenue, refund, and settlement tests all pass.

Run with the API server active: `curl -s http://127.0.0.1:8787/api/health`

Expected: JSON with `ok: true`, `database: "sqlite"`, and no credential values.

- [ ] **Step 5: Commit Coupang persistence**

```bash
git add apps/coupang-ledger/server
git commit -m "feat: persist coupang sales and settlement synchronization"
```

### Task 4: UI foundation with shadcn patterns and Lucide icons

**Files:**
- Modify: `apps/coupang-ledger/package.json`
- Modify: `apps/coupang-ledger/vite.config.ts`
- Modify: `apps/coupang-ledger/src/main.tsx`
- Replace: `apps/coupang-ledger/src/styles.css`
- Create: `apps/coupang-ledger/src/lib/utils.ts`
- Create: `apps/coupang-ledger/src/lib/api.ts`
- Create: `apps/coupang-ledger/src/components/ui/button.tsx`
- Create: `apps/coupang-ledger/src/components/ui/input.tsx`
- Create: `apps/coupang-ledger/src/components/ui/table.tsx`
- Create: `apps/coupang-ledger/src/components/ui/badge.tsx`
- Create: `apps/coupang-ledger/src/components/ui/field.tsx`
- Create: `apps/coupang-ledger/src/components/AppShell.tsx`
- Create: `apps/coupang-ledger/src/components/AppShell.test.tsx`
- Create: `apps/coupang-ledger/src/test/setup.ts`
- Create: `apps/coupang-ledger/src/test/server.ts`

**Interfaces:**
- Produces: reusable `Button`, `Input`, `Table`, `Badge`, `Field`, and `AppShell` components plus typed `api.get/post/patch` helpers.
- `Button` accepts shadcn-style `variant`, `size`, and native button props and centers one Lucide icon with its label.

- [ ] **Step 1: Write a failing button alignment and navigation test**

```tsx
test('renders the API sync command as a compact icon button with label', () => {
  render(<AppShell activeView="dashboard" onNavigate={() => {}} onSync={() => {}} syncing={false}><div /></AppShell>);
  const button = screen.getByRole('button', { name: '쿠팡 API 동기화' });
  expect(button).toHaveClass('inline-flex', 'items-center', 'justify-center');
  expect(within(button).getByTestId('refresh-icon')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the component test and confirm RED**

Run: `npm test -w apps/coupang-ledger -- src/components/AppShell.test.tsx`

Expected: FAIL because `AppShell` and the UI primitives do not exist.

- [ ] **Step 3: Install and configure UI dependencies**

Add `tailwindcss`, `@tailwindcss/vite`, `lucide-react`, `class-variance-authority`, `clsx`, `tailwind-merge`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `msw`, and `jsdom`. Configure the Vite Tailwind plugin and Vitest `jsdom` environment. `src/test/server.ts` exports the shared MSW `setupServer()` instance; `src/test/setup.ts` imports jest-dom, starts it before tests, resets handlers after each test, and closes it after the suite.

Implement the shadcn-style primitives locally so the app owns their source. Use a restrained neutral surface palette with blue for primary commands, green for healthy financial states, amber for pending work, and red only for failures or negative results.

- [ ] **Step 4: Run the component test and build**

Run: `npm test -w apps/coupang-ledger -- src/components/AppShell.test.tsx`

Expected: the component test passes.

Run: `npm run build -w apps/coupang-ledger`

Expected: TypeScript and Vite build exit 0.

- [ ] **Step 5: Commit the UI foundation**

```bash
git add package-lock.json apps/coupang-ledger
git commit -m "feat: add ledger ui foundation"
```

### Task 5: Persistent manual-entry screens

**Files:**
- Create: `apps/coupang-ledger/src/features/sourcing/SourcingPage.tsx`
- Create: `apps/coupang-ledger/src/features/sourcing/SourcingPage.test.tsx`
- Create: `apps/coupang-ledger/src/features/products/ProductsPage.tsx`
- Create: `apps/coupang-ledger/src/features/purchases/PurchasesPage.tsx`
- Create: `apps/coupang-ledger/src/features/expenses/ExpensesPage.tsx`
- Modify: `apps/coupang-ledger/src/App.tsx`
- Delete: `apps/coupang-ledger/src/ledgerData.ts`

**Interfaces:**
- Consumes: Task 2 ledger routes and Task 4 UI primitives.
- Produces: working CRUD pages that reload data from SQLite after every successful mutation.

- [ ] **Step 1: Write a failing sourcing save and reload test**

```tsx
test('saves a sourcing candidate and reloads the list', async () => {
  server.use(
    http.post('/api/sourcing', async ({ request }) => HttpResponse.json({ data: await request.json() }, { status: 201 })),
    http.get('/api/sourcing', () => HttpResponse.json({ data: [{ sourcingId: 'S-0020', name: '새 상품', decision: 'review' }] })),
  );
  render(<SourcingPage />);
  await userEvent.type(screen.getByLabelText('상품명'), '새 상품');
  await userEvent.click(screen.getByRole('button', { name: '소싱 후보 저장' }));
  expect(await screen.findByText('S-0020')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the page test and confirm RED**

Run: `npm test -w apps/coupang-ledger -- src/features/sourcing/SourcingPage.test.tsx`

Expected: FAIL because the feature page does not exist.

- [ ] **Step 3: Implement sourcing, product, purchase, and expense forms**

Each page must show an explicit `직접 입력` source badge. Use compact inline toolbar buttons, field-level errors, disabled save state, success toast, empty state, and table reload after save. The purchase page must let one batch contain multiple item rows and show the exact integer logistics allocation before saving. Expenses must support `advertising`, `parcel`, and `business` types and `included`, `excluded`, and `exempt` VAT modes.

Replace the existing monolithic `App.tsx` static views with routed view state that renders these feature pages. Remove browser imports of `ledgerData.ts` and remove static example sales and settlement rows.

- [ ] **Step 4: Run UI tests and build**

Run: `npm test -w apps/coupang-ledger -- src`

Expected: all client tests pass.

Run: `npm run build -w apps/coupang-ledger`

Expected: build exits 0.

- [ ] **Step 5: Commit the manual-entry screens**

```bash
git add apps/coupang-ledger/src
git commit -m "feat: add persistent ledger entry screens"
```

### Task 6: Live dashboard, sales, sync history, and visual verification

**Files:**
- Create: `apps/coupang-ledger/src/features/dashboard/DashboardPage.tsx`
- Create: `apps/coupang-ledger/src/features/dashboard/DashboardPage.test.tsx`
- Create: `apps/coupang-ledger/src/features/sales/SalesPage.tsx`
- Create: `apps/coupang-ledger/src/features/sync/SyncHistoryPage.tsx`
- Modify: `apps/coupang-ledger/src/App.tsx`
- Modify: `apps/coupang-ledger/src/styles.css`

**Interfaces:**
- Consumes: `GET /api/dashboard`, stored order/revenue/settlement rows, `POST /api/orders/sync`, `POST /api/revenue/sync`, and `POST /api/settlements/sync`.
- Produces: live profit dashboard, stored sales table, sync history, and a compact working synchronization command.

- [ ] **Step 1: Write failing dashboard state tests**

```tsx
test('shows pending cost instead of a false zero margin', async () => {
  server.use(http.get('/api/dashboard', () => HttpResponse.json({ data: {
    revenue: 9900, soldCost: null, coupangFees: 0, advertisingCost: 0,
    businessCost: 0, expectedMargin: null, confirmedMargin: null,
    marginStatus: 'pending_cost', unmappedOptionCount: 0, unmappedCostCount: 1,
  } })));
  render(<DashboardPage month="2026-07" />);
  expect(await screen.findByText('원가 입력 필요')).toBeInTheDocument();
  expect(screen.queryByText('₩0 예상마진')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run the dashboard test and confirm RED**

Run: `npm test -w apps/coupang-ledger -- src/features/dashboard/DashboardPage.test.tsx`

Expected: FAIL because `DashboardPage` does not exist.

- [ ] **Step 3: Implement live dashboard and synchronization views**

The dashboard displays revenue, sold cost, Coupang fees, advertising, business expenses, expected margin, and confirmed margin without duplicating the same summary in another page. KPI blocks link to their source ledgers. The top command bar uses a 40 px compact `Button` with a Lucide `RefreshCw` icon, never a full-width button. Sales and sync pages label their rows `API 자동수집` and show unmapped options as actionable warnings.

- [ ] **Step 4: Run full automated verification**

Run: `npm test -w apps/coupang-ledger`

Expected: all server and client tests pass with zero failures.

Run: `npm run build -w apps/coupang-ledger`

Expected: TypeScript and Vite build exit 0.

- [ ] **Step 5: Verify the running app in the browser**

Start the API and Vite servers. At desktop `1440x900` and mobile `390x844`, verify:

- sidebar and mobile navigation do not overlap content;
- API sync button icon and label are centered in a 40 px control;
- there is no full-width toolbar button or unexplained blank area;
- tables contain no clipped controls and use horizontal scrolling only inside the table wrapper;
- saving a sourcing candidate persists after reload;
- creating a purchase batch shows allocations whose sum equals its logistics amount;
- order, revenue/refund, and settlement synchronization update stored rows and sync history without duplicates.

- [ ] **Step 6: Commit the live dashboard and verified layout**

```bash
git add apps/coupang-ledger
git commit -m "feat: complete local coupang ledger ERP"
```
