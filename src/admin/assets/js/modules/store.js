// /src/admin/assets/js/modules/store.js
// ✅ PHASE 1-1: Storage Layer 기준 통합 (storage.js 사용)

import { Storage } from '/src/shared/storage.js';
import { ensureStoreInitialized } from '/src/shared/store.js';

// 기본 구조 (기존 구조 유지)
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
    menuByStore: {},
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
  stores: {}
});

// 내부 유틸: storeId 확보
function requireStoreId() {
  const storeId = ensureStoreInitialized();
  if (!storeId) {
    console.warn('[STORE] storeId not initialized');
    return null;
  }
  return storeId;
}

// 내부 유틸: 전체 데이터 로드
function loadAll(storeId) {
  return Storage.get(storeId, 'adminStore') || def();
}

// 내부 유틸: 전체 데이터 저장
function saveAll(storeId, data) {
  Storage.set(storeId, 'adminStore', data);
}

// ==============================
// Public API (기존 시그니처 유지)
// ==============================

export function load() {
  const storeId = requireStoreId();
  if (!storeId) return def();
  return loadAll(storeId);
}

export function save(d) {
  const storeId = requireStoreId();
  if (!storeId) return;
  saveAll(storeId, d);
}

/**
 * patch:
 *  - path: ['admin','menuByStore','korea']
 *  - 중간 경로 자동 생성 (기존 동작 유지)
 */
export function patch(path, updater) {
  const storeId = requireStoreId();
  if (!storeId) return null;

  const d = loadAll(storeId);
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

  saveAll(storeId, d);
  return d;
}

export const get = (path) =>
  path.reduce((o, k) => (o && o[k]), load());

export const fmt = (n) =>
  Number(n || 0).toLocaleString();

/* ======================================================
   가짜 DB API (localStorage → storage.js 기반)
====================================================== */

export function ensureStore(storeId) {
  if (!storeId) return;
  patch(['stores', storeId], prev => prev ?? {});
}

/* ---------- 결제 코드 ---------- */
export function getPaymentCode(storeId) {
  if (!storeId) return null;
  return get(['stores', storeId, 'paymentCode']) || null;
}

export function setPaymentCode(storeId, data) {
  if (!storeId) return;
  patch(['stores', storeId, 'paymentCode'], () => data);
}

/* ---------- 매장 주문 ---------- */
export function getStoreOrders(storeId) {
  if (!storeId) return [];
  return get(['stores', storeId, 'orders']) || [];
}

export function addStoreOrder(storeId, order) {
  if (!storeId) return;
  patch(['stores', storeId, 'orders'], prev => {
    const arr = Array.isArray(prev) ? prev : [];
    return [order, ...arr];
  });
}

/* ---------- 예약 주문 ---------- */
export function getReserveOrders(storeId) {
  if (!storeId) return [];
  return get(['stores', storeId, 'reserveOrders']) || [];
}

export function addReserveOrder(storeId, order) {
  if (!storeId) return;
  patch(['stores', storeId, 'reserveOrders'], prev => {
    const arr = Array.isArray(prev) ? prev : [];
    return [order, ...arr];
  });
}

/* ---------- 메뉴 ---------- */
export function getMenu(storeId) {
  if (!storeId) return [];
  return get(['stores', storeId, 'menu']) || [];
}

export function setMenu(storeId, menu) {
  if (!storeId) return;
  patch(['stores', storeId, 'menu'], () => menu);
}

/* ---------- 관리자 계좌 ---------- */
export function getOwnerBank(storeId) {
  return (
    get(['stores', storeId, 'ownerBank']) ||
    get(['admin', 'ownerBank']) ||
    null
  );
}

export function setOwnerBank(storeId, bank) {
  patch(['stores', storeId, 'ownerBank'], () => bank);
}

/* ---------- 개인정보 처리방침 ---------- */
export function getPrivacyPolicy(storeId) {
  if (!storeId) return null;
  return (
    get(['admin', 'privacyPolicy', storeId]) ||
    get(['admin', 'privacyPolicy']) ||
    null
  );
}

export function setPrivacyPolicy(storeId, text) {
  if (!storeId) return;
  patch(['admin', 'privacyPolicy', storeId], () => text);
}

/* ---------- 알림 설정 ---------- */
export function getNotifyConfig(storeId) {
  if (!storeId) return null;
  return (
    get(['admin', 'notify', storeId]) ||
    null
  );
}

export function setNotifyConfig(storeId, cfg) {
  if (!storeId) return;
  patch(['admin', 'notify', storeId], () => cfg);
}

/* ---------- 직원 호출 옵션 ---------- */
export function getCallOptions(storeId) {
  if (!storeId) return [];
  return (
    get(['admin', 'callOptions', storeId]) || []
  );
}

export function setCallOptions(storeId, list) {
  if (!storeId) return;
  patch(['admin', 'callOptions', storeId], () => list);
}

/* ---------- 알림 로그 ---------- */
export function addNotifyLog(storeId, log) {
  if (!storeId) return;

  patch(['admin', 'notifyLogs'], (list = []) => {
    const arr = Array.isArray(list) ? [...list] : [];
    arr.unshift(log);
    return arr.slice(0, 100);
  });
}
