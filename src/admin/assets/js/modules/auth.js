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

// =====================================================
// ⭐ payload.storeId → localStorage.storeId 반영하는 핵심 로직
// =====================================================

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

    // 1) JWT payload.storeId가 최우선
    if (decoded.storeId) {
      localStorage.setItem('qrnr.storeId', decoded.storeId);
      console.log('[auth] storeId from TOKEN =', decoded.storeId);
      return;
    }

    // 2) JWT에 없으면 storeAdmins 매핑 보조 적용
    if (info.realm === 'admin' && typeof get === 'function') {
      try {
        const map = get(['system', 'storeAdmins']) || {};
        const mapped = map[info.id];

        let sid = null;

        if (typeof mapped === 'string') {
          sid = mapped;
        } else if (mapped && typeof mapped === 'object') {
          sid =
            mapped.storeId ||
            mapped.store ||
            mapped.storeCode ||
            null;
        }

        if (sid) {
          localStorage.setItem('qrnr.storeId', sid);
          console.log('[auth] storeId hydrated from mapping:', sid);
        }
      } catch (e) {
        console.error('[auth] storeAdmins hydrate error', e);
      }
    }
  } catch (e) {
    console.error('[auth] hydrateAdminInfoAndStore error', e);
  }
}

// =====================================================
// 로그인 페이지에서 사용할 requireAuth()
// =====================================================

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

    const r = await fetch('/api/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: t }),
      cache: 'no-store',
    });

    const p = await r.json().catch(() => null);
    console.log('[auth] verify response', r.status, p);

    if (!p || p.ok === false || !p.realm) {
      clearToken();
      if (!here.startsWith(loginPath)) {
        location.href = loginPath;
      }
      return null;
    }

    const need = realm || 'admin';
    if (p.realm !== need) {
      clearToken();
      if (!here.startsWith(loginPath)) {
        location.href = loginPath;
      }
      return null;
    }

    // ⭐ storeId 저장
    hydrateAdminInfoAndStore(t, p.realm);

    return p;
  } catch (e) {
    console.error('[auth] requireAuth error', e);
    if (!here.startsWith(loginPath)) {
      location.href = loginPath;
    }
    return null;
  }
}

// =====================================================
// 로그인 화면에서 이미 로그인된 경우 redirect
// =====================================================

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

    try {
      history.replaceState(null, '', target);
    } catch (e) {
      console.error('[auth] redirectIfLoggedIn history error', e);
    }
    location.href = target;
  }
}
