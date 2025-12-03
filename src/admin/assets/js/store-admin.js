// /src/admin/assets/js/store-admin.js
// SUPER용 JWT를 사용해 매장 관리자 매핑을 관리하는 스크립트
// - SUPER 로그인: /api/super-login (Edge + Web Crypto 방식)
// - 토큰 저장:    localStorage "qrnr.super.jwt"
// - 매핑 저장:    localStorage "qrnr.store.v8" 의 ['system','storeAdmins']

import { get, patch } from './modules/store.js';

const $ = (sel, root = document) => root.querySelector(sel);
const SUPER_TOKEN_KEY = 'qrnr.super.jwt';
const MAP_PATH = ['admin', 'storeAdmins'];

// ----- SUPER 토큰 유틸 -----
function getSuperToken() {
  try {
    return localStorage.getItem(SUPER_TOKEN_KEY) || '';
  } catch (e) {
    console.error('[store-admin] getSuperToken error', e);
    return '';
  }
}

function setSuperToken(token) {
  try {
    if (token) {
      localStorage.setItem(SUPER_TOKEN_KEY, token);
    } else {
      localStorage.removeItem(SUPER_TOKEN_KEY);
    }
  } catch (e) {
    console.error('[store-admin] setSuperToken error', e);
  }
}

// JWT payload만 간단히 decode (서명 검증은 안 함)
function decodeToken(token) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length < 2) return null;

  try {
    const bodyJson = atob(parts[1]);
    return JSON.parse(bodyJson);
  } catch (e) {
    console.error('[store-admin] decodeToken error', e);
    return null;
  }
}

// ----- 매장 매핑 데이터 유틸 -----
// 구조: { [adminId]: { storeId, note? } }
function loadMap() {
  const raw = get(MAP_PATH);
  if (!raw || typeof raw !== 'object') return {};
  return { ...raw };
}

function saveMap(map) {
  patch(MAP_PATH, () => map);
}

// ----- 테이블 렌더링 -----
function renderMapTable() {
  const tbody = $('#map-body');
  if (!tbody) return;

  const map = loadMap();
  const entries = Object.entries(map);

  tbody.innerHTML = '';

  if (!entries.length) {
    const tr = document.createElement('tr');
    tr.innerHTML =
      '<td colspan="4" class="small">등록된 매핑 없음</td>';
    tbody.appendChild(tr);
    return;
  }

  entries.sort(([a], [b]) => a.localeCompare(b, 'ko'));

  for (const [adminId, info] of entries) {
    const storeId = info && info.storeId ? info.storeId : '';
    const note = info && info.note ? info.note : '';

    const adminSafe = adminId.replace(/"/g, '&quot;');
    const storeSafe = String(storeId).replace(/"/g, '&quot;');
    const noteSafe = String(note).replace(/"/g, '&quot;');

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${adminSafe}</td>
      <td>${storeSafe}</td>
      <td>${noteSafe || ''}</td>
      <td class="right">
        <a class="btn small"
           href="/admin?store=${encodeURIComponent(storeId)}"
           target="_blank">
          관리자 콘솔
        </a>
        <button class="btn small" data-del="${adminSafe}">
          삭제
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  }

  // 삭제 버튼
  tbody.querySelectorAll('button[data-del]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const adminId = btn.getAttribute('data-del');
      if (!adminId) return;
      if (!confirm(`관리자 "${adminId}" 매핑을 삭제할까요?`)) return;

      const map = loadMap();
      delete map[adminId];
      saveMap(map);
      renderMapTable();
    });
  });
}

// ----- 매핑 추가/수정 UI -----
function bindMappingForm() {
  const adminInput = $('#map-admin');
  const storeInput = $('#map-store');
  const noteInput = $('#map-note');
  const addBtn = $('#map-add');

  if (!adminInput || !storeInput || !addBtn) return;

  addBtn.addEventListener('click', () => {
    const adminId = (adminInput.value || '').trim();
    const storeId = (storeInput.value || '').trim();
    const note = (noteInput?.value || '').trim();

    if (!adminId || !storeId) {
      alert('관리자 ID와 storeId를 모두 입력하세요.');
      return;
    }

    const map = loadMap();
    map[adminId] = { storeId, note };
    saveMap(map);
    renderMapTable();

    adminInput.value = '';
    storeInput.value = '';
    if (noteInput) noteInput.value = '';
  });
}

// ----- 페이지 초기화 (로그인/로그아웃 포함) -----
async function init() {
  const statusBox = $('#super-status-text');
  const logoutBtn = $('#super-logout');
  const loginCard = $('#super-login-card');
  const mappingCard = $('#mapping-card');
  const loginBtn = $('#super-login-btn');
  const loginMsg = $('#super-login-msg');
  const idInput = $('#super-id');
  const pwInput = $('#super-pw');

  if (!statusBox || !logoutBtn || !loginCard || !mappingCard) {
    console.error('[store-admin] 필수 DOM 요소 누락');
    return;
  }

  // 1) 현재 SUPER 토큰 확인
  const currentToken = getSuperToken();
  const me = decodeToken(currentToken);

  if (me && me.realm === 'super') {
    statusBox.textContent = `로그인: ${me.uid || ''}`;
    logoutBtn.style.display = 'inline-flex';
    loginCard.style.display = 'none';
    mappingCard.style.display = 'block';

    renderMapTable();
    bindMappingForm();
  } else {
    statusBox.textContent = '';
    logoutBtn.style.display = 'none';
    loginCard.style.display = 'block';
    mappingCard.style.display = 'none';

    if (loginBtn && idInput && pwInput && loginMsg) {
      loginBtn.addEventListener('click', async () => {
        const uid = (idInput.value || '').trim();
        const pwd = (pwInput.value || '').trim();

        if (!uid || !pwd) {
          loginMsg.textContent =
            '아이디와 비밀번호를 모두 입력해 주세요.';
          return;
        }

        loginMsg.textContent = '로그인 시도 중...';

        try {
          const r = await fetch('/api/super-login', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ uid, pwd }),
          });

          const data = await r.json().catch(() => null);

          if (!data || data.ok !== true || !data.token) {
            // 자세한 에러 메시지 분기
            if (data && data.error === 'INVALID_CREDENTIALS') {
              loginMsg.textContent =
                '아이디 또는 비밀번호가 올바르지 않습니다.';
            } else if (
              data &&
              (data.error === 'BAD_SUPER_ADMINS_JSON_PARSE' ||
                data.error === 'NO_VALID_SUPER_USERS')
            ) {
              loginMsg.textContent =
                'SUPER_ADMINS_JSON 환경변수를 확인해 주세요.';
            } else {
              loginMsg.textContent = '로그인에 실패했습니다.';
            }
            return;
          }

          

          const me2 = decodeToken(data.token);
          if (me2 && me2.realm === 'super') {
            statusBox.textContent = `로그인: ${me2.uid || ''}`;
            logoutBtn.style.display = 'inline-flex';
            loginCard.style.display = 'none';
            mappingCard.style.display = 'block';

            renderMapTable();
            bindMappingForm();
          } else {
            loginMsg.textContent =
              '로그인에 실패했습니다. (토큰 정보가 올바르지 않습니다)';
          }
        } catch (e) {
          console.error('[store-admin] login error', e);
          loginMsg.textContent =
            '로그인 중 오류가 발생했습니다.';
        }
      });
    }
  }

  // 2) 로그아웃 버튼
  logoutBtn.addEventListener('click', () => {
    if (!confirm('로그아웃할까요?')) return;
    setSuperToken('');
    location.reload();
  });
}

document.addEventListener('DOMContentLoaded', () => {
  init().catch((e) =>
    console.error('[store-admin] init error', e),
  );
});
