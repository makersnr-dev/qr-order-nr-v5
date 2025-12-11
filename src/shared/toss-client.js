// /src/shared/toss-client.js
// Unified Toss client helper with returnTo support
// - Exports:
//   getTossClientKey, ensureToss, setPendingOrder, getPendingOrder, startPayment

// ===== Config fetch =====
export async function getTossClientKey() {
  const r = await fetch('/api/config', { cache: 'no-store' });
  const c = await r.json().catch(() => ({}));
  if (!c || !c.tossClientKey) throw new Error('Missing TOSS client key');
  return c.tossClientKey;
}

// ===== Script loader =====
async function loadScript(src, id) {
  if (document.getElementById(id)) return;
  await new Promise((res, rej) => {
    const s = document.createElement('script');
    s.id = id;
    s.src = src;
    s.onload = res;
    s.onerror = rej;
    document.head.appendChild(s);
  });
}

// ===== Toss init =====
export async function ensureToss() {
  await loadScript('https://js.tosspayments.com/v1/payment', 'tosspayments-script');
  const key = await getTossClientKey();
  if (!window.TossPayments) throw new Error('TossPayments not loaded');
  return window.TossPayments(key);
}

// ===== Pending order storage (sessionStorage) =====
const PENDING_KEY = 'qrnr.pendingOrder';

export function setPendingOrder(data) {
  try {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(data));
  } catch (_) {
    // ignore
  }
}

export function getPendingOrder() {
  try {
    return JSON.parse(sessionStorage.getItem(PENDING_KEY) || 'null');
  } catch (_) {
    return null;
  }
}

// 필요하면 쓸 수 있게 clear도 하나 내보내 둠 (안 써도 무방)
export function clearPendingOrder() {
  try {
    sessionStorage.removeItem(PENDING_KEY);
  } catch (_) {
    // ignore
  }
}

// ===== Payment starter (supports returnTo) =====
// Usage:
//   await startPayment({ orderId, amount, orderName, returnTo });
//   - returnTo 예: `/order/store?store=narae&table=3` 또는 `/order/delivery?store=narae`
export async function startPayment({ orderId, amount, orderName, returnTo }) {
  const client = await ensureToss();

  // returnTo가 안 넘어왔으면, 현재 보고 있는 페이지 주소(쿼리 포함)를 기본값으로 사용
  const finalReturnTo =
    returnTo || `${location.pathname}${location.search || ''}`;

  const successUrl =
    `${location.origin}/toss/success` +
    `?orderId=${encodeURIComponent(orderId)}` +
    `&amount=${encodeURIComponent(amount)}` +
    (finalReturnTo ? `&returnTo=${encodeURIComponent(finalReturnTo)}` : '');

  const failUrl =
    `${location.origin}/toss/fail` +
    `?orderId=${encodeURIComponent(orderId)}` +
    (finalReturnTo ? `&returnTo=${encodeURIComponent(finalReturnTo)}` : '');

  return client.requestPayment("카드", {
  amount: Number(amount),
  orderId: String(orderId),
  orderName: String(orderName || '주문'),
  successUrl,
  failUrl,
});

}
