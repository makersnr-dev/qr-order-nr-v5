// /src/admin/assets/js/store-admin.js
import { get, patch } from './modules/store.js';

const $ = (s, r=document) => r.querySelector(s);
const SUPER_TOKEN_KEY = 'qrnr.super.jwt';
const MAP_PATH = ['system', 'storeAdmins'];

function getSuperToken() {
  try { return localStorage.getItem(SUPER_TOKEN_KEY) || ''; }
  catch { return ''; }
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

  try { return JSON.parse(atob(p[1])); }
  catch { return null; }
}

function loadMap() {
  const raw = get(MAP_PATH);
  return raw && typeof raw === 'object' ? { ...raw } : {};
}

function saveMap(map) {
  patch(MAP_PATH, () => map);
}

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

function bindMappingUI() {
  $('#map-add').onclick = () => {
    const adminId = $('#map-admin').value.trim();
    const storeId = $('#map-store').value.trim();
    const note = $('#map-note').value.trim();
    const code = $('#map-code')?.value.trim(); // ⭐ 추가

    if (!adminId || !storeId) {
      alert('관리자 ID와 storeId는 필수입니다.');
      return;
    }

    const map = loadMap();
    map[adminId] = { storeId, note };
    saveMap(map);
    // ⭐ 매장 코드 저장 (/api/stores)
    if (code) {
      fetch('/api/stores', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          storeId,
          code
        })
      }).catch(() => {});
    }

    renderMapTable();

    $('#map-admin').value = '';
    $('#map-store').value = '';
    $('#map-note').value = '';
  };
}

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

async function init() {
  const statusText = $('#super-status-text');
  const logoutBtn = $('#super-logout');
  const loginCard = $('#super-login-card');
  const mappingCard = $('#mapping-card');

  const me = await fetchSuperMe();

  if (me.ok && me.isSuper) {
    statusText.textContent = `SUPER 로그인: ${me.superId}`;
    logoutBtn.style.display = 'inline-flex';
    loginCard.style.display = 'none';
    mappingCard.style.display = 'block';
    renderMapTable();
    bindMappingUI();
  } else {
    statusText.textContent = '';
    logoutBtn.style.display = 'none';
    loginCard.style.display = 'block';
    mappingCard.style.display = 'none';
  }

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

  // 🔥 SUPER 로그아웃 버튼 — 쿠키 + localStorage 모두 삭제
  logoutBtn.onclick = async () => {
    if (!confirm('로그아웃할까요?')) return;

    await superLogout();      // super_token 쿠키 삭제
    setSuperToken('');        // localStorage 삭제

    location.reload();
  };
}

init();
