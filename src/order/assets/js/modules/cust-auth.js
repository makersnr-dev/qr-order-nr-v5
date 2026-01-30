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

  // 🚀 수정: 로그인 페이지로 보낼 때 현재 매장 ID를 쿼리스트링으로 전달합니다.
  const currentUrl = new URL(location.href);
  const sid = currentUrl.searchParams.get('store') || localStorage.getItem('qrnr.storeId') || '';
  const loginUrl = `/src/order/login.html${sid ? '?store=' + sid : ''}`;

  if (!token) {
    location.href = loginUrl;
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
    location.href = loginUrl;
    return;
  }

  if (!res.ok) {
    clearToken();
    location.href = loginUrl;
    return;
  }

  const payload = await res.json().catch(() => null);

  // realm이 'cust'인지 확인하여 관리자 토스트가 손님 화면에서 작동하지 않게 방어합니다.
  if (!payload || payload.realm !== 'cust') {
    clearToken();
    location.href = loginUrl;
    return;
  }

  return payload; // 로그인된 고객 정보 반환
}
