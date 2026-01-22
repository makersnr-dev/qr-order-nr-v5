// /src/shared/store.js
// 🔒 PHASE 0-2.5: storeId는 인증 결과 기준으로만 사용

export function ensureStoreInitialized() {
  // 🔥 storeId는 오직 인증 후 주입된 전역 값만 사용
  if (
    typeof window !== "undefined" &&
    typeof window.qrnrStoreId === "string" &&
    window.qrnrStoreId
  ) {
    return window.qrnrStoreId;
  }

  // ❌ 생성 / 추측 / localStorage / URL 전부 금지
  throw new Error("STORE_ID_NOT_INITIALIZED");
}
