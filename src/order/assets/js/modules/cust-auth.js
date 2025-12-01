// /src/order/assets/js/modules/cust-auth.js
// 고객 로그인 JWT 인증 모듈 (admin과 동일한 /api/verify 구조 사용)

const TOKEN_KEY = "qrnr.cust.jwt";

// JWT 저장
export function saveToken(t) {
  try {
    localStorage.setItem(TOKEN_KEY, t);
  } catch (e) {
    console.error('[cust-auth] saveToken error', e);
  }
}

// JWT 가져오기
export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch (e) {
    console.error('[cust-auth] getToken error', e);
    return null;
  }
}

// JWT 삭제
export function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch (e) {
    console.error('[cust-auth] clearToken error', e);
  }
}

// JWT payload decode
export function decodeToken(t) {
  if (!t) return null;
  const parts = t.split('.');
  if (parts.length < 2) return null;
  try {
    const json = atob(parts[1]);
    return JSON.parse(json);
  } catch (e) {
    console.error('[cust-auth] decodeToken error', e);
    return null;
  }
}

// 고객 로그인 인증 필요 페이지에서 호출
// ex: await requireCust();
export async function requireCust() {
  const here = location.pathname;
  const loginPath = '/src/order/login.html';

  let t = getToken();

  if (!t) {
    if (!here.startsWith(loginPath)) location.href = loginPath;
    return null;
  }

  try {
    // admin 구조와 동일하게 JSON 토큰 전송
    const r = await fetch('/api/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: t }),
      cache: 'no-store',
    });

    const p = await r.json().catch(() => null);
    console.log('[cust-auth] verify response', r.status, p);

    // verify 실패 시 처리
    if (!p || p.ok === false || !p.realm) {
      clearToken();
      if (!here.startsWith(loginPath)) location.href = loginPath;
      return null;
    }

    // 고객 realm으로 제한
    if (p.realm !== 'cust') {
      clearToken();
      if (!here.startsWith(loginPath)) location.href = loginPath;
      return null;
    }

    return p;
  } catch (e) {
    console.error('[cust-auth] requireCust error', e);
    clearToken();
    if (!here.startsWith(loginPath)) location.href = loginPath;
    return null;
  }
}
