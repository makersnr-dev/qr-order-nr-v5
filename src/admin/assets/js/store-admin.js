// /src/admin/assets/js/store-admin.js
// SUPER용 JWT를 사용해 매장 관리자 매핑을 관리하는 스크립트
// 저장 구조: ['system','storeAdmins']
// 반드시 storeId는 문자열로 저장되도록 고정 처리됨

import { get, patch } from './modules/store.js';

const $ = (sel, root = document) => root.querySelector(sel);
const SUPER_TOKEN_KEY = 'qrnr.super.jwt';
const MAP_PATH = ['system', 'storeAdmins'];

// ======================================================
// SUPER 토큰 유틸
// ======================================================
function getSuperToken() {
  try {
    return localStorage.getItem(SUPER_TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

function setSuperToken(token) {
  try {
    if (token) localStorage.setItem(SUPER_TOKEN_KEY, token);
    else localStorage.removeItem(SUPER_TOKEN_KEY);
  } catch {}
}

function decodeToken(token) {
  if (!token) return null;
  const p = token.split('.');
  if (p.length < 2) return null;

  try {
    return JSON.parse(atob(p[1]));
  } catch {
    return null;
  }
}

// ======================================================
// 매장 관리자 매핑 로드/저장
// ======================================================
function loadMap() {
  const raw = get(MAP_PATH);
  return raw && typeof raw === 'object' ? { ...raw } : {};
}

function saveMap(map) {
  patch(MAP_PATH, () => map);
}

// ======================================================
// 매핑 UI 렌더링
// ======================================================
function renderMapTable() {
  const tbody = $('#map-body');
  const map = loadMap();

  tbody.innerHTML = '';

  const entries = Object.entries(map);
  if (!entries.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="small">등록된 매핑 없음</td></tr>`;
    return;
  }

  entries.forEach(([adminId, info]) => {
    const storeId = info?.storeId || '';
    const note = info?.note || '';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${adminId}</td>
      <td>${storeId}</td>
      <td>${note}</td>
      <td class="right">
        <a class="btn small"
           href="/admin?store=${encodeURIComponent(storeId)}"
           target="_blank">관리자 콘솔</a>
        <button class="btn small" data-del="${adminId}">삭제</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('[data-del]').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.del;
      if (!confirm(`"${target}" 매핑을 삭제할까요?`)) return;
      const map = loadMap();
      delete map[target];
      saveMap(map);
      renderMapTable();
    });
  });
}

// ======================================================
// 매핑 추가 UI
// ======================================================
function bindMappingUI() {
  $('#map-add').onclick = () => {
    const adminId = $('#map-admin').value.trim();
    const storeId = $('#map-store').value.trim();
    const note = $('#map-note').value.trim();

    if (!adminId || !storeId) {
      alert('관리자 ID와 storeId는 필수입니다.');
      return;
    }

    const map = loadMap();

    // 🔥 storeId를 반드시 문자열로 강제 저장
    map[adminId] = {
      storeId: String(storeId),
      note: String(note || "")
    };

    saveMap(map);
    renderMapTable();

    $('#map-admin').value = '';
    $('#map-store').value = '';
    $('#map-note').value = '';
  };
}

// ======================================================
// SUPER API
// ======================================================
async function fetchSuperMe() {
  try {
    const r = await fetch('/api/super-me');
    return r.ok ? r.json() : { ok:false };
  } catch {
    return { ok:false };
  }
}

async function superLogin(uid, pwd) {
  const r = await fetch('/api/super-login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ uid, pwd }),
  });
  return r.json();
}

async function superLogout() {
  try {
    await fetch('/api/super-logout', { method: 'POST' });
  } catch {}
}

// ======================================================
// 페이지 초기화
// ======================================================
async function init() {
  const statusText = $('#super-status-text');
  const logoutBtn = $('#super-logout');
  const loginCard = $('#super-login-card');
  const mappingCard = $('#mapping-card');

  // 로그인 상태 확인
  const me = await fetchSuperMe();

  if (me.ok && me.isSuper) {
    statusText.textContent = `SUPER 로그인: ${me.superId}`;
    logoutBtn.style.display = 'inline-flex';
    loginCard.style.display = 'none';
    mappingCard.style.display = 'block';

    renderMapTable();
    bindMappingUI();
  } else {
    statusText.textContent =
      'SUPER 로그인 필요: SUPER_ADMINS_JSON 환경변수를 확인하세요.';
    logoutBtn.style.display = 'none';
    loginCard.style.display = 'block';
    mappingCard.style.display = 'none';
  }

  // 로그인 버튼
  $('#super-login-btn').onclick = async () => {
    const uid = $('#super-id').value.trim();
    const pw = $('#super-pw').value.trim();
    const msg = $('#super-login-msg');

    if (!uid || !pw) {
      msg.textContent = '아이디와 비밀번호를 입력하세요.';
      return;
    }

    msg.textContent = '로그인 중...';

    const data = await superLogin(uid, pw);

    if (data.ok && data.token) {
      setSuperToken(data.token);
      location.reload();
    } else {
      msg.textContent = '로그인 실패: 아이디 또는 비밀번호 오류';
    }
  };

  logoutBtn.onclick = async () => {
    await superLogout();
    setSuperToken('');
    location.reload();
  };
}

init();
