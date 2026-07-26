import { useMemo, useState } from 'react';
import { purchaseLines, registeredProducts, sourcingCandidates } from './ledgerData';

type ViewKey = 'dashboard' | 'verify' | 'daily' | 'purchase' | 'products' | 'settlement';

type DailySale = {
  date: string;
  skuId: string;
  optionId?: string;
  orderId?: string;
  productName?: string;
  quantity: number;
  revenue: number;
  adCost: number;
  source: 'API' | '직접입력';
};

type ApiOrderRow = {
  syncKey: string;
  date: string;
  orderId: string;
  optionId: string;
  productName: string;
  quantity: number;
  unitSalesPrice: number;
  revenue: number;
};

type SyncState = {
  status: 'idle' | 'loading' | 'success' | 'error';
  message: string;
  syncedAt?: string;
  orderCount?: number;
  sheetMessage?: string;
};

const dailySales: DailySale[] = [
  { date: '2026-07-14', skuId: '74574384', quantity: 4, revenue: 23600, adCost: 3200, source: 'API' },
  { date: '2026-07-14', skuId: '74574426', quantity: 2, revenue: 21800, adCost: 4400, source: 'API' },
  { date: '2026-07-14', skuId: '75165056', quantity: 1, revenue: 8900, adCost: 1800, source: '직접입력' },
  { date: '2026-07-13', skuId: '75462019', quantity: 7, revenue: 48300, adCost: 5200, source: 'API' },
  { date: '2026-07-13', skuId: '74574384', quantity: -1, revenue: -5900, adCost: 0, source: 'API' },
];

const navItems: { key: ViewKey; label: string; icon: string }[] = [
  { key: 'dashboard', label: '대시보드', icon: 'M4 5h16v4H4z M4 13h7v6H4z M15 13h5v6h-5z' },
  { key: 'verify', label: '상품검증', icon: 'M9 12l2 2 4-5 M4 5h16v14H4z' },
  { key: 'daily', label: '오늘 판매', icon: 'M5 4h14v16H5z M8 8h8 M8 12h8 M8 16h5' },
  { key: 'purchase', label: '입고차수', icon: 'M3 7l9-4 9 4-9 4z M5 10v7l7 4 7-4v-7' },
  { key: 'products', label: '상품', icon: 'M6 5h12l2 5-8 9-8-9z' },
  { key: 'settlement', label: '정산', icon: 'M4 6h16v12H4z M7 10h10 M7 14h6' },
];

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('ko-KR', {
    style: 'currency',
    currency: 'KRW',
    maximumFractionDigits: 0,
  }).format(value);

const formatNumber = (value: number) => new Intl.NumberFormat('ko-KR').format(value);
const formatYmd = (date: Date) =>
  `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;

const findProduct = (skuId: string) => registeredProducts.find((product) => product.skuId === skuId);
const findProductByOptionId = (optionId: string) => registeredProducts.find((product) => product.optionId === optionId);

const verifiedRows = sourcingCandidates.map((candidate) => {
  const registered = registeredProducts.filter((product) => product.sourcingId === candidate.sourcingId);
  const skuCount = registered.filter((product) => product.skuId).length;
  const purchased = purchaseLines.filter((line) => line.sourcingId === candidate.sourcingId);
  const purchaseQuantity = purchased.reduce((sum, line) => sum + line.quantity, 0);
  const hasRegistered = registered.length > 0;
  const hasSku = skuCount > 0;
  const hasPurchase = purchaseQuantity > 0;
  const hasBlankRegistration = registered.some((product) => !product.skuId || !product.optionId || !product.productId);
  const status = !hasRegistered
    ? '등록필요'
    : hasBlankRegistration || !hasSku
      ? 'ID필요'
      : !hasPurchase
        ? '입고필요'
        : candidate.decision === '보류'
          ? '보류'
          : '완료';
  return { candidate, registered, skuCount, purchaseQuantity, status };
});

const batchRows = [...new Set(purchaseLines.map((line) => line.batch))].map((batch) => {
  const lines = purchaseLines.filter((line) => line.batch === batch);
  const quantity = lines.reduce((sum, line) => sum + line.quantity, 0);
  const purchaseAmount = lines.reduce((sum, line) => sum + line.purchaseAmount, 0);
  const logistics = lines.reduce((sum, line) => sum + line.logisticsAmount, 0);
  const totalCost = lines.reduce((sum, line) => sum + line.totalCost, 0);
  return {
    batch,
    date: lines[0]?.date ?? '',
    productCount: new Set(lines.map((line) => line.sourcingId)).size,
    skuCount: lines.length,
    quantity,
    purchaseAmount,
    logistics,
    allocatedPerUnit: quantity ? Math.round(logistics / quantity) : 0,
    totalCost,
  };
});

export function App() {
  const [view, setView] = useState<ViewKey>('dashboard');
  const [adInput, setAdInput] = useState('326182');
  const [batchLogistics, setBatchLogistics] = useState('70000');
  const [selectedMonth, setSelectedMonth] = useState('2026-07');
  const [syncedSales, setSyncedSales] = useState<DailySale[]>([]);
  const [toast, setToast] = useState('');
  const [syncState, setSyncState] = useState<SyncState>({
    status: 'idle',
    message: '쿠팡 API 수동 동기화 대기',
  });

  const activeDailySales = syncedSales.length > 0 ? syncedSales : dailySales;

  const metrics = useMemo(() => {
    const revenue = activeDailySales.reduce((sum, sale) => sum + sale.revenue, 0);
    const soldCost = activeDailySales.reduce((sum, sale) => {
      const product = findProduct(sale.skuId);
      return sum + sale.quantity * (product?.avgCost ?? 0);
    }, 0);
    const adCost = activeDailySales.reduce((sum, sale) => sum + sale.adCost, 0);
    const fee = Math.round(revenue * 0.108);
    const feeVat = Math.round(fee * 0.1);
    const margin = revenue - soldCost - adCost - fee - feeVat;
    const marginRate = revenue ? margin / revenue : 0;
    return { revenue, soldCost, adCost, fee, feeVat, margin, marginRate };
  }, [activeDailySales]);

  async function handleSync() {
    const [year, month] = selectedMonth.split('-');
    const monthStart = new Date(Number(year), Number(month) - 1, 1);
    const monthEnd = new Date(Number(year), Number(month), 0);
    const today = new Date();
    if (monthStart > today) {
      setSyncState({ status: 'error', message: '미래 월은 아직 쿠팡 주문을 조회할 수 없습니다.' });
      return;
    }
    const from = `${year}${month}01`;
    const to = formatYmd(monthEnd > today ? today : monthEnd);
    setSyncState({ status: 'loading', message: `쿠팡 주문 조회 중 · ${from}~${to}` });

    try {
      const response = await fetch(`http://127.0.0.1:8787/api/orders/sync?from=${from}&to=${to}`, {
        method: 'POST',
      });
      const payload: {
        rows: ApiOrderRow[];
        orderCount: number;
        syncedAt: string;
        error?: string;
        sheetWrite?: {
          enabled: boolean;
          message?: string;
          rawInserted?: number;
          dailyInserted?: number;
          unmappedOptions?: number;
        };
      } = await response.json();
      if (!response.ok) throw new Error(payload.error || 'API 동기화 실패');

      const mapped = payload.rows.map((row) => {
        const product = findProductByOptionId(row.optionId);
        return {
          date: row.date,
          skuId: product?.skuId ?? `옵션:${row.optionId}`,
          optionId: row.optionId,
          orderId: row.orderId,
          productName: row.productName,
          quantity: row.quantity,
          revenue: row.revenue,
          adCost: 0,
          source: 'API' as const,
        };
      });

      const sheetMessage = payload.sheetWrite?.enabled
        ? `시트 저장 완료 · 원본 ${payload.sheetWrite.rawInserted ?? 0}행 · 일일판매 ${
            payload.sheetWrite.dailyInserted ?? 0
          }행 · 미매핑 ${payload.sheetWrite.unmappedOptions ?? 0}건`
        : `시트 저장 대기 · ${payload.sheetWrite?.message ?? 'Google Sheets 설정 필요'}`;

      setSyncedSales(mapped);
      setSyncState({
        status: 'success',
        message: `쿠팡 주문 ${payload.orderCount}건 / 상품행 ${mapped.length}개 반영`,
        sheetMessage,
        syncedAt: payload.syncedAt,
        orderCount: payload.orderCount,
      });
    } catch (error) {
      setSyncState({
        status: 'error',
        message: error instanceof Error ? error.message : '알 수 없는 오류',
      });
    }
  }

  function handleAdSave() {
    setToast(`광고비 ${formatCurrency(Number(adInput || 0))} 저장됨`);
    window.setTimeout(() => setToast(''), 2500);
  }

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(''), 2500);
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">A</div>
          <div>
            <strong>아웃츠 운영장부</strong>
            <span>쿠팡그로스 손익 관리</span>
          </div>
        </div>
        <nav className="nav-list" aria-label="주요 화면">
          {navItems.map((item) => (
            <button
              className={view === item.key ? 'nav-item active' : 'nav-item'}
              key={item.key}
              onClick={() => setView(item.key)}
              type="button"
            >
              <SvgIcon path={item.icon} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="sync-panel">
          <span>API 상태</span>
          <strong>{syncState.status === 'success' ? '쿠팡 주문 반영됨' : '쿠팡 주문 연결됨'}</strong>
          <small>{syncState.message}</small>
          {syncState.sheetMessage ? <small>{syncState.sheetMessage}</small> : null}
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Outs ERP · Coupang Growth</p>
            <h1>{titleByView[view]}</h1>
          </div>
          <div className="toolbar">
            <label className="field compact">
              <span>조회월</span>
              <input value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)} type="month" />
            </label>
            <button className="primary-button" type="button" onClick={handleSync} disabled={syncState.status === 'loading'}>
              <SvgIcon path="M5 12h14 M12 5v14" />
              <span>{syncState.status === 'loading' ? '동기화 중' : 'API 동기화'}</span>
            </button>
          </div>
        </header>
        <div className={`sync-banner ${syncState.status}`}>
          <span>{syncState.sheetMessage ? `${syncState.message} · ${syncState.sheetMessage}` : syncState.message}</span>
          {syncState.syncedAt ? <strong>{new Date(syncState.syncedAt).toLocaleString('ko-KR')}</strong> : null}
        </div>
        {toast ? <div className="toast">{toast}</div> : null}

        {view === 'dashboard' && (
          <Dashboard metrics={metrics} sales={activeDailySales} syncState={syncState} onNavigate={setView} />
        )}
        {view === 'verify' && <ProductVerification />}
        {view === 'daily' && (
          <DailySales adInput={adInput} setAdInput={setAdInput} onAdSave={handleAdSave} sales={activeDailySales} />
        )}
        {view === 'purchase' && (
          <PurchaseBatches
            batchLogistics={batchLogistics}
            setBatchLogistics={setBatchLogistics}
            onSave={() => showToast('입고차수 입력은 다음 단계에서 구글시트 저장으로 연결됩니다.')}
          />
        )}
        {view === 'products' && (
          <Products
            onAddProduct={() => {
              setView('verify');
              showToast('신규 상품은 소싱검토 → 등록상품 연결 순서로 추가합니다.');
            }}
          />
        )}
        {view === 'settlement' && <Settlement />}
      </main>
    </div>
  );
}

const titleByView: Record<ViewKey, string> = {
  dashboard: '운영 현황 대시보드',
  verify: '소싱부터 등록·입고까지 상품 검증',
  daily: '매일 판매 입력과 API 주문 확인',
  purchase: '입고차수와 물류비 배분',
  products: 'SKU 기준 상품 관리',
  settlement: '정산 반영과 예상값 비교',
};

function SvgIcon({ path }: { path: string }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}

function Dashboard({
  metrics,
  sales,
  syncState,
  onNavigate,
}: {
  metrics: ReturnType<typeof AppMetrics>;
  sales: DailySale[];
  syncState: SyncState;
  onNavigate: (view: ViewKey) => void;
}) {
  const needsAction = verifiedRows.filter((row) => row.status !== '완료').length;
  const completed = verifiedRows.filter((row) => row.status === '완료').length;
  const needsId = verifiedRows.filter((row) => row.status === 'ID필요').length;
  const needsRegister = verifiedRows.filter((row) => row.status === '등록필요').length;
  const missingPurchase = verifiedRows.filter((row) => row.status === '입고필요').length;
  const purchaseTotal = purchaseLines.reduce((sum, line) => sum + line.totalCost, 0);
  const purchaseQuantity = purchaseLines.reduce((sum, line) => sum + line.quantity, 0);
  const apiOrders = syncState.orderCount ?? sales.length;
  return (
    <section className="erp-dashboard">
      <div className="erp-kpi-row">
        <Metric title="7월 운영매출" value={formatCurrency(metrics.revenue)} tone="green" />
        <Metric title="예상마진" value={formatCurrency(metrics.margin)} tone={metrics.margin > 0 ? 'green' : 'red'} />
        <Metric title="매입원가 누계" value={formatCurrency(purchaseTotal)} tone="blue" />
        <Metric title="처리필요" value={`${needsAction}건`} tone="amber" />
      </div>

      <div className="panel full-span erp-command">
        <div className="panel-header">
          <div>
            <h2>운영 흐름</h2>
            <p>소싱 검토에서 정산 반영까지 끊긴 구간을 먼저 처리합니다.</p>
          </div>
          <span className="badge">월간 기준 · 2026-07</span>
        </div>
        <div className="process-strip">
          <ProcessStep label="소싱검토" value={`${sourcingCandidates.length}개`} status="done" onClick={() => onNavigate('verify')} />
          <ProcessStep
            label="등록상품"
            value={`${registeredProducts.filter((product) => product.skuId).length} SKU`}
            status={needsId ? 'warn' : 'done'}
            onClick={() => onNavigate('products')}
          />
          <ProcessStep
            label="입고매입"
            value={`${purchaseQuantity}개`}
            status={missingPurchase ? 'warn' : 'done'}
            onClick={() => onNavigate('purchase')}
          />
          <ProcessStep
            label="일일판매"
            value={`${apiOrders}건 API`}
            status={syncState.status === 'success' ? 'done' : 'pending'}
            onClick={() => onNavigate('daily')}
          />
          <ProcessStep label="정산반영" value="대기" status="pending" onClick={() => onNavigate('settlement')} />
        </div>
      </div>

      <div className="panel erp-section">
        <div className="panel-header compact-header">
          <h2>월간 손익 요약</h2>
          <span className="status-chip ok">운영 예상</span>
        </div>
        <div className="ledger-lines">
          <LedgerLine label="매출" value={metrics.revenue} />
          <LedgerLine label="상품원가" value={-metrics.soldCost} />
          <LedgerLine label="광고비" value={-metrics.adCost} />
          <LedgerLine label="수수료+VAT" value={-(metrics.fee + metrics.feeVat)} />
          <LedgerLine label="예상마진" value={metrics.margin} strong />
        </div>
      </div>

      <div className="panel erp-section">
        <div className="panel-header compact-header">
          <h2>마스터 데이터</h2>
          <span className={needsAction ? 'status-chip warn' : 'status-chip ok'}>{needsAction ? '확인필요' : '정상'}</span>
        </div>
        <div className="status-grid">
          <StatusCell label="완료" value={completed} />
          <StatusCell label="ID 필요" value={needsId} tone="warn" />
          <StatusCell label="등록 필요" value={needsRegister} tone="danger" />
          <StatusCell label="입고 필요" value={missingPurchase} tone="warn" />
        </div>
      </div>

      <div className="panel erp-section">
        <div className="panel-header compact-header">
          <h2>입고차수</h2>
          <span className="status-chip ok">{batchRows.length}차수</span>
        </div>
        <DataTable
          compact
          headers={['차수', 'SKU', '수량', '원가합계']}
          rows={batchRows.map((batch) => [
            batch.batch,
            `${batch.skuCount}개`,
            `${formatNumber(batch.quantity)}개`,
            formatCurrency(batch.totalCost),
          ])}
        />
      </div>

      <div className="panel erp-section">
        <div className="panel-header compact-header">
          <h2>처리 큐</h2>
          <span className="status-chip warn">{needsAction}건</span>
        </div>
        <ul className="task-list dense">
          {verifiedRows
            .filter((row) => row.status !== '완료')
            .slice(0, 6)
            .map((row) => (
              <li key={row.candidate.sourcingId}>
                <strong>
                  {row.candidate.sourcingId} · {row.status}
                </strong>
                <span>{nextAction(row.status)}</span>
              </li>
            ))}
        </ul>
      </div>

      <div className="panel full-span erp-section">
        <div className="panel-header compact-header">
          <h2>최근 판매/반품</h2>
          <span className="status-chip ok">API 주문 샘플</span>
        </div>
        <DataTable
          compact
          headers={['일자', 'SKU', '상품', '수량', '매출', '광고', '원천']}
          rows={sales.slice(0, 10).map((sale) => {
            const product = findProduct(sale.skuId);
            return [
              sale.date,
              sale.skuId,
              product?.name ?? sale.productName ?? '미매핑',
              formatNumber(sale.quantity),
              formatCurrency(sale.revenue),
              formatCurrency(sale.adCost),
              sale.source,
            ];
          })}
        />
      </div>
    </section>
  );
}

function ProductVerification() {
  const completed = verifiedRows.filter((row) => row.status === '완료').length;
  const needsId = verifiedRows.filter((row) => row.status === 'ID필요').length;
  const needsPurchase = verifiedRows.filter((row) => row.status === '입고필요').length;
  const needsRegister = verifiedRows.filter((row) => row.status === '등록필요').length;

  return (
    <section className="screen-grid">
      <div className="metric-row">
        <Metric title="소싱 후보" value={`${sourcingCandidates.length}개`} tone="blue" />
        <Metric title="완료" value={`${completed}개`} tone="green" />
        <Metric title="ID 필요" value={`${needsId}개`} tone="amber" />
        <Metric title="등록/입고 필요" value={`${needsRegister + needsPurchase}개`} tone="red" />
      </div>

      <div className="panel wide full-span">
        <div className="panel-header">
          <div>
            <h2>상품 검증 보드</h2>
            <p>02_소싱검토를 기준으로 03_등록상품, 04_입고매입까지 이어졌는지 확인합니다.</p>
          </div>
          <span className="badge">실제 장부 스냅샷</span>
        </div>
        <DataTable
          headers={['상태', '소싱ID', '상품명', '판단', '예상마진', '등록옵션', 'SKU', '입고수량', '다음 행동']}
          rows={verifiedRows.map((row) => [
            row.status,
            row.candidate.sourcingId,
            row.candidate.name,
            row.candidate.decision,
            `${formatCurrency(row.candidate.expectedMargin)} / ${row.candidate.expectedMarginRate}%`,
            `${row.registered.length}개`,
            row.skuCount ? `${row.skuCount}개` : '-',
            row.purchaseQuantity ? `${formatNumber(row.purchaseQuantity)}개` : '-',
            nextAction(row.status),
          ])}
        />
      </div>

      <div className="panel">
        <h2>먼저 처리할 것</h2>
        <ul className="task-list">
          {verifiedRows
            .filter((row) => row.status !== '완료')
            .slice(0, 5)
            .map((row) => (
              <li key={row.candidate.sourcingId}>
                <strong>
                  {row.candidate.sourcingId} · {row.status}
                </strong>
                <span>{row.candidate.name}</span>
              </li>
            ))}
        </ul>
      </div>

      <div className="panel">
        <h2>검증 규칙</h2>
        <ul className="task-list">
          <li>
            <strong>등록필요</strong>
            <span>소싱에는 있지만 등록상품 행이 없음</span>
          </li>
          <li>
            <strong>ID필요</strong>
            <span>등록상품 행은 있지만 등록상품ID/옵션ID/SKU가 비어 있음</span>
          </li>
          <li>
            <strong>입고필요</strong>
            <span>SKU는 있지만 입고매입 원가가 없음</span>
          </li>
        </ul>
      </div>
    </section>
  );
}

function nextAction(status: string) {
  if (status === '완료') return '판매/정산 추적';
  if (status === '등록필요') return '쿠팡 등록 후 ID 연결';
  if (status === 'ID필요') return '등록상품ID·옵션ID·SKU 입력';
  if (status === '입고필요') return '입고차수와 매입원가 입력';
  if (status === '보류') return '소싱 재검토';
  return '확인';
}

function AppMetrics() {
  return {
    revenue: 0,
    soldCost: 0,
    adCost: 0,
    fee: 0,
    feeVat: 0,
    margin: 0,
    marginRate: 0,
  };
}

function Metric({ title, value, tone }: { title: string; value: string; tone: 'green' | 'red' | 'blue' | 'amber' }) {
  return (
    <article className={`metric ${tone}`}>
      <span>{title}</span>
      <strong>{value}</strong>
    </article>
  );
}

function ProcessStep({
  label,
  value,
  status,
  onClick,
}: {
  label: string;
  value: string;
  status: 'done' | 'warn' | 'pending';
  onClick?: () => void;
}) {
  return (
    <button className={`process-step ${status}`} type="button" onClick={onClick}>
      <span>{label}</span>
      <strong>{value}</strong>
    </button>
  );
}

function LedgerLine({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className={strong ? 'ledger-line strong' : 'ledger-line'}>
      <span>{label}</span>
      <strong>{formatCurrency(value)}</strong>
    </div>
  );
}

function StatusCell({ label, value, tone = 'ok' }: { label: string; value: number; tone?: 'ok' | 'warn' | 'danger' }) {
  return (
    <div className={`status-cell ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Bar({ label, value, max, tone }: { label: string; value: number; max: number; tone: string }) {
  const width = Math.max(8, Math.min(100, Math.abs(value / max) * 100));
  return (
    <div className="bar-row">
      <span>{label}</span>
      <div className="bar-track">
        <div className={`bar-fill ${tone}`} style={{ width: `${width}%` }} />
      </div>
      <strong>{formatCurrency(value)}</strong>
    </div>
  );
}

function DailySales({
  adInput,
  setAdInput,
  onAdSave,
  sales,
}: {
  adInput: string;
  setAdInput: (value: string) => void;
  onAdSave: () => void;
  sales: DailySale[];
}) {
  return (
    <section className="screen-grid two-column">
      <div className="panel">
        <div className="panel-header">
          <div>
            <h2>오늘 입력</h2>
            <p>API가 못 가져오는 광고비만 사람이 입력합니다.</p>
          </div>
        </div>
        <div className="form-grid">
          <label className="field">
            <span>날짜</span>
            <input type="date" defaultValue="2026-07-14" />
          </label>
          <label className="field">
            <span>오늘 광고비</span>
            <input value={adInput} onChange={(event) => setAdInput(event.target.value)} inputMode="numeric" />
          </label>
          <label className="field">
            <span>메모</span>
            <input placeholder="예: 쿠팡 광고센터 기준" />
          </label>
        </div>
        <button className="primary-button full" type="button" onClick={onAdSave}>
          <SvgIcon path="M5 12h14 M12 5v14" />
          <span>광고비 저장</span>
        </button>
      </div>

      <div className="panel wide">
        <div className="panel-header">
          <div>
            <h2>주문 수집 결과</h2>
            <p>쿠팡 API 주문을 SKU 기준으로 변환한 화면입니다.</p>
          </div>
          <span className="badge">13번 시트 대체</span>
        </div>
        <DataTable
          headers={['일자', 'SKU', '상품', '수량', '매출', '광고', '원천']}
          rows={sales.map((sale) => {
            const product = findProduct(sale.skuId);
            return [
              sale.date,
              sale.skuId,
              product?.name ?? sale.productName ?? '미매핑',
              formatNumber(sale.quantity),
              formatCurrency(sale.revenue),
              formatCurrency(sale.adCost),
              sale.orderId ? `${sale.source} · ${sale.orderId}` : sale.source,
            ];
          })}
        />
      </div>
    </section>
  );
}

function PurchaseBatches({
  batchLogistics,
  setBatchLogistics,
  onSave,
}: {
  batchLogistics: string;
  setBatchLogistics: (value: string) => void;
  onSave: () => void;
}) {
  const previewQuantity = 100;
  const allocated = Math.round(Number(batchLogistics || 0) / previewQuantity);
  return (
    <section className="screen-grid two-column">
      <div className="panel">
        <div className="panel-header">
          <div>
            <h2>입고차수 만들기</h2>
            <p>한 상자 물류비를 같은 차수 품목 수량으로 나눕니다.</p>
          </div>
        </div>
        <div className="form-grid">
          <label className="field">
            <span>입고차수</span>
            <input defaultValue="3차" />
          </label>
          <label className="field">
            <span>입고일</span>
            <input type="date" defaultValue="2026-07-14" />
          </label>
          <label className="field">
            <span>국제물류비</span>
            <input value={batchLogistics} onChange={(event) => setBatchLogistics(event.target.value)} />
          </label>
          <label className="field">
            <span>예상 총수량</span>
            <input value={previewQuantity} readOnly />
          </label>
        </div>
        <div className="allocation-preview">
          <span>개당 물류비</span>
          <strong>{formatCurrency(allocated)}</strong>
        </div>
        <button className="primary-button full" type="button" onClick={onSave}>
          <SvgIcon path="M5 12h14 M12 5v14" />
          <span>입고차수 저장</span>
        </button>
      </div>

      <div className="panel wide">
        <div className="panel-header">
          <div>
            <h2>입고차수 목록</h2>
            <p>상품원가 계산은 차수 단위로 잠깁니다.</p>
          </div>
          <span className="badge">04번 시트 대체</span>
        </div>
        <DataTable
          headers={['차수', '첫 입고일', '소싱품목', 'SKU', '수량', '매입금액', '물류비', '개당배분']}
          rows={batchRows.map((batch) => [
            batch.batch,
            batch.date,
            `${batch.productCount}개`,
            `${batch.skuCount}개`,
            `${formatNumber(batch.quantity)}개`,
            formatCurrency(batch.purchaseAmount),
            formatCurrency(batch.logistics),
            formatCurrency(batch.allocatedPerUnit),
          ])}
        />
      </div>
    </section>
  );
}

function Products({ onAddProduct }: { onAddProduct: () => void }) {
  return (
    <section className="screen-grid">
      <div className="panel wide">
        <div className="panel-header">
          <div>
            <h2>SKU 기준표</h2>
            <p>쿠팡 옵션ID가 들어오면 내부 SKU로 연결합니다.</p>
          </div>
          <button className="secondary-button" type="button" onClick={onAddProduct}>
            <SvgIcon path="M5 12h14 M12 5v14" />
            <span>상품 추가</span>
          </button>
        </div>
        <DataTable
          headers={['소싱ID', '등록상품 ID', '옵션 ID', 'SKU ID', '상품명', '옵션', '판매가', '평균원가', '상태']}
          rows={registeredProducts.map((product) => [
            product.sourcingId,
            product.productId || '-',
            product.optionId || '-',
            product.skuId || '-',
            product.name,
            product.option,
            product.salePrice ? formatCurrency(product.salePrice) : '-',
            product.avgCost ? formatCurrency(product.avgCost) : '-',
            product.status,
          ])}
        />
      </div>
    </section>
  );
}

function Settlement() {
  const rows = [
    ['2026-07-01', '74574384', 'SALE', '23,600', '2,548', '255', '20,797', '예상일치'],
    ['2026-07-01', '74574429', 'REFUND', '-10,900', '-1,145', '-115', '-9,640', '반품반영'],
    ['2026-07-02', '75165036', 'SALE', '15,900', '1,670', '167', '14,063', '신규옵션'],
  ];
  return (
    <section className="screen-grid">
      <div className="panel wide">
        <div className="panel-header">
          <div>
            <h2>정산 리포트</h2>
            <p>예상 손익과 쿠팡 실제 정산을 비교합니다.</p>
          </div>
          <span className="badge">05번/10번 시트 대체</span>
        </div>
        <DataTable headers={['인식일', 'SKU', '유형', '매출', '수수료', 'VAT', '정산금액', '상태']} rows={rows} />
      </div>
    </section>
  );
}

function DataTable({ headers, rows, compact = false }: { headers: string[]; rows: string[][]; compact?: boolean }) {
  return (
    <div className={compact ? 'table-wrap compact-table' : 'table-wrap'}>
      <table>
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row[0]}-${index}`}>
              {row.map((cell, cellIndex) => (
                <td key={`${cell}-${cellIndex}`}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
