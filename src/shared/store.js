// /src/shared/store.js
export function ensureStoreInitialized() {
  const url = new URL(location.href);
  let storeId = url.searchParams.get("store");

  // 1️⃣ URL에 store가 있으면 최우선
  if (storeId) {
    try {
      localStorage.setItem("qrnr.storeId", storeId);
    } catch (_) {}
    return storeId;
  }

  // 2️⃣ 없으면 localStorage에서만 읽기
  try {
    storeId = localStorage.getItem("qrnr.storeId");
  } catch (_) {}

  if (storeId) return storeId;

  // 3️⃣ ❌ 여기서 생성 금지
  // 👉 storeId 없으면 차단
  throw new Error("STORE_ID_NOT_INITIALIZED");
}
