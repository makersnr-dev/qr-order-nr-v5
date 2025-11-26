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

// JWT payload 디코딩 (필요하면 사용)
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

// 로그인이 꼭 필요한 페이지에서 호출:
//   await requireAuth('admin');
//   await requireAuth('super');
export async function requireAuth(realm) {
  const here = location.pathname;
  const loginPath = '/admin/login'; // 실제 로그인 페이지 경로에 맞게 필요하면 조정

  try {
    const t = getToken();

    // 1) 토큰조차 없으면 → 로그인 페이지로
    if (!t) {
      if (!here.startsWith(loginPath)) {
        location.href = loginPath;
      }
      return null;
    }

    // 2) /api/verify 에 JSON 형식으로 토큰 보내기 (★ 핵심 수정)
    const r = await fetch('/api/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: t }),
      cache: 'no-store',
    });

    const p = await r.json().catch(() => null);
    console.log('[auth] verify response', r.status, p);

    // 응답 파싱 실패 / ok:false / realm 없음 → 전부 실패 취급
    if (!p || p.ok === false || !p.realm) {
      clearToken();
      if (!here.startsWith(loginPath)) {
        location.href = loginPath;
      }
      return null;
    }

    const need = realm || 'admin'; // 기본은 admin
    if (p.realm !== need) {
      // SUPER 토큰으로 admin-only 페이지에 오거나, 반대의 경우 등
      clearToken();
      if (!here.startsWith(loginPath)) {
        location.href = loginPath;
      }
      return null;
    }

    // 여기까지 왔으면 인증 OK
    return p;
  } catch (e) {
    console.error('[auth] requireAuth error', e);
    if (!here.startsWith(loginPath)) {
      location.href = loginPath;
    }
    return null;
  }
}

// 이미 로그인 돼 있으면 /admin/login 에서 바로 /admin 으로 보내기
export function redirectIfLoggedIn() {
  const here = location.pathname;
  const t = getToken();
  if (!t) return;

  const payload = decodeToken(t);
  if (!payload || !payload.realm) return;

  if (here.startsWith('/admin/login')) {
    try {
      history.replaceState(null, '', '/admin');
    } catch (e) {
      console.error('[auth] redirectIfLoggedIn history error', e);
    }
    location.href = '/admin';
  }
}
