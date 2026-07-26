export type SourcingCandidate = {
  sourcingId: string;
  name: string;
  foundAt: string;
  salePrice: number;
  expectedCost: number;
  expectedMargin: number;
  expectedMarginRate: number;
  decision: '좋음' | '보류';
};

export type RegisteredProduct = {
  productId: string;
  optionId: string;
  skuId: string;
  sourcingId: string;
  name: string;
  option: string;
  status: string;
  startDate: string;
  salePrice: number;
  avgCost: number;
  coupangFeeRate: number;
};

export type PurchaseLine = {
  date: string;
  batch: string;
  skuId: string;
  name: string;
  option: string;
  sourcingId: string;
  quantity: number;
  purchaseAmount: number;
  logisticsAmount: number;
  totalCost: number;
  unitCost: number;
};

export const sourcingCandidates: SourcingCandidate[] = [
  { sourcingId: 'S-0001', name: '고양이 모양 커튼 클립 10개', foundAt: '테무', salePrice: 6900, expectedCost: 868, expectedMargin: 2738, expectedMarginRate: 40, decision: '좋음' },
  { sourcingId: 'S-0002', name: '플로럴 자수 레이스 테이블보', foundAt: '테무', salePrice: 19900, expectedCost: 5270, expectedMargin: 9151, expectedMarginRate: 46, decision: '좋음' },
  { sourcingId: 'S-0003', name: '스트랩 민소매 탱크탑 (백리스)', foundAt: '테무', salePrice: 10900, expectedCost: 3395, expectedMargin: 3646, expectedMarginRate: 33, decision: '좋음' },
  { sourcingId: 'S-0004', name: '강아지 쿨링 반다나/스카프 - S', foundAt: '테무', salePrice: 9900, expectedCost: 1860, expectedMargin: 4240, expectedMarginRate: 43, decision: '좋음' },
  { sourcingId: 'S-0005', name: '강아지 쿨링 반다나/스카프 - M', foundAt: '테무', salePrice: 9900, expectedCost: 2232, expectedMargin: 3902, expectedMarginRate: 39, decision: '좋음' },
  { sourcingId: 'S-0006', name: '코지멜로우백 생활방수 다용도 트래블 정리가방', foundAt: '테무', salePrice: 17900, expectedCost: 4340, expectedMargin: 8394, expectedMarginRate: 47, decision: '좋음' },
  { sourcingId: 'S-0007', name: '물감 물통', foundAt: '테무', salePrice: 8900, expectedCost: 2325, expectedMargin: 3016, expectedMarginRate: 34, decision: '좋음' },
  { sourcingId: 'S-0008', name: '자연스러운 골반보정 심리스 편한 속옷', foundAt: '테무', salePrice: 12900, expectedCost: 4278, expectedMargin: 4445, expectedMarginRate: 34, decision: '좋음' },
  { sourcingId: 'S-0009', name: '고품질 공간활용 벨벳 미끄럼 방지 옷걸이', foundAt: '-', salePrice: 7900, expectedCost: 2108, expectedMargin: 2412, expectedMarginRate: 31, decision: '좋음' },
  { sourcingId: 'S-0010', name: '멀티포켓가방', foundAt: '-', salePrice: 14900, expectedCost: 5270, expectedMargin: 5145, expectedMarginRate: 35, decision: '좋음' },
  { sourcingId: 'S-0011', name: '쪼리 양말 (일반)', foundAt: '-', salePrice: 7400, expectedCost: 887, expectedMargin: 3122, expectedMarginRate: 42, decision: '좋음' },
  { sourcingId: 'S-0012', name: '쪼리 양말 (디자인 특화)', foundAt: '-', salePrice: 6660, expectedCost: 942, expectedMargin: 2479, expectedMarginRate: 37, decision: '좋음' },
  { sourcingId: 'S-0013', name: '전자레인지 가열 트레이', foundAt: '테무', salePrice: 4900, expectedCost: 1215, expectedMargin: 821, expectedMarginRate: 17, decision: '보류' },
  { sourcingId: 'S-0014', name: '북커버 클래식 손잡이', foundAt: '-', salePrice: 17900, expectedCost: 5735, expectedMargin: 7126, expectedMarginRate: 40, decision: '좋음' },
  { sourcingId: 'S-0015', name: '북커버 침대느낌', foundAt: '-', salePrice: 19900, expectedCost: 5890, expectedMargin: 8587, expectedMarginRate: 43, decision: '좋음' },
  { sourcingId: 'S-0016', name: '쓰레기통', foundAt: '-', salePrice: 14900, expectedCost: 5270, expectedMargin: 5145, expectedMarginRate: 35, decision: '좋음' },
  { sourcingId: 'S-0017', name: '체크리스트 + 속지', foundAt: '-', salePrice: 9900, expectedCost: 2604, expectedMargin: 3564, expectedMarginRate: 36, decision: '좋음' },
  { sourcingId: 'S-0018', name: '카피바라체크리스트', foundAt: '-', salePrice: 9900, expectedCost: 1891, expectedMargin: 4212, expectedMarginRate: 43, decision: '좋음' },
  { sourcingId: 'S-0019', name: '화가 북커버', foundAt: '-', salePrice: 12900, expectedCost: 2480, expectedMargin: 6080, expectedMarginRate: 47, decision: '좋음' },
];

export const registeredProducts: RegisteredProduct[] = [
  { productId: '16229230746', optionId: '95517807305', skuId: '74574384', sourcingId: 'S-0001', name: '고양이 모양 커튼 클립 10개', option: 'x', status: '판매중', startDate: '2026-05-28', salePrice: 5900, avgCost: 895, coupangFeeRate: 10.8 },
  { productId: '16235751413', optionId: '95539094997', skuId: '74574403', sourcingId: 'S-0002', name: '플로럴 자수 레이스 테이블보', option: 'x', status: '판매중', startDate: '2026-06-01', salePrice: 19900, avgCost: 4245, coupangFeeRate: 10.8 },
  { productId: '16235776016', optionId: '95539171871', skuId: '74574426', sourcingId: 'S-0003', name: '스트랩 민소매 탱크탑 (백리스)', option: '화이트 S', status: '판매중', startDate: '2026-06-01', salePrice: 10900, avgCost: 2963, coupangFeeRate: 10.8 },
  { productId: '16235776016', optionId: '95539171875', skuId: '74574427', sourcingId: 'S-0003', name: '스트랩 민소매 탱크탑 (백리스)', option: '화이트 M', status: '판매중', startDate: '2026-06-01', salePrice: 10900, avgCost: 2963, coupangFeeRate: 10.8 },
  { productId: '16235776016', optionId: '95539171870', skuId: '74574425', sourcingId: 'S-0003', name: '스트랩 민소매 탱크탑 (백리스)', option: '화이트 L', status: '판매중', startDate: '2026-06-01', salePrice: 10900, avgCost: 2963, coupangFeeRate: 10.8 },
  { productId: '16235776016', optionId: '95539171873', skuId: '74574429', sourcingId: 'S-0003', name: '스트랩 민소매 탱크탑 (백리스)', option: '블랙 S', status: '판매중', startDate: '2026-06-01', salePrice: 10900, avgCost: 2963, coupangFeeRate: 10.8 },
  { productId: '16235776016', optionId: '95539171874', skuId: '74574428', sourcingId: 'S-0003', name: '스트랩 민소매 탱크탑 (백리스)', option: '블랙 M', status: '판매중', startDate: '2026-06-01', salePrice: 10900, avgCost: 2963, coupangFeeRate: 10.8 },
  { productId: '16235776016', optionId: '95539171872', skuId: '74574423', sourcingId: 'S-0003', name: '스트랩 민소매 탱크탑 (백리스)', option: '블랙 L', status: '판매중', startDate: '2026-06-01', salePrice: 10900, avgCost: 2963, coupangFeeRate: 10.8 },
  { productId: '16235976261', optionId: '95539891840', skuId: '74574444', sourcingId: 'S-0004', name: '강아지 쿨링 반다나/스카프 - S', option: '수박 S', status: '판매중', startDate: '2026-06-01', salePrice: 9900, avgCost: 1778, coupangFeeRate: 10.8 },
  { productId: '16235976261', optionId: '95539891838', skuId: '74574443', sourcingId: 'S-0005', name: '강아지 쿨링 반다나/스카프 - M', option: '수박 M', status: '판매중', startDate: '2026-06-01', salePrice: 9900, avgCost: 2437, coupangFeeRate: 10.8 },
  { productId: '16258299316', optionId: '95608175729', skuId: '75165036', sourcingId: 'S-0006', name: '코지멜로우백 생활방수 다용도 트래블 정리가방', option: '라이트옐로우', status: '판매중', startDate: '2026-06-01', salePrice: 15900, avgCost: 2938, coupangFeeRate: 10.8 },
  { productId: '16258299316', optionId: '95608175730', skuId: '75165043', sourcingId: 'S-0006', name: '코지멜로우백 생활방수 다용도 트래블 정리가방', option: '아이보리', status: '판매중', startDate: '2026-06-01', salePrice: 15900, avgCost: 2850, coupangFeeRate: 10.8 },
  { productId: '16258609780', optionId: '95609171107', skuId: '75165056', sourcingId: 'S-0007', name: '아웃츠 접이식 멀티 브러쉬 세척 물통', option: '블루 ONE SIZE', status: '판매중', startDate: '2026-06-01', salePrice: 8900, avgCost: 1901, coupangFeeRate: 10.8 },
  { productId: '16258609780', optionId: '95609171109', skuId: '75165049', sourcingId: 'S-0007', name: '아웃츠 접이식 멀티 브러쉬 세척 물통', option: '베이지 ONE SIZE', status: '판매중', startDate: '2026-06-01', salePrice: 8900, avgCost: 1901, coupangFeeRate: 10.8 },
  { productId: '16258603826', optionId: '95609152578', skuId: '75165030', sourcingId: 'S-0008', name: '자연스러운 골반보정 심리스 편한 속옷', option: '블랙 M', status: '판매중', startDate: '2026-06-01', salePrice: 12900, avgCost: 3943, coupangFeeRate: 10.8 },
  { productId: '16258603826', optionId: '95609152580', skuId: '75165026', sourcingId: 'S-0008', name: '자연스러운 골반보정 심리스 편한 속옷', option: '베이지 M', status: '판매중', startDate: '2026-06-01', salePrice: 12900, avgCost: 2693, coupangFeeRate: 10.8 },
  { productId: '16258603826', optionId: '95609152579', skuId: '75165014', sourcingId: 'S-0008', name: '자연스러운 골반보정 심리스 편한 속옷', option: '블랙 L', status: '판매중', startDate: '2026-06-01', salePrice: 12900, avgCost: 3943, coupangFeeRate: 10.8 },
  { productId: '16258603826', optionId: '95609152577', skuId: '75165008', sourcingId: 'S-0008', name: '자연스러운 골반보정 심리스 편한 속옷', option: '베이지 L', status: '판매중', startDate: '2026-06-01', salePrice: 12900, avgCost: 2693, coupangFeeRate: 10.8 },
  { productId: '16277803682', optionId: '95675178053', skuId: '75796632', sourcingId: 'S-0009', name: '고품질 공간활용 벨벳 미끄럼 방지 옷걸이', option: '아이보리', status: '판매중', startDate: '2026-06-01', salePrice: 7900, avgCost: 2590, coupangFeeRate: 10.8 },
  { productId: '16273906241', optionId: '95661159873', skuId: '75666520', sourcingId: 'S-0010', name: '멀티포켓가방', option: '블랙', status: '판매중', startDate: '2026-06-01', salePrice: 18900, avgCost: 4569, coupangFeeRate: 10.8 },
  { productId: '16273906241', optionId: '95661159874', skuId: '75666541', sourcingId: 'S-0010', name: '멀티포켓가방', option: '카키', status: '판매중', startDate: '2026-06-01', salePrice: 18900, avgCost: 4569, coupangFeeRate: 10.8 },
  { productId: '16273906241', optionId: '95661159876', skuId: '75666529', sourcingId: 'S-0010', name: '멀티포켓가방', option: '아이보리', status: '판매중', startDate: '2026-06-01', salePrice: 18900, avgCost: 4569, coupangFeeRate: 10.8 },
  { productId: '16268596807', optionId: '95642010721', skuId: '75462019', sourcingId: 'S-0011', name: '쪼리 양말 (일반)', option: '블랙 + 옐로우', status: '판매중', startDate: '2026-06-01', salePrice: 6900, avgCost: 1051, coupangFeeRate: 10.8 },
  { productId: '16268596807', optionId: '95642010723', skuId: '75462021', sourcingId: 'S-0011', name: '쪼리 양말 (일반)', option: '블랙 + 오렌지', status: '판매중', startDate: '2026-06-01', salePrice: 6900, avgCost: 1051, coupangFeeRate: 10.8 },
  { productId: '16268596807', optionId: '95642010719', skuId: '75462003', sourcingId: 'S-0011', name: '쪼리 양말 (일반)', option: '블랙 + 브라운', status: '판매중', startDate: '2026-06-01', salePrice: 6900, avgCost: 1051, coupangFeeRate: 10.8 },
  { productId: '16268596807', optionId: '95642010720', skuId: '75462018', sourcingId: 'S-0012', name: '쪼리 양말 (디자인 특화)', option: '블랙 + 형광그린', status: '판매중', startDate: '2026-06-01', salePrice: 6900, avgCost: 1074, coupangFeeRate: 10.8 },
  { productId: '16268596807', optionId: '95642010722', skuId: '75462020', sourcingId: 'S-0012', name: '쪼리 양말 (디자인 특화)', option: '블랙 + 피콕블루', status: '판매중', startDate: '2026-06-01', salePrice: 6900, avgCost: 1074, coupangFeeRate: 10.8 },
  { productId: '', optionId: '', skuId: '', sourcingId: 'S-0014', name: '북커버 클래식 손잡이', option: '', status: '판매중', startDate: '2026-06-01', salePrice: 0, avgCost: 0, coupangFeeRate: 10.8 },
  { productId: '', optionId: '', skuId: '', sourcingId: 'S-0015', name: '북커버 침대느낌', option: '', status: '판매중', startDate: '2026-06-01', salePrice: 0, avgCost: 0, coupangFeeRate: 10.8 },
  { productId: '', optionId: '', skuId: '', sourcingId: 'S-0016', name: '쓰레기통', option: '', status: '판매중', startDate: '2026-06-01', salePrice: 0, avgCost: 0, coupangFeeRate: 10.8 },
  { productId: '', optionId: '', skuId: '', sourcingId: 'S-0017', name: '체크리스트 + 속지', option: '', status: '판매중', startDate: '2026-06-01', salePrice: 0, avgCost: 0, coupangFeeRate: 10.8 },
  { productId: '', optionId: '', skuId: '', sourcingId: 'S-0018', name: '카피바라체크리스트', option: '', status: '판매중', startDate: '2026-06-01', salePrice: 0, avgCost: 0, coupangFeeRate: 10.8 },
  { productId: '', optionId: '', skuId: '', sourcingId: 'S-0019', name: '화가 북커버', option: '', status: '판매중', startDate: '2026-06-01', salePrice: 0, avgCost: 0, coupangFeeRate: 10.8 },
  { productId: '', optionId: '', skuId: '', sourcingId: 'S-0020', name: '미등록', option: '', status: '판매중', startDate: '2026-06-01', salePrice: 0, avgCost: 0, coupangFeeRate: 10.8 },
];

export const purchaseLines: PurchaseLine[] = [
  { date: '2026-05-28', batch: '1차', skuId: '74574384', name: '고양이 모양 커튼 클립 10개', option: 'x', sourcingId: 'S-0001', quantity: 100, purchaseAmount: 71064, logisticsAmount: 18421, totalCost: 89485, unitCost: 895 },
  { date: '2026-06-01', batch: '1차', skuId: '74574403', name: '플로럴 자수 레이스 테이블보', option: 'x', sourcingId: 'S-0002', quantity: 20, purchaseAmount: 81216, logisticsAmount: 3684, totalCost: 84900, unitCost: 4245 },
  { date: '2026-06-01', batch: '1차', skuId: '74574426', name: '스트랩 민소매 탱크탑 (백리스)', option: '화이트 S', sourcingId: 'S-0003', quantity: 15, purchaseAmount: 41686, logisticsAmount: 2763, totalCost: 44449, unitCost: 2963 },
  { date: '2026-06-01', batch: '1차', skuId: '74574427', name: '스트랩 민소매 탱크탑 (백리스)', option: '화이트 M', sourcingId: 'S-0003', quantity: 30, purchaseAmount: 83373, logisticsAmount: 5526, totalCost: 88899, unitCost: 2963 },
  { date: '2026-06-01', batch: '1차', skuId: '74574425', name: '스트랩 민소매 탱크탑 (백리스)', option: '화이트 L', sourcingId: 'S-0003', quantity: 15, purchaseAmount: 41686, logisticsAmount: 2763, totalCost: 44449, unitCost: 2963 },
  { date: '2026-06-01', batch: '1차', skuId: '74574429', name: '스트랩 민소매 탱크탑 (백리스)', option: '블랙 S', sourcingId: 'S-0003', quantity: 15, purchaseAmount: 41686, logisticsAmount: 2763, totalCost: 44449, unitCost: 2963 },
  { date: '2026-06-01', batch: '1차', skuId: '74574428', name: '스트랩 민소매 탱크탑 (백리스)', option: '블랙 M', sourcingId: 'S-0003', quantity: 30, purchaseAmount: 83373, logisticsAmount: 5526, totalCost: 88899, unitCost: 2963 },
  { date: '2026-06-01', batch: '1차', skuId: '74574423', name: '스트랩 민소매 탱크탑 (백리스)', option: '블랙 L', sourcingId: 'S-0003', quantity: 15, purchaseAmount: 41686, logisticsAmount: 2763, totalCost: 44449, unitCost: 2963 },
  { date: '2026-06-07', batch: '1차', skuId: '74574444', name: '강아지 쿨링 반다나/스카프 - S', option: '수박 S', sourcingId: 'S-0004', quantity: 40, purchaseAmount: 63732, logisticsAmount: 7368, totalCost: 71100, unitCost: 1778 },
  { date: '2026-06-07', batch: '1차', skuId: '74574443', name: '강아지 쿨링 반다나/스카프 - M', option: '수박 M', sourcingId: 'S-0005', quantity: 10, purchaseAmount: 22532, logisticsAmount: 1842, totalCost: 24374, unitCost: 2437 },
  { date: '2026-06-07', batch: '1차', skuId: '75796632', name: '고품질 공간활용 벨벳 미끄럼 방지 옷걸이', option: '아이보리', sourcingId: 'S-0009', quantity: 10, purchaseAmount: 24055, logisticsAmount: 1842, totalCost: 25897, unitCost: 2590 },
  { date: '2026-06-07', batch: '1차', skuId: '75666520', name: '멀티포켓가방', option: '블랙', sourcingId: 'S-0010', quantity: 10, purchaseAmount: 43851, logisticsAmount: 1842, totalCost: 45693, unitCost: 4569 },
  { date: '2026-06-07', batch: '1차', skuId: '75666541', name: '멀티포켓가방', option: '카키', sourcingId: 'S-0010', quantity: 10, purchaseAmount: 43851, logisticsAmount: 1842, totalCost: 45693, unitCost: 4569 },
  { date: '2026-06-07', batch: '1차', skuId: '75666529', name: '멀티포켓가방', option: '아이보리', sourcingId: 'S-0010', quantity: 10, purchaseAmount: 43851, logisticsAmount: 1842, totalCost: 45693, unitCost: 4569 },
  { date: '2026-06-07', batch: '1차', skuId: '75462019', name: '쪼리 양말 (일반)', option: '블랙 + 옐로우', sourcingId: 'S-0011', quantity: 10, purchaseAmount: 8669, logisticsAmount: 1842, totalCost: 10511, unitCost: 1051 },
  { date: '2026-06-07', batch: '1차', skuId: '75462021', name: '쪼리 양말 (일반)', option: '블랙 + 오렌지', sourcingId: 'S-0011', quantity: 10, purchaseAmount: 8669, logisticsAmount: 1842, totalCost: 10511, unitCost: 1051 },
  { date: '2026-06-07', batch: '1차', skuId: '75462003', name: '쪼리 양말 (일반)', option: '블랙 + 브라운', sourcingId: 'S-0011', quantity: 10, purchaseAmount: 8669, logisticsAmount: 1842, totalCost: 10511, unitCost: 1051 },
  { date: '2026-06-07', batch: '1차', skuId: '75462018', name: '쪼리 양말 (디자인 특화)', option: '블랙 + 형광그린', sourcingId: 'S-0012', quantity: 10, purchaseAmount: 8897, logisticsAmount: 1842, totalCost: 10739, unitCost: 1074 },
  { date: '2026-06-07', batch: '1차', skuId: '75462020', name: '쪼리 양말 (디자인 특화)', option: '블랙 + 피콕블루', sourcingId: 'S-0012', quantity: 10, purchaseAmount: 8897, logisticsAmount: 1842, totalCost: 10739, unitCost: 1074 },
  { date: '2026-06-01', batch: '2차', skuId: '75165043', name: '코지멜로우백 생활방수 다용도 트래블 정리가방', option: '아이보리', sourcingId: 'S-0006', quantity: 2, purchaseAmount: 5700, logisticsAmount: 0, totalCost: 5700, unitCost: 2850 },
  { date: '2026-06-01', batch: '2차', skuId: '75165036', name: '코지멜로우백 생활방수 다용도 트래블 정리가방', option: '라이트옐로우', sourcingId: 'S-0006', quantity: 2, purchaseAmount: 5875, logisticsAmount: 0, totalCost: 5875, unitCost: 2938 },
  { date: '2026-06-01', batch: '2차', skuId: '75165056', name: '아웃츠 접이식 멀티 브러쉬 세척 물통', option: '블루 ONE SIZE', sourcingId: 'S-0007', quantity: 2, purchaseAmount: 3801, logisticsAmount: 0, totalCost: 3801, unitCost: 1901 },
  { date: '2026-06-01', batch: '2차', skuId: '75165049', name: '아웃츠 접이식 멀티 브러쉬 세척 물통', option: '베이지 ONE SIZE', sourcingId: 'S-0007', quantity: 2, purchaseAmount: 3801, logisticsAmount: 0, totalCost: 3801, unitCost: 1901 },
  { date: '2026-06-01', batch: '2차', skuId: '75165026', name: '자연스러운 골반보정 심리스 편한 속옷', option: '베이지 M', sourcingId: 'S-0008', quantity: 2, purchaseAmount: 5385, logisticsAmount: 0, totalCost: 5385, unitCost: 2693 },
  { date: '2026-06-01', batch: '2차', skuId: '75165008', name: '자연스러운 골반보정 심리스 편한 속옷', option: '베이지 L', sourcingId: 'S-0008', quantity: 2, purchaseAmount: 5385, logisticsAmount: 0, totalCost: 5385, unitCost: 2693 },
  { date: '2026-06-01', batch: '2차', skuId: '75165030', name: '자연스러운 골반보정 심리스 편한 속옷', option: '블랙 M', sourcingId: 'S-0008', quantity: 2, purchaseAmount: 7885, logisticsAmount: 0, totalCost: 7885, unitCost: 3943 },
  { date: '2026-06-01', batch: '2차', skuId: '75165014', name: '자연스러운 골반보정 심리스 편한 속옷', option: '블랙 L', sourcingId: 'S-0008', quantity: 2, purchaseAmount: 7885, logisticsAmount: 0, totalCost: 7885, unitCost: 3943 },
];
