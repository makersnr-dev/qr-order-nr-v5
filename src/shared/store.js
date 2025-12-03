// /src/shared/store.js
export function ensureStoreInitialized() {
  const url = new URL(location.href);
  let storeId = url.searchParams.get("store");

  if (storeId) {
    try {
      localStorage.setItem("qrnr.storeId", storeId);
    } catch (_) {}
    return storeId;
  }

  try {
    storeId = localStorage.getItem("qrnr.storeId");
  } catch (_) {}

  if (storeId) return storeId;

  storeId = "default";
  try {
    localStorage.setItem("qrnr.storeId", storeId);
  } catch (_) {}
  return storeId;
}
