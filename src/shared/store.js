// store.js — storeId 안정화 전역 함수

// 등록된 매장 목록 (임시 — 나중에 DB 연동 가능)
export const STORE_LIST = [
  "store1",
  "narae",  // 너의 매장
  // "store2", "store3" ... (원하면 추가)
];

// URL에서 store 파라미터 가져오기
function getStoreFromURL() {
  const url = new URL(window.location.href);
  return url.searchParams.get("store");
}

// localStorage 저장 키
const STORE_KEY = "qrnr.currentStore";

// localStorage에서 storeId 읽기
function getStoreFromLocal() {
  try {
    return localStorage.getItem(STORE_KEY);
  } catch {
    return null;
  }
}

// localStorage에 저장
function saveStore(storeId) {
  try {
    localStorage.setItem(STORE_KEY, storeId);
  } catch {}
}

// storeId 유효성 검사
function isValidStore(storeId) {
  return STORE_LIST.includes(storeId);
}

// ★★★★★ 핵심 함수 — 모든 페이지에서 이것만 호출하면 됨
export function ensureStoreInitialized() {
  // 1) URL에서 store 확인
  let store = getStoreFromURL();

  // 2) URL에 없는 경우 localStorage fallback
  if (!store) {
    store = getStoreFromLocal();
  }

  // 3) 그래도 없거나 잘못된 경우 기본 매장으로 세팅
  if (!store || !isValidStore(store)) {
    store = STORE_LIST[0]; // 기본값: store1 (또는 narae)
    saveStore(store);
  }

  // 4) localStorage 최신화
  saveStore(store);

  return store;
}
