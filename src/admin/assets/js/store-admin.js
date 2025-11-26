// /src/admin/assets/js/store-admin.js
// SUPER용 JWT를 사용해 매장 관리자 매핑을 관리하는 스크립트
// - SUPER 로그인: /api/super-login
// - 토큰 검증:    /api/verify
// - 매핑 저장:    localStorage "qrnr.store.v8" 의 ['system','storeAdmins']

import { get, patch } from './modules/store.js';

const $ = (sel, root = document) => root.querySelector(sel);
const SUPER_TOKEN_KEY = 'qrnr.super.jwt';
const MAP_PATH = ['system', 'storeAdmins'];

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

// JWT 검증: realm === 'super' 인지 확인
async function verifySuper() {
  const token = getSuperToken();
  if (!token) return null;

  try {
    const r = await fetch('/api/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token }),
    });

    if (!r.ok) return null;

    const data = await r.json().catch(() => null);
    if (!data || !data.ok || data.realm !== 'super') return null;

    return data; // { ok, sub, realm, payload }
  } catch (e) {
    console.error('[store-admin] verifySuper error', e);
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

// ----- 페이지 초기화 (SUPER 로그인/로그아웃 포함) -----
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

  // 1) 현재 SUPER 토큰 검증
  const me = await verifySuper();

  if (me) {
    // SUPER 인증 OK
    statusBox.textContent = `SUPER 로그인: ${me.sub}`;
    logoutBtn.style.display = 'inline-flex';
    loginCard.style.display = 'none';
    mappingCard.style.display = 'block';

    renderMapTable();
    bindMappingForm();
  } else {
    // SUPER 미인증
    statusBox.textContent = 'SUPER 로그인 필요';
    logoutBtn.style.display = 'none';
    loginCard.style.display = 'block';
    mappingCard.style.display = 'none';

    if (loginBtn && idInput && pwInput && loginMsg) {
      loginBtn.addEventListener('click', async () => {
        const id = (idInput.value || '').trim();
        const pw = (pwInput.value || '').trim();

        if (!id || !pw) {
          loginMsg.textContent = '아이디와 비밀번호를 모두 입력해 주세요.';
          return;
        }

        loginMsg.textContent = '로그인 시도 중...';

        try {
          const r = await fetch('/api/super-login', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ id, password: pw }),
          });

          const data = await r.json().catch(() => null);

          if (!r.ok || !data || !data.ok || !data.token) {
            loginMsg.textContent = '로그인에 실패했습니다.';
            return;
          }

          setSuperToken(data.token);

          const me2 = await verifySuper();
          if (me2) {
            statusBox.textContent = `SUPER 로그인: ${me2.sub}`;
            logoutBtn.style.display = 'inline-flex';
            loginCard.style.display = 'none';
            mappingCard.style.display = 'block';

            renderMapTable();
            bindMappingForm();
          } else {
            loginMsg.textContent = '로그인에 실패했습니다. (검증 실패)';
          }
        } catch (e) {
          console.error('[store-admin] login error', e);
          loginMsg.textContent = '로그인 중 오류가 발생했습니다.';
        }
      });
    }
  }

  // 2) 로그아웃 버튼
  logoutBtn.addEventListener('click', () => {
    if (!confirm('SUPER에서 로그아웃할까요?')) return;
    setSuperToken('');
    location.reload();
  });
}

document.addEventListener('DOMContentLoaded', () => {
  init().catch((e) => console.error('[store-admin] init error', e));
});
