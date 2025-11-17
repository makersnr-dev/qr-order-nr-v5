// /src/admin/assets/js/modules/store.js

const KEY = "qrnr.store.v8";

// 기본 구조 (admin.menu는 전 매장 공통 템플릿, menuByStore는 매장별 메뉴)
const def = () => ({
  admin: {
    ordersStore: [],
    ordersDelivery: [],
    qrList: [],
    menu: [
      { id: "A1", name: "아메리카노", price: 3000, active: true },
      { id: "A2", name: "라떼",       price: 4000, active: true },
      { id: "B1", name: "크로와상",   price: 3500, active: true },
    ],
    menuByStore: {}, // 🔹 매장별 메뉴 저장용 (추가)
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

export function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || def();
  } catch (_) {
    return def();
  }
}

export function save(d) {
  localStorage.setItem(KEY, JSON.stringify(d));
}

/**
 * patch:
 *  - path: ['admin','menuByStore','korea'] 처럼 배열
 *  - 중간 경로가 없으면 자동으로 객체 생성 (다점포 대응)
 */
export function patch(path, updater) {
  const d = load();
  let ref = d;

  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];

    // 중간 경로가 없으면 객체로 생성
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

export const get = (path) => path.reduce((o, k) => (o && o[k]), load());

export const fmt = (n) => Number(n || 0).toLocaleString();
