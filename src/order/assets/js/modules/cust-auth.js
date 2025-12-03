// /src/order/assets/js/modules/cust-auth.js

const TOKEN_KEY = "qrnr.cust.jwt";

// -------------------------------------------------------
// Token 저장 / 조회
// -------------------------------------------------------
export function saveToken(token) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch (_) {}
}

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch (_) {
    return null;
  }
}

export function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch (_) {}
}

// -------------------------------------------------------
// 고객 인증 강제(require)
// -------------------------------------------------------
export async function requireCust() {
  const token = getToken();
  if (!token) {
    location.href = '/src/order/login.html';
    return;
  }

  let res = null;

  try {
    res = await fetch('/api/verify', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
  } catch (e) {
    console.error('[cust-auth] verify fetch error', e);
    clearToken();
    location.href = '/src/order/login.html';
    return;
  }

  if (!res.ok) {
    clearToken();
    location.href = '/src/order/login.html';
    return;
  }

  const payload = await res.json().catch(() => null);

  if (!payload || payload.realm !== 'cust') {
    clearToken();
    location.href = '/src/order/login.html';
    return;
  }

  return payload; // 로그인된 고객 정보 반환
}
