// /src/admin/assets/js/modules/store.js
// v5 다점포 구조 대응 완성본

const KEY = "qrnr.store.v8";

// 기본 구조
const def = () => ({
  admin: {
    // 매장별 주문 저장
    ordersStore: {},        // { storeId: [ ... ] }
    ordersDelivery: {},     // { storeId: [ ... ] }

    // QR — storeId로 필터링 (배열 통합 저장)
    qrList: [],

    // 공용(기본) 메뉴 — 템플릿 역할
    menu: [
      { id: "A1", name: "아메리카노", price: 3000, active: true },
      { id: "A2", name: "라떼",       price: 4000, active: true },
      { id: "B1", name: "크로와상",   price: 3500, active: true },
    ],

    // 매장별 메뉴
    menuByStore: {},        // { storeId: [ ... ] }

    // 결제코드 (매일 갱신) — 매장별
    paymentCode: {
      // storeId: { date, code }
    },

    // 매장별 입금 계좌
    ownerBank: {
      // storeId: { bank, number, holder }
    },

    // 알림 설정
    notify: {
      useBeep: true,
      beepVolume: 0.7,
      desktop: true,
      webhookUrl: "",
    },
  },
});

// 데이터 로드
export function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || def();
  } catch (_) {
    return def();
  }
}

// 저장
export function save(d) {
  localStorage.setItem(KEY, JSON.stringify(d));
}

/**
 * patch(path, updater)
 *  - path: ['admin','menuByStore','store1']
 *  - 중간 경로 자동 생성
 */
export function patch(path, updater) {
  const d = load();
  let ref = d;

  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    if (ref[key] == null || typeof ref[key] !== "object") {
      ref[key] = {};
    }
    ref = ref[key];
  }

  const k = path[path.length - 1];
  ref[k] = updater(ref[k], d);

  save(d);
  return d;
}

// 경로 접근
export const get = (path) =>
  path.reduce((o, k) => (o && o[k] != null ? o[k] : undefined), load());

// 숫자 포맷터
export const fmt = (n) => Number(n || 0).toLocaleString();

/**
 * ⭐ 매장(storeId)별 구조 보장 (v5 핵심 함수)
 * 모든 메뉴 / 주문 / 결제코드 / 계좌 / QR을 문제 없이 다루기 위해 필수
 */
export function ensureStoreInitialized(storeId) {
  if (!storeId) return;

  const d = load();

  // 메뉴
  if (!d.admin.menuByStore[storeId]) {
    d.admin.menuByStore[storeId] = [];
  }

  // 매장 주문
  if (!Array.isArray(d.admin.ordersStore[storeId])) {
    d.admin.ordersStore[storeId] = [];
  }

  // 배달/예약 주문
  if (!Array.isArray(d.admin.ordersDelivery[storeId])) {
    d.admin.ordersDelivery[storeId] = [];
  }

  // 결제코드
  if (!d.admin.paymentCode[storeId]) {
    d.admin.paymentCode[storeId] = {
      date: new Date().toISOString().slice(0, 10),
      code: "0000",
    };
  }

  // 입금 계좌
  if (!d.admin.ownerBank[storeId]) {
    d.admin.ownerBank[storeId] = {
      bank: "",
      number: "",
      holder: "",
    };
  }

  save(d);
}
