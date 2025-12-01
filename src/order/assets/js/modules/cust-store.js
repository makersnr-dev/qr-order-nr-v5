// /src/order/assets/js/modules/cust-store.js
// 고객 페이지도 관리자 store.js와 동일한 로컬스토리지 구조를 사용해야 함
// KEY = 'qrnr.store.v8' 로 완전 통합

const KEY = "qrnr.store.v8";

// 관리자 store.js의 기본 구조(def)를 그대로 포함
const def = () => ({
  admin: {
    ordersStore: [],
    ordersDelivery: [],
    qrList: [],

    // 기본 메뉴 (전 매장 공통)
    menu: [
      { id: "A1", name: "아메리카노", price: 3000, active: true },
      { id: "A2", name: "라떼",       price: 4000, active: true },
      { id: "B1", name: "크로와상",   price: 3500, active: true },
    ],

    // 매장별 메뉴 저장
    menuByStore: {},

    // 결제코드
    paymentCode: {
      date: new Date().toISOString().slice(0, 10),
      code: "7111",
    },

    // 알림 설정
    notify: {
      useBeep: true,
      beepVolume: 0.7,
      desktop: true,
      webhookUrl: "",
    },

    // 매장별 계좌 정보 저장 가능
    ownerBank: {},
  },

  // SUPER 관리자 매핑 저장
  system: {
    storeAdmins: {}, // { "adminId": {storeId, note?} }
  }
});

// 전체 로드
export function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || def();
  } catch (_) {
    return def();
  }
}

// 저장
export function save(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch (e) {
    console.error("[cust-store] save error", e);
  }
}

// patch(경로 갱신) - 관리자 store.js와 동일
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

// 경로 읽기
export const get = (path) =>
  path.reduce((o, k) => (o && typeof o === "object" ? o[k] : undefined), load());

// 숫자 formatting
export const fmt = (n) => Number(n || 0).toLocaleString();
