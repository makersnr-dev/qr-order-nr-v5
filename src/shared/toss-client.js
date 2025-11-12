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
  } catch (_) {}
}

export function getPendingOrder() {
  try {
    return JSON.parse(sessionStorage.getItem(PENDING_KEY) || 'null');
  } catch (_) {
    return null;
  }
}

// ===== Payment starter (supports returnTo) =====
// Usage:
//   await startPayment({ orderId, amount, orderName, returnTo });
//   - returnTo 예: `/order/store?store=narae&table=3` 또는 `/order/delivery?store=narae`
export async function startPayment({ orderId, amount, orderName, returnTo }) {
  const client = await ensureToss();

  const successUrl =
    `${location.origin}/toss/success` +
    `?orderId=${encodeURIComponent(orderId)}` +
    `&amount=${encodeURIComponent(amount)}` +
    (returnTo ? `&returnTo=${encodeURIComponent(returnTo)}` : '');

  const failUrl =
    `${location.origin}/toss/fail` +
    `?orderId=${encodeURIComponent(orderId)}` +
    (returnTo ? `&returnTo=${encodeURIComponent(returnTo)}` : '');

  return client.requestPayment({
    amount: Number(amount),
    orderId: String(orderId),
    orderName: String(orderName || '주문'),
    successUrl,
    failUrl,
  });
}
