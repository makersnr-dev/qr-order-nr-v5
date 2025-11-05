// Admin auth module — hardened
const TOKEN_KEY = "qrnr.jwt";

// ✅ 토큰 저장
export function saveToken(t) {
  try { localStorage.setItem(TOKEN_KEY, t); } catch (e) { console.warn('[auth] saveToken error', e); }
}

// ✅ 토큰 불러오기
export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY); } catch (e) { console.warn('[auth] getToken error', e); return null; }
}

// ✅ 토큰 삭제 (로그아웃 시 사용)
export function clearToken() {
  try { localStorage.removeItem(TOKEN_KEY); } catch (e) { console.warn('[auth] clearToken error', e); }
}

// ✅ 인증 확인 및 접근 제어
export async function requireAuth(realm) {
  const here = location.pathname;
  const loginPath = '/admin/login';

  try {
    const t = getToken();

    // 1️⃣ 토큰이 없으면 로그인 페이지로 이동 (이미 로그인 페이지면 이동 금지)
    if (!t) {
      if (!here.startsWith(loginPath)) location.href = loginPath;
      return null;
    }

    // 2️⃣ 토큰 검증 API 호출 (캐시 방지)
    const r = await fetch('/api/verify', { method: 'POST', body: t, cache: 'no-store' });

    // 3️⃣ 검증 실패 시 토큰 삭제 및 로그인 페이지 이동
    if (!r.ok) {
      clearToken();
      if (!here.startsWith(loginPath)) location.href = loginPath;
      return null;
    }

    // 4️⃣ 응답 데이터 확인
    const p = await r.json();

    // 5️⃣ 권한 체크 (realm이 admin인지)
    const expected = (realm || 'admin');
    if (p.realm !== expected) {
      clearToken();
      if (!here.startsWith(loginPath)) location.href = loginPath;
      return null;
    }

    // ✅ 인증 및 권한 확인 완료
    return p;
  } catch (e) {
    console.error('[auth] requireAuth error:', e);
    if (!here.startsWith(loginPath)) location.href = loginPath;
    return null;
  }
}

// ✅ 선택: 로그인 상태에서 로그인 페이지 접근 시 /admin 으로 이동
export function redirectIfLoggedIn() {
  const here = location.pathname;
  const loginPath = '/admin/login';
  const t = getToken();
  if (t && here.startsWith(loginPath)) {
    try { history.replaceState(null, '', '/admin'); } catch {} 
    location.href = '/admin';
  }
}
