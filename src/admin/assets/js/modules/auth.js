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

// ✅ 토큰 → adminInfo / storeId로 채워 넣는 함수
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

    // 관리자 정보 저장 (admin.js 의 resolveStoreId에서 사용 가능)
    localStorage.setItem('qrnr.adminInfo', JSON.stringify(info));

    // 관리자라면 매장 매핑도 시도
    if (info.realm === 'admin' && typeof get === 'function') {
      try {
        const map = get(['system', 'storeAdmins']) || {};
        const mapped = map[info.id];

        let sid = null;

        if (typeof mapped === 'string') {
          // 예: storeAdmins[adminId] = 'korea'
          sid = mapped;
        } else if (mapped && typeof mapped === 'object') {
          // 예: storeAdmins[adminId] = { storeId:'korea', ... } 형태
          // 👉 매장 ID로 쓸만한 필드만 본다 (id 같은 건 절대 쓰지 않음!)
          sid =
            mapped.storeId ||
            mapped.store ||
            mapped.storeCode ||
            null;
        }

        if (sid) {
          localStorage.setItem('qrnr.storeId', sid);
          console.log(
            '[auth] storeId hydrated from mapping:',
            info.id,
            '->',
            sid,
          );
        } else {
          console.log(
            '[auth] no usable storeId in mapping for',
            info.id,
            mapped,
          );
        }
      } catch (e) {
        console.error('[auth] hydrate storeId from storeAdmins failed', e);
      }
    }
  } catch (e) {
    console.error('[auth] hydrateAdminInfoAndStore error', e);
  }
}

// 로그인이 꼭 필요한 페이지에서 호출:
//   await requireAuth('admin');
//   await requireAuth('super');
export async function requireAuth(realm) {
  const here = location.pathname;
  const loginPath = '/admin/login';

  try {
    // 서버에 "나 누구야?"라고 물어봅니다 (쿠키는 자동으로 따라갑니다)
    const r = await fetch('/api/me', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}), 
      cache: 'no-store',
    });

    const p = await r.json().catch(() => null);

    // 1. 서버가 응답이 없거나 로그인이 안 되어 있다고 하면 로그인 페이지로 쫓아냅니다.
    if (!p || p.ok === false) {
      if (!here.startsWith(loginPath)) {
        location.href = loginPath;
      }
      return null;
    }

    // 2. 권한 확인 (관리자 페이지인데 엉뚱한 권한이면 내쫓음)
    const need = realm || 'admin';
    if (p.realm !== need && !p.isSuper) {
      location.href = loginPath;
      return null;
    }

    // 3. 성공했다면 storeId를 브라우저에 저장해둡니다.
    if (p.storeId) {
      localStorage.setItem('qrnr.storeId', p.storeId);
    }

    return p; // 로그인 성공!
  } catch (e) {
    console.error('[auth] requireAuth error', e);
    location.href = loginPath;
    return null;
  }
}

// 이미 로그인 돼 있으면 /admin/login 에서 바로 /admin(또는 /admin?store=) 으로 보내기
export function redirectIfLoggedIn() {
  const here = location.pathname;
  const t = getToken();
  if (!t) return;

  const payload = decodeToken(t);
  if (!payload || !payload.realm) return;

  if (here.startsWith('/admin/login')) {
    // 이미 로그인된 상태라면, storeId 있으면 붙여서 보내기
    let target = '/admin';
    const sid = localStorage.getItem('qrnr.storeId');
    if (sid) {
      target = `/admin?store=${encodeURIComponent(sid)}`;
    }

    try {
      history.replaceState(null, '', target);
    } catch (e) {
      console.error('[auth] redirectIfLoggedIn history error', e);
    }
    location.href = target;
  }
}
