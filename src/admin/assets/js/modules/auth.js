// /src/admin/assets/js/modules/auth.js
// 관리자(SUPER 포함) 공통 인증 모듈

const TOKEN_KEY = 'qrnr.jwt';

// 토큰 저장
export function saveToken(t) {
  try {
    localStorage.setItem(TOKEN_KEY, t);
  } catch (e) {
    console.error('[auth] saveToken error', e);
  }
}

// 토큰 가져오기
export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch (e) {
    console.error('[auth] getToken error', e);
    return null;
  }
}

// 토큰 삭제
export function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem('qrnr.adminInfo');
    localStorage.removeItem('qrnr.storeId');
  } catch (e) {
    console.error('[auth] clearToken error', e);
  }
}

// JWT payload 디코딩
export function decodeToken(t) {
  if (!t) return null;
  const parts = t.split('.');
  if (parts.length < 2) return null;
  try {
    const body = atob(parts[1]);
    return JSON.parse(body);
  } catch (e) {
    console.error('[auth] decodeToken error', e);
    return null;
  }
}

// -------------------------------
// storeId 동기화
// -------------------------------
function hydrateAdminInfoAndStore(t, realmHint) {
  try {
    const decoded = decodeToken(t);
    if (!decoded) return;

    const id = decoded.uid || decoded.sub;
    if (!id) return;

    const info = {
      id,
      name: decoded.name || id,
      realm: decoded.realm || realmHint || 'admin',
    };

    localStorage.setItem('qrnr.adminInfo', JSON.stringify(info));

    if (decoded.storeId) {
      localStorage.setItem('qrnr.storeId', decoded.storeId);
      console.log('[auth] storeId from TOKEN =', decoded.storeId);
      return;
    }
  } catch (e) {
    console.error('[auth] hydrateAdminInfoAndStore error', e);
  }
}

// -------------------------------
// ⭐ 핵심: verify 호출 방식 수정됨
// -------------------------------
export async function requireAuth(realm) {
  const here = location.pathname;
  const loginPath = '/admin/login';

  try {
    const t = getToken();

    if (!t) {
      if (!here.startsWith(loginPath)) {
        location.href = loginPath;
      }
      return null;
    }

    // ⭐ Body → 헤더 방식으로 변경
    const r = await fetch('/api/verify', {
      method: 'POST',
      headers: {
        'x-auth-token': t,
        'cache-control': 'no-store'
      }
    });

    const p = await r.json().catch(() => null);
    console.log('[auth] verify response', r.status, p);

    if (!p || p.ok === false || !p.realm) {
      clearToken();
      if (!here.startsWith(loginPath)) location.href = loginPath;
      return null;
    }

    const need = realm || 'admin';
    if (p.realm !== need) {
      clearToken();
      if (!here.startsWith(loginPath)) location.href = loginPath;
      return null;
    }

    hydrateAdminInfoAndStore(t, p.realm);
    return p;

  } catch (e) {
    console.error('[auth] requireAuth error', e);
    if (!here.startsWith(loginPath)) location.href = loginPath;
    return null;
  }
}

// -------------------------------
// 로그인 화면 자동 리디렉트
// -------------------------------
export function redirectIfLoggedIn() {
  const here = location.pathname;
  const t = getToken();
  if (!t) return;

  const payload = decodeToken(t);
  if (!payload || !payload.realm) return;

  if (here.startsWith('/admin/login')) {
    let target = '/admin';
    const sid = localStorage.getItem('qrnr.storeId');
    if (sid) target = `/admin?store=${encodeURIComponent(sid)}`;
    location.href = target;
  }
}
