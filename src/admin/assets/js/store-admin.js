// /src/admin/assets/js/store-admin.js
// super 전용 로그인 + 매장 관리자(storeId) 매핑 페이지 전용 스크립트

import { get, patch } from '/src/admin/assets/js/modules/store.js';

const $ = (s, r = document) => r.querySelector(s);

// ▒▒ super 계정 설정 ▒▒
// 👉 필요하면 아래 두 값만 네가 원하는 ID/비밀번호로 바꿔 쓰면 돼.
const SUPER_ID = 'super';
const SUPER_PW = 'super1234!';

// 로그인 상태를 브라우저에 저장할 key
const SUPER_FLAG_KEY = 'qrnr.super.loggedIn';

// 매핑 저장 위치
// admin 콘솔에서 storeId를 찾을 때도 ['system','storeAdmins']를 쓰게 맞춰둔 상태
const PATH = ['system', 'storeAdmins'];

// ─────────────────────────────
// 로그인 상태 유틸
// ─────────────────────────────
function isSuperLoggedIn() {
  try {
    return localStorage.getItem(SUPER_FLAG_KEY) === '1';
  } catch (e) {
    return false;
  }
}
function setSuperLoggedIn(flag) {
  try {
    if (flag) {
      localStorage.setItem(SUPER_FLAG_KEY, '1');
    } else {
      localStorage.removeItem(SUPER_FLAG_KEY);
    }
  } catch (e) {
    // localStorage 사용 불가한 환경 대비 (무시)
  }
}

// ─────────────────────────────
// 매핑 데이터 로드/저장
// ─────────────────────────────
function loadMap() {
  return get(PATH) || {};
}
function saveMap(next) {
  patch(PATH, () => next);
}

// ─────────────────────────────
// 매핑 테이블 렌더링
// ─────────────────────────────
function renderMapTable() {
  const body = $('#map-body');
  if (!body) return;

  const map = loadMap();
  body.innerHTML = '';

  const entries = Object.entries(map);
  if (!entries.length) {
    body.innerHTML =
      '<tr><td colspan="3" class="small">등록된 매핑 없음</td></tr>';
    return;
  }

  entries.forEach(([adminId, storeId]) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${adminId}</td>
      <td>${storeId}</td>
      <td class="right">
        <button class="btn small" data-del="${adminId}">삭제</button>
      </td>
    `;
    body.appendChild(tr);
  });

  body.querySelectorAll('[data-del]').forEach((btn) => {
    btn.onclick = () => {
      const id = btn.getAttribute('data-del');
      const map = loadMap();
      delete map[id];
      saveMap(map);
      renderMapTable();
    };
  });
}

// ─────────────────────────────
// 매핑 입력폼 이벤트 바인딩
// ─────────────────────────────
function bindMapForm() {
  const addBtn = $('#map-add');
  if (!addBtn) return;

  addBtn.onclick = () => {
    const adminId = ($('#map-admin').value || '').trim();
    const storeId = ($('#map-store').value || '').trim();

    if (!adminId || !storeId) {
      alert('관리자 ID와 storeId를 모두 입력하세요.');
      return;
    }

    const map = loadMap();
    map[adminId] = storeId;
    saveMap(map);
    renderMapTable();

    // 입력값 정리
    $('#map-admin').value = adminId;
    $('#map-store').value = storeId;
  };
}

// ─────────────────────────────
// super 로그인 UI
// ─────────────────────────────
function renderLoginUI(onLoggedIn) {
  const container = $('.container');
  const mapCard = $('#map-body')?.closest('.card');

  if (!container) return;

  // 매핑 카드 숨기기
  if (mapCard) {
    mapCard.style.display = 'none';
  }

  // 이미 로그인 카드가 있다면 재사용
  let loginCard = $('#super-login-card');
  if (!loginCard) {
    loginCard = document.createElement('div');
    loginCard.id = 'super-login-card';
    loginCard.className = 'card vstack';
    loginCard.style.maxWidth = '480px';
    loginCard.style.marginTop = '16px';

    loginCard.innerHTML = `
      <h3>슈퍼 관리자 로그인</h3>
      <div class="small" style="margin-bottom:8px">
        이 페이지는 매장 관리자 매핑을 위한 <b>슈퍼 전용 설정 화면</b>입니다.
      </div>
      <div class="vstack" style="gap:8px;max-width:360px">
        <input
          id="super-login-id"
          class="input"
          placeholder="슈퍼 ID"
          autocomplete="off"
        >
        <input
          id="super-login-pw"
          class="input"
          type="password"
          placeholder="비밀번호"
          autocomplete="off"
        >
        <div class="hstack" style="gap:8px;justify-content:flex-end">
          <button id="super-login-btn" class="btn primary">로그인</button>
        </div>
        <p class="small" style="color:#9ca3af;margin-top:4px">
          ※ 이 로그인은 현재 브라우저 기준으로만 유지되며,
          실제 서비스용 보안 계정과는 별도로 운영할 수 있습니다.
        </p>
      </div>
    `;

    // h1 바로 아래에 끼워 넣기
    const h1 = container.querySelector('h1');
    if (h1 && h1.parentElement === container) {
      container.insertBefore(loginCard, h1.nextSibling);
    } else {
      container.appendChild(loginCard);
    }
  }

  const idInput = $('#super-login-id');
  const pwInput = $('#super-login-pw');
  const btn = $('#super-login-btn');

  if (!btn || !idInput || !pwInput) return;

  function tryLogin() {
    const id = (idInput.value || '').trim();
    const pw = pwInput.value || '';

    if (!id || !pw) {
      alert('ID와 비밀번호를 모두 입력하세요.');
      return;
    }
    if (id !== SUPER_ID || pw !== SUPER_PW) {
      alert('ID 또는 비밀번호가 올바르지 않습니다.');
      pwInput.value = '';
      pwInput.focus();
      return;
    }

    setSuperLoggedIn(true);
    alert('슈퍼 관리자 로그인에 성공했습니다.');

    // 로그인 카드 제거
    loginCard.remove();

    // 매핑 카드 보여주고 초기화
    if (mapCard) {
      mapCard.style.display = '';
    }
    if (typeof onLoggedIn === 'function') {
      onLoggedIn();
    }
  }

  btn.onclick = tryLogin;
  pwInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      tryLogin();
    }
  });
}

// ─────────────────────────────
// 슈퍼 로그아웃 버튼 추가
// ─────────────────────────────
function injectSuperLogoutButton() {
  const mapCard = $('#map-body')?.closest('.card');
  if (!mapCard) return;

  // 이미 버튼 있으면 중복 추가 X
  if ($('#super-logout-btn', mapCard)) return;

  const row = document.createElement('div');
  row.className = 'hstack';
  row.style.justifyContent = 'flex-end';
  row.style.marginTop = '8px';

  const btn = document.createElement('button');
  btn.id = 'super-logout-btn';
  btn.className = 'btn small';
  btn.textContent = '슈퍼 로그아웃';

  btn.onclick = () => {
    if (!confirm('슈퍼 관리자에서 로그아웃하시겠습니까?')) return;
    setSuperLoggedIn(false);
    location.reload();
  };

  row.appendChild(btn);
  mapCard.appendChild(row);
}

// ─────────────────────────────
// 진입점
// ─────────────────────────────
(function init() {
  // 아직 DOM이 준비되기 전일 수 있으니 안전하게 처리
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
    return;
  }

  if (!isSuperLoggedIn()) {
    // 로그인 필요
    renderLoginUI(() => {
      renderMapTable();
      bindMapForm();
      injectSuperLogoutButton();
    });
  } else {
    // 이미 로그인된 상태
    renderMapTable();
    bindMapForm();
    injectSuperLogoutButton();
  }
})();
