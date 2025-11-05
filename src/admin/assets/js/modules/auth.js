const TOKEN_KEY = "qrnr.jwt";

// ✅ 토큰 저장
export function saveToken(t) {
  localStorage.setItem(TOKEN_KEY, t);
}

// ✅ 토큰 불러오기
export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

// ✅ 토큰 삭제 (로그아웃 시 사용)
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

// ✅ 인증 확인 및 접근 제어
export async function requireAuth(realm) {
  const t = getToken();
  const here = location.pathname;
  const loginPath = '/admin/login';

  // 1️⃣ 토큰이 없으면 로그인 페이지로 이동
  if (!t) {
    if (!here.startsWith(loginPath)) location.href = loginPath;
    return null;
  }

  // 2️⃣ 토큰 검증 API 호출
  const r = await fetch('/api/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }, // 누락된 헤더 추가
    body: JSON.stringify({ token: t }), // body는 문자열 형태로 보내야 함
  });

  // 3️⃣ 검증 실패 시 토큰 삭제 및 로그인 페이지 이동
  if (!r.ok) {
    clearToken();
    if (!here.startsWith(loginPath)) location.href = loginPath;
    return null;
  }

  // 4️⃣ 응답 데이터 확인
  const p = await r.json();

  // 5️⃣ 권한 체크 (realm이 admin인지)
  if (p.realm !== (realm || 'admin')) {
    clearToken();
    if (!here.startsWith(loginPath)) location.href = loginPath;
    return null;
  }

  // ✅ 인증 및 권한 확인 완료
  return p;
}
