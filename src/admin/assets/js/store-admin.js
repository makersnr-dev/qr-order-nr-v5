// /src/admin/assets/js/store-admin.js
import { query } from '../../../../api/_lib/db.js';

const $ = (s, r=document) => r.querySelector(s);

const SUPER_TOKEN_KEY = 'qrnr.super.jwt';

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

function superHeaders() {
  const token = getSuperToken();
  return {
    'content-type': 'application/json',
    'authorization': token ? `Bearer ${token}` : ''
  };
}

// =====================================================
// 매장-관리자 매핑 관리 (DB 기반)
// =====================================================

async function loadMappings() {
  try {
    const res = await fetch('/api/admin-mappings', {
      headers: superHeaders()
    });
    
    if (!res.ok) return [];
    
    const data = await res.json();
    return data.mappings || [];
  } catch (e) {
    console.error('[loadMappings] error:', e);
    return [];
  }
}

async function renderMapTable() {
  const tbody = $('#map-body');
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="4" class="small">불러오는 중...</td></tr>';

  const mappings = await loadMappings();

  if (!mappings.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="small">등록된 매핑 없음</td></tr>';
    return;
  }

  tbody.innerHTML = '';

  mappings.forEach(m => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${m.admin_key}</td>
      <td>${m.store_id}</td>
      <td>${m.note || '-'}</td>
      <td class="right">
        <a class="btn small"
           href="/admin?store=${encodeURIComponent(m.store_id)}"
           target="_blank">관리자 콘솔</a>
        <button class="btn small danger" data-del="${m.admin_key}" data-store="${m.store_id}">삭제</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // 삭제 버튼 바인딩
  tbody.querySelectorAll('[data-del]').forEach(btn => {
    btn.onclick = async () => {
      const adminKey = btn.dataset.del;
      const storeId = btn.dataset.store;
      
      if (!confirm(`"${adminKey}" 매핑을 삭제할까요?`)) return;

      try {
        const res = await fetch('/api/admin-mappings', {
          method: 'DELETE',
          headers: superHeaders(),
          body: JSON.stringify({ adminKey, storeId })
        });

        if (!res.ok) throw new Error();

        await renderMapTable();
      } catch (e) {
        alert('삭제 실패');
      }
    };
  });
}

function bindMappingUI() {
  const addBtn = $('#map-add');
  if (!addBtn) return;

  addBtn.onclick = async () => {
    const adminKey = $('#map-admin').value.trim();
    const storeId = $('#map-store').value.trim();
    const note = $('#map-note').value.trim();

    if (!adminKey || !storeId) {
      alert('관리자 ID와 storeId는 필수입니다.');
      return;
    }

    try {
      // 매장 존재 확인
      const storeRes = await fetch('/api/stores');
      const storeData = await storeRes.json();

      if (!storeData.stores || !storeData.stores[storeId]) {
        alert('존재하지 않는 storeId입니다.');
        return;
      }

      // 매핑 추가
      const res = await fetch('/api/admin-mappings', {
        method: 'POST',
        headers: superHeaders(),
        body: JSON.stringify({ adminKey, storeId, note })
      });

      if (!res.ok) throw new Error();

      $('#map-admin').value = '';
      $('#map-store').value = '';
      $('#map-note').value = '';

      await renderMapTable();
    } catch (e) {
      alert('매핑 추가 실패');
    }
  };
}

// =====================================================
// 매장 관리 (DB 기반)
// =====================================================

async function renderStoreTable() {
  const tbody = $('#store-body');
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="4" class="small">불러오는 중...</td></tr>';

  try {
    const res = await fetch('/api/stores');
    const data = await res.json();

    const stores = data.stores || {};
    const entries = Object.entries(stores);

    if (!entries.length) {
      tbody.innerHTML = '<tr><td colspan="4" class="small">등록된 매장 없음</td></tr>';
      return;
    }

    tbody.innerHTML = '';

    entries.forEach(([storeId, info]) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${storeId}</td>
        <td>${info.name || '-'}</td>
        <td>${info.code || '-'}</td>
        <td class="right">
          <button class="btn small danger" data-del-store="${storeId}">삭제</button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    // 삭제 버튼 바인딩
    tbody.querySelectorAll('[data-del-store]').forEach(btn => {
      btn.onclick = async () => {
        const storeId = btn.dataset.delStore;
        if (!confirm(`매장 "${storeId}"를 삭제할까요?`)) return;

        try {
          const res = await fetch('/api/stores', {
            method: 'DELETE',
            headers: superHeaders(),
            body: JSON.stringify({ storeId })
          });

          if (!res.ok) throw new Error();

          await renderStoreTable();
        } catch (e) {
          alert('삭제 실패');
        }
      };
    });
  } catch (e) {
    console.error('[renderStoreTable] error:', e);
    tbody.innerHTML = '<tr><td colspan="4" class="small">불러오기 실패</td></tr>';
  }
}

function bindStoreUI() {
  const saveBtn = $('#store-save');
  if (!saveBtn) return;

  saveBtn.onclick = async () => {
    const storeId = $('#store-id').value.trim();
    const name = $('#store-name').value.trim();
    const code = $('#store-code').value.trim();

    if (!storeId || !code) {
      alert('storeId와 주문 코드는 필수입니다.');
      return;
    }

    try {
      // 기존 매장 확인
      const checkRes = await fetch('/api/stores');
      const checkData = await checkRes.json();
      const exists = checkData.stores && checkData.stores[storeId];

      // 생성 또는 수정
      const res = await fetch('/api/stores', {
        method: exists ? 'PUT' : 'POST',
        headers: superHeaders(),
        body: JSON.stringify({ storeId, name, code })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'SAVE_FAILED');
      }

      $('#store-id').value = '';
      $('#store-name').value = '';
      $('#store-code').value = '';

      await renderStoreTable();
    } catch (e) {
      alert('저장 실패: ' + e.message);
    }
  };
}

// =====================================================
// SUPER 로그인
// =====================================================

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
  const storeCard = $('#store-card');

  const me = await fetchSuperMe();

  if (me.ok && me.isSuper) {
    statusText.textContent = `SUPER 로그인: ${me.superId}`;
    logoutBtn.style.display = 'inline-flex';
    loginCard.style.display = 'none';
    mappingCard.style.display = 'block';
    storeCard.style.display = 'block';
    
    await renderMapTable();
    await renderStoreTable();
    bindMappingUI();
    bindStoreUI();
  } else {
    statusText.textContent = '';
    logoutBtn.style.display = 'none';
    loginCard.style.display = 'block';
    mappingCard.style.display = 'none';
    storeCard.style.display = 'none';
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

  logoutBtn.onclick = async () => {
    if (!confirm('로그아웃할까요?')) return;
    await superLogout();
    setSuperToken('');
    location.reload();
  };
}

init();
