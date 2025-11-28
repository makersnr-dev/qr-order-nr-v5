// /src/admin/assets/js/modules/store.js

const KEY = "qrnr.store.v8";

// 기본 구조 (admin.menu는 전 매장 공통 템플릿, menuByStore는 매장별 메뉴)
const def = () => ({
  admin: {
    ordersStore: [],
    ordersDelivery: [],
    qrList: {},            // ⚠️ 여기!! 반드시 매장별로 관리되도록 {} 로 둬야 함
    menu: [
      { id: "A1", name: "아메리카노", price: 3000, active: true },
      { id: "A2", name: "라떼",       price: 4000, active: true },
      { id: "B1", name: "크로와상",   price: 3500, active: true },
    ],
    menuByStore: {},        // 매장별 메뉴 저장
    paymentCode: {
      date: new Date().toISOString().slice(0, 10),
      code: "7111",
    },
    notify: {
      useBeep: true,
      beepVolume: 0.7,
      desktop: true,
      webhookUrl: "",
    },
    ownerBank: { bank: "우리", number: "1002-123-456789", holder: "홍길동" },
  },
});

// 불러오기
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
 * patch:
 *  - path: ['admin','menuByStore','korea'] 처럼 배열
 *  - 중간 경로 없으면 자동 생성
 */
export function patch(path, updater) {
  const d = load();
  let ref = d;

  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];

    // 중간 객체 자동 생성
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

export const get = (path) =>
  path.reduce((o, k) => (o && o[k]), load());

export const fmt = (n) => Number(n || 0).toLocaleString();

/**
 * ⭐ 즉시 해결 핵심:
 *   - menuByStore[storeId] 없으면 자동으로 []
 *   - qrList[storeId] 없으면 자동으로 []
 *   → 매장별 메뉴/QR 데이터를 항상 ‘존재하는 구조’로 만듦
 */
export function ensureStoreInitialized(storeId) {
  const d = load();

  // 메뉴 초기화
  if (!d.admin.menuByStore[storeId]) {
    d.admin.menuByStore[storeId] = [];
  }

  // QR 초기화
  if (!d.admin.qrList[storeId]) {
    d.admin.qrList[storeId] = [];
  }

  save(d);
}
