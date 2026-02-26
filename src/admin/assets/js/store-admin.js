// /src/admin/assets/js/store-admin.js
import { get, patch } from './modules/store.js';

function superHeaders() {
  return {
    'content-type': 'application/json',
    'authorization': `Bearer ${getSuperToken()}`
  };
}


const $ = (s, r = document) => r.querySelector(s);

// ⚠️ 이 토큰은 SUPER 매핑 페이지 전용
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
  } catch { }
}

// ------------------------------------------------------------
// Pagination & Tabs State
// ------------------------------------------------------------
let currentTab = 'store'; // store | register | mapping
const state = {
  store: { page: 1, limit: 10, search: '', total: 0 },
  mapping: { page: 1, limit: 10, search: '', total: 0 },
  admin: { page: 1, limit: 10, search: '', total: 0 }
};

// ------------------------------------------------------------
// Tab Logic
// ------------------------------------------------------------
function showTab(tabName) {
  currentTab = tabName;

  // Hide all sections
  $('#section-store').style.display = 'none';
  $('#section-register').style.display = 'none';
  $('#section-mapping').style.display = 'none';

  // Show active section
  $(`#section-${tabName}`).style.display = 'block';

  // Highlight button
  ['store', 'register', 'mapping'].forEach(t => {
    const btn = $(`#tab-btn-${t}`);
    if (t === tabName) {
      btn.style.fontWeight = 'bold';
      btn.style.borderBottom = '2px solid #2ea043';
      btn.style.color = '#2ea043';
    } else {
      btn.style.fontWeight = 'normal';
      btn.style.borderBottom = 'none';
      btn.style.color = '#9fb0c0';
    }
  });

  // Reset search state when switching tabs
  if (tabName === 'store') {
    state.store.search = '';
    state.store.page = 1;
    $('#store-search-input').value = '';
    renderStoreTable();
  }
  if (tabName === 'register') {
    state.admin.search = '';
    state.admin.page = 1;
    const adminSearchInput = $('#admin-search-input');
    if (adminSearchInput) adminSearchInput.value = '';
    renderAdminTable();
  }
  if (tabName === 'mapping') {
    state.mapping.search = '';
    state.mapping.page = 1;
    const mapSearchInput = $('#map-search-input');
    if (mapSearchInput) mapSearchInput.value = '';
    renderMapTable();
  }
}

// ------------------------------------------------------------
// Pagination Renderer
// ------------------------------------------------------------
function renderPagination(total, currentPage, limit, containerId, onPageChange) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';

  const totalPages = Math.ceil(total / limit);
  if (totalPages <= 1) return;

  // Prev Button
  const prevBtn = document.createElement('button');
  prevBtn.className = 'btn small';
  prevBtn.textContent = '이전';
  prevBtn.disabled = currentPage === 1;
  if (currentPage === 1) {
    prevBtn.style.opacity = '0.5';
    prevBtn.style.cursor = 'not-allowed';
  }
  prevBtn.onclick = () => onPageChange(currentPage - 1);
  container.appendChild(prevBtn);

  // Page Numbers
  // (Simple logic: show all or max 10. For now show all within reasonable range)
  let start = Math.max(1, currentPage - 4);
  let end = Math.min(totalPages, currentPage + 4);

  for (let i = start; i <= end; i++) {
    const btn = document.createElement('button');
    btn.className = 'btn small';
    btn.textContent = i;

    // Highlight Current Page
    if (i === currentPage) {
      btn.style.fontWeight = 'bold';
      btn.style.backgroundColor = '#2ea043';
      btn.style.borderColor = '#2ea043';
      btn.style.color = '#fff';
    } else {
      btn.style.backgroundColor = '#0b1620';
      btn.style.color = '#e6edf3';
      btn.onclick = () => onPageChange(i);
    }

    container.appendChild(btn);
  }

  // Next Button
  const nextBtn = document.createElement('button');
  nextBtn.className = 'btn small';
  nextBtn.textContent = '다음';
  nextBtn.disabled = currentPage === totalPages;
  if (currentPage === totalPages) {
    nextBtn.style.opacity = '0.5';
    nextBtn.style.cursor = 'not-allowed';
  }
  nextBtn.onclick = () => onPageChange(currentPage + 1);
  container.appendChild(nextBtn);
}


// ------------------------------------------------------------
// Mapping Logic (Paginated)
// ------------------------------------------------------------
async function renderMapTable() {
  const tbody = $('#map-body');
  const { page, limit, search } = state.mapping;

  // Disable search button during loading
  const searchBtn = $('#map-search-btn');
  const clearBtn = $('#map-clear-btn');
  if (searchBtn) searchBtn.disabled = true;
  if (clearBtn) clearBtn.disabled = true;

  tbody.innerHTML = '<tr><td colspan="4" class="small" style="text-align:center;padding:20px;color:#3b82f6">⏳ 불러오는 중...</td></tr>';

  try {
    const res = await fetch(`/api/admin/list-mappings?page=${page}&limit=${limit}&search=${encodeURIComponent(search)}`);

    if (!res.ok) {
      throw new Error(`서버 오류 (${res.status})`);
    }

    const data = await res.json();

    if (data.ok) {
      state.mapping.total = data.total;
      const mappings = data.mappings || [];

      tbody.innerHTML = '';
      if (mappings.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="small" style="text-align:center;padding:20px;color:#9fb0c0">검색 결과가 없습니다.</td></tr>`;
      } else {
        mappings.forEach(m => {
          const tr = document.createElement('tr');
          const isDefault = m.is_default ? '<span style="color:#10b981">기본</span>' : '-';

          tr.innerHTML = `
            <td>${m.admin_id} <div style="font-size:12px;color:#888">${m.admin_name || '-'}</div></td>
            <td>${m.store_id} <div style="font-size:12px;color:#888">${m.store_name || '-'}</div></td>
            <td style="text-align:center">${m.is_default ? '<span style="color:#10b981">기본</span>' : (m.note || '-')}</td>
            <td class="right">
              <a class="btn small" href="/admin?store=${encodeURIComponent(m.store_id)}" target="_blank" style="margin-right:4px">이동</a>
              <button class="btn small danger" data-del-admin="${m.admin_id}" data-del-store="${m.store_id}">삭제</button>
            </td>
          `;
          tbody.appendChild(tr);
        });
      }

      // Bind Delete Events
      tbody.querySelectorAll('[data-del-admin]').forEach(btn => {
        btn.onclick = async () => {
          const adminId = btn.dataset.delAdmin;
          const storeId = btn.dataset.delStore;

          if (!confirm(`매핑을 삭제하시겠습니까?\n(Admin: ${adminId}, Store: ${storeId})`)) return;

          try {
            const res = await fetch('/api/admin/delete-mapping', {
              method: 'POST',
              headers: superHeaders(),
              body: JSON.stringify({ adminId, storeId })
            });
            const d = await res.json();
            if (d.ok) {
              renderMapTable();
            } else {
              alert(`삭제 실패: ${d.message || d.error}`);
              console.error('Delete failed:', d.error || d.message);
            }
          } catch (e) {
            console.error('Delete request error:', e);
          }
        };
      });

      // Render Pagination
      renderPagination(data.total, page, limit, 'pagination-mapping', (newPage) => {
        state.mapping.page = newPage;
        renderMapTable();
      });

    } else {
      tbody.innerHTML = `<tr><td colspan="4" class="small" style="text-align:center;padding:20px;color:#ef4444">❌ 오류: ${data.error}</td></tr>`;
    }
  } catch (e) {
    console.error('DB 매핑 로드 실패:', e);
    const errorMsg = e.message.includes('서버')
      ? `서버 오류: ${e.message}`
      : '네트워크 연결 오류. 인터넷 연결을 확인하세요.';
    tbody.innerHTML = `<tr><td colspan="4" class="small" style="text-align:center;padding:20px;color:#ef4444">❌ ${errorMsg}</td></tr>`;
  } finally {
    // Re-enable buttons
    if (searchBtn) searchBtn.disabled = false;
    if (clearBtn) clearBtn.disabled = false;
  }
}

// ------------------------------------------------------------
// Store Logic (Paginated)
// ------------------------------------------------------------
async function renderStoreTable() {
  const tbody = $('#store-body');
  const { page, limit, search } = state.store;

  // Disable search button during loading
  const searchBtn = $('#store-search-btn');
  const clearBtn = $('#store-clear-btn');
  if (searchBtn) searchBtn.disabled = true;
  if (clearBtn) clearBtn.disabled = true;

  tbody.innerHTML = '<tr><td colspan="4" class="small" style="text-align:center;padding:20px;color:#3b82f6">⏳ 불러오는 중...</td></tr>';

  try {
    const res = await fetch(`/api/stores?page=${page}&limit=${limit}&search=${encodeURIComponent(search)}`, {
      headers: superHeaders()
    });

    if (!res.ok) {
      throw new Error(`서버 오류 (${res.status})`);
    }

    const data = await res.json();
    state.store.total = data.total || 0;

    tbody.innerHTML = '';
    if (!data.list || data.list.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="small" style="text-align:center;padding:20px;color:#9fb0c0">검색 결과가 없습니다.</td></tr>';
    } else {
      data.list.forEach(s => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${s.store_id}</td>
          <td>${s.name || '-'}</td>
          <td>${s.code || '-'}</td>
          <td class="right"><button class="btn small danger" data-del="${s.store_id}">삭제</button></td>
        `;
        tbody.appendChild(tr);
      });
    }

    // Bind Delete Buttons
    tbody.querySelectorAll('[data-del]').forEach(btn => {
      btn.onclick = async () => {
        const storeId = btn.dataset.del;
        if (!confirm(`${storeId} 매장을 삭제하시겠습니까?`)) return;

        await fetch('/api/stores', {
          method: 'DELETE',
          headers: superHeaders(),
          body: JSON.stringify({ storeId })
        });

        renderStoreTable();
      };
    });

    // Render Pagination
    renderPagination(data.total, page, limit, 'pagination-store', (newPage) => {
      state.store.page = newPage;
      renderStoreTable();
    });

  } catch (e) {
    console.error('Store load error:', e);
    const errorMsg = e.message.includes('서버')
      ? `서버 오류: ${e.message}`
      : '네트워크 연결 오류. 인터넷 연결을 확인하세요.';
    tbody.innerHTML = `<tr><td colspan="4" class="small" style="text-align:center;padding:20px;color:#ef4444">❌ ${errorMsg}</td></tr>`;
  } finally {
    // Re-enable buttons
    if (searchBtn) searchBtn.disabled = false;
    if (clearBtn) clearBtn.disabled = false;
  }
}

// ------------------------------------------------------------
// Events Binding
// ------------------------------------------------------------
function bindEvents() {
  // 1. Tab Buttons
  $('#tab-btn-store').onclick = () => showTab('store');
  $('#tab-btn-register').onclick = () => showTab('register');
  $('#tab-btn-mapping').onclick = () => showTab('mapping');

  // 2. Store Search
  $('#store-search-btn').onclick = () => {
    state.store.search = $('#store-search-input').value.trim();
    state.store.page = 1;
    renderStoreTable();
  };
  $('#store-search-input').onkeydown = (e) => {
    if (e.key === 'Enter') $('#store-search-btn').click();
  };

  // Store Clear Button
  const storeClearBtn = $('#store-clear-btn');
  if (storeClearBtn) {
    storeClearBtn.onclick = () => {
      state.store.search = '';
      state.store.page = 1;
      $('#store-search-input').value = '';
      renderStoreTable();
    };
  }

  // 3. Mapping Search
  $('#map-search-btn').onclick = () => {
    state.mapping.search = $('#map-search-input').value.trim();
    state.mapping.page = 1;
    renderMapTable();
  };
  $('#map-search-input').onkeydown = (e) => {
    if (e.key === 'Enter') $('#map-search-btn').click();
  };

  // Mapping Clear Button
  const mapClearBtn = $('#map-clear-btn');
  if (mapClearBtn) {
    mapClearBtn.onclick = () => {
      state.mapping.search = '';
      state.mapping.page = 1;
      $('#map-search-input').value = '';
      renderMapTable();
    };
  }
  // 4. Admin Search
  const adminSearchBtn = $('#admin-search-btn');
  if (adminSearchBtn) {
    adminSearchBtn.onclick = () => {
      state.admin.search = $('#admin-search-input').value.trim();
      state.admin.page = 1;
      renderAdminTable();
    };
  }
  const adminSearchInput = $('#admin-search-input');
  if (adminSearchInput) {
    adminSearchInput.onkeydown = (e) => {
      if (e.key === 'Enter') $('#admin-search-btn').click();
    };
  }
  const adminClearBtn = $('#admin-clear-btn');
  if (adminClearBtn) {
    adminClearBtn.onclick = () => {
      state.admin.search = '';
      state.admin.page = 1;
      $('#admin-search-input').value = '';
      renderAdminTable();
    };
  }
}


async function renderAdminTable() {
  const tbody = $('#admin-list-body');
  if (!tbody) return;
  const { page, limit, search } = state.admin;

  const searchBtn = $('#admin-search-btn');
  const clearBtn = $('#admin-clear-btn');
  if (searchBtn) searchBtn.disabled = true;
  if (clearBtn) clearBtn.disabled = true;

  tbody.innerHTML = '<tr><td colspan="4" class="small" style="text-align:center;padding:20px;color:#3b82f6">⏳ 불러오는 중...</td></tr>';

  try {
    const res = await fetch(`/api/admin/list-admins?page=${page}&limit=${limit}&search=${encodeURIComponent(search)}`, {
      headers: superHeaders()
    });

    if (!res.ok) throw new Error(`서버 오류 (${res.status})`);

    const data = await res.json();
    if (data.ok) {
      state.admin.total = data.total;
      tbody.innerHTML = '';
      if (data.admins.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="small" style="text-align:center;padding:20px;color:#9fb0c0">검색 결과가 없습니다.</td></tr>';
      } else {
        data.admins.forEach(a => {
          const tr = document.createElement('tr');
          const date = a.created_at ? new Date(a.created_at).toLocaleDateString() : '-';
          tr.innerHTML = `
            <td>${a.id}</td>
            <td>${a.name}</td>
            <td>${date}</td>
            <td class="right"><button class="btn small danger" data-del-admin-id="${a.id}">삭제</button></td>
          `;
          tbody.appendChild(tr);
        });
      }

      // Deletion Handler
      tbody.querySelectorAll('[data-del-admin-id]').forEach(btn => {
        btn.onclick = async () => {
          const adminId = btn.dataset.delAdminId;
          if (!confirm(`${adminId} 관리자 계정을 삭제하시겠습니까?`)) return;

          try {
            const dr = await fetch('/api/admin/delete-admin', {
              method: 'POST',
              headers: superHeaders(),
              body: JSON.stringify({ adminId })
            });
            const dd = await dr.json();
            if (dd.ok) {
              alert('성공적으로 삭제되었습니다.');
              renderAdminTable();
            } else {
              alert(`삭제 실패: ${dd.message || dd.error}`);
            }
          } catch (e) {
            alert(`오류: ${e.message}`);
          }
        };
      });

      renderPagination(data.total, page, limit, 'pagination-admin', (p) => {
        state.admin.page = p;
        renderAdminTable();
      });
    }
  } catch (e) {
    console.error(e);
    tbody.innerHTML = `<tr><td colspan="4" class="small" style="text-align:center;padding:20px;color:#ef4444">❌ 로드 실패: ${e.message}</td></tr>`;
  } finally {
    if (searchBtn) searchBtn.disabled = false;
    if (clearBtn) clearBtn.disabled = false;
  }
}

// 👤 관리자 등록 함수 (기존 로직 유지)
async function registerAdmin() {
  const id = $('#new-admin-id').value.trim();
  const password = $('#new-admin-pw').value.trim();
  const name = $('#new-admin-name').value.trim();
  const storeId = $('#new-admin-store').value.trim();
  const email = $('#new-admin-email').value.trim();
  const phone = $('#new-admin-phone').value.trim();
  const resultDiv = $('#register-result');

  if (!id || !password || !name) {
    resultDiv.innerHTML = '<span style="color:#ef4444">❌ ID, 비밀번호, 이름은 필수 항목입니다</span>';
    return;
  }
  if (password.length < 4) {
    resultDiv.innerHTML = '<span style="color:#ef4444">❌ 비밀번호는 최소 4자 이상이어야 합니다</span>';
    return;
  }

  resultDiv.innerHTML = '<span style="color:#3b82f6">⏳ 등록 중...</span>';
  const btn = $('#btn-register-admin');
  btn.disabled = true;

  try {
    const token = getSuperToken();
    const res = await fetch('/api/admin/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ id, password, name, storeId, email, phone })
    });

    const data = await res.json();

    if (data.ok) {
      resultDiv.innerHTML = `<span style="color:#10b981">✅ ${data.admin.name} (${data.admin.id}) 등록 완료!</span>`;
      $('#new-admin-id').value = '';
      $('#new-admin-pw').value = '';
      $('#new-admin-name').value = '';
      $('#new-admin-store').value = '';
      $('#new-admin-email').value = '';
      $('#new-admin-phone').value = '';
      renderAdminTable(); // 목록 갱신
      setTimeout(() => { resultDiv.innerHTML = ''; }, 3000);
    } else {
      resultDiv.innerHTML = `<span style="color:#ef4444">❌ ${data.message || data.error}</span>`;
    }
  } catch (error) {
    resultDiv.innerHTML = `<span style="color:#ef4444">❌ 네트워크 오류: ${error.message}</span>`;
  } finally {
    btn.disabled = false;
  }
}

// ------------------------------------------------------------
// Register UI Binding
// ------------------------------------------------------------
function bindRegisterUI() {
  const btn = $('#btn-register-admin');
  if (btn) btn.onclick = registerAdmin;
}

// Map Add (Logic Updated)
function bindMappingUI() {
  const mapAddBtn = $('#map-add');
  if (!mapAddBtn) return;

  mapAddBtn.onclick = async () => {
    const adminId = $('#map-admin').value.trim();
    const storeId = $('#map-store').value.trim();
    const note = $('#map-note').value.trim();

    // Create result div if it doesn't exist
    let mapResultDiv = document.getElementById('map-add-result');
    if (!mapResultDiv) {
      mapResultDiv = document.createElement('div');
      mapResultDiv.id = 'map-add-result';
      mapResultDiv.style.marginTop = '8px';
      mapResultDiv.style.fontSize = '14px';
      mapAddBtn.parentElement.appendChild(mapResultDiv);
    }

    mapResultDiv.innerHTML = ''; // Clear previous messages

    if (!adminId || !storeId) {
      mapResultDiv.innerHTML = '<span style="color:#ef4444">❌ 관리자 ID와 storeId는 필수입니다.</span>';
      return;
    }

    mapResultDiv.innerHTML = '<span style="color:#3b82f6">⏳ 매핑 저장 중...</span>';
    mapAddBtn.disabled = true;

    try {
      const token = getSuperToken();
      const dbRes = await fetch('/api/admin/add-mapping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ adminId, storeId, note })
      });
      const dbData = await dbRes.json();

      if (dbData.ok) {
        mapResultDiv.innerHTML = `<span style="color:#10b981">✅ 매핑 저장 완료</span>`;
        $('#map-admin').value = '';
        $('#map-store').value = '';
        $('#map-note').value = '';
        renderMapTable();
        setTimeout(() => { mapResultDiv.innerHTML = ''; }, 3000);
      } else {
        mapResultDiv.innerHTML = `<span style="color:#ef4444">❌ 저장 실패: ${dbData.message || dbData.error}</span>`;
        console.error('Mapping add failed:', dbData.error || dbData.message);
      }
    } catch (e) {
      mapResultDiv.innerHTML = `<span style="color:#ef4444">❌ 네트워크 오류: ${e.message}</span>`;
      console.error('Mapping add request error:', e);
    } finally {
      mapAddBtn.disabled = false;
    }
  };
}

// ------------------------------------------------------------
// Chosung Search (Existing)
// ------------------------------------------------------------
function getChosung(str) {
  const CHO = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
  let result = "";
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i) - 44032;
    if (code > -1 && code < 11172) result += CHO[Math.floor(code / 588)];
    else result += str.charAt(i);
  }
  return result;
}

function matchStore(store, keyword) {
  if (!keyword) return true;
  const k = keyword.trim().toLowerCase();
  const n = (store.name || "").toLowerCase();
  const id = (store.storeId || "").toLowerCase();
  if (n.includes(k) || id.includes(k)) return true;
  if (getChosung(n).includes(k)) return true;
  return false;
}

let cachedStoresForCombo = [];
async function fetchStoresForCombo() {
  if (cachedStoresForCombo.length > 0) return cachedStoresForCombo;
  try {
    const r = await fetch('/api/stores?limit=100'); // Load top 100 for combo or logic change required for full search
    if (r.ok) {
      const data = await r.json();
      cachedStoresForCombo = (data.list || []).map(s => ({
        storeId: s.store_id,
        name: s.name,
        code: s.code
      }));
    }
  } catch (e) { console.error(e); }
  return cachedStoresForCombo;
}

function setupStoreCombobox(inputId, listId) {
  const input = document.getElementById(inputId);
  const list = document.getElementById(listId);
  if (!input || !list) return;

  const render = (items) => {
    list.innerHTML = "";
    if (items.length === 0) {
      list.style.display = "none";
      return;
    }
    list.style.display = "block";
    items.forEach(store => {
      const li = document.createElement("li");
      li.style.padding = "8px 12px";
      li.style.cursor = "pointer";
      li.style.fontSize = "14px";
      li.style.borderBottom = "1px solid var(--border)";
      li.style.color = "var(--text)";
      li.onmouseover = () => { li.style.background = "#1f2937"; };
      li.onmouseout = () => { li.style.background = "#111922"; };
      li.innerHTML = `<div><b>${store.name}</b></div><div style="font-size:12px;color:#9fb0c0">${store.storeId}</div>`;
      li.onclick = () => {
        input.value = store.storeId;
        list.style.display = "none";
      };
      list.appendChild(li);
    });
  };

  const handleInput = async () => {
    const stores = await fetchStoresForCombo();
    const val = input.value;
    const filtered = stores.filter(s => matchStore(s, val)).slice(0, 10);
    render(filtered);
  };

  input.addEventListener("input", handleInput);
  input.addEventListener("focus", handleInput);
  document.addEventListener("click", (e) => {
    if (!input.contains(e.target) && !list.contains(e.target)) {
      list.style.display = "none";
    }
  });
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
  try { await fetch('/api/super-logout', { method: 'POST' }); } catch { }
}

async function fetchSuperMe() {
  try {
    const r = await fetch('/api/super-me', {credentials: 'include' });
    return r.ok ? r.json() : { ok: false };
  } catch { return { ok: false }; }
}

// ------------------------------------------------------------
// INIT
// ------------------------------------------------------------
async function init() {
  const statusText = $('#super-status-text');
  const logoutBtn = $('#super-logout');
  const loginCard = $('#super-login-card');
  const mainContent = $('#main-content'); // New container

  const me = await fetchSuperMe();

  if (me.ok && me.isSuper) {
    statusText.textContent = `SUPER 로그인: ${me.superId}`;
    logoutBtn.style.display = 'inline-flex';
    loginCard.style.display = 'none';
    $('#main-content').style.display = 'block';

    // Bind UI
    bindStoreUI();
    bindMappingUI();
    bindRegisterUI();
    bindEvents();

    // Setup Combobox for Admin Registration
    setupStoreCombobox("new-admin-store", "store-search-results");

    // 🔥 FIX: Activate default tab on initial load
    showTab('store');

  } else {
    statusText.textContent = '';
    logoutBtn.style.display = 'none';
    loginCard.style.display = 'block';
    $('#main-content').style.display = 'none';
  }

  // Login Button
 $('#super-login-btn').onclick = async () => {
    const uid = $('#super-id').value.trim();
    const pw = $('#super-pw').value.trim();
    const msg = $('#super-login-msg');

    if (!uid || !pw) {
      msg.textContent = '아이디와 비밀번호를 입력하세요.';
      return;
    }

    msg.style.color = '#3b82f6';
    msg.textContent = '로그인 시도 중...';

    try {
      // 1. 서버에 로그인 요청
      const res = await fetch('/api/super-login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ uid, pwd: pw }), // 백엔드 필드명 pwd 확인
      });
      const data = await res.json();

      if (data.ok) {
        // 2. [핵심] 서버가 준 토큰을 로컬 스토리지에 저장 (403 에러 방지용)
        // 위에서 정의한 SUPER_TOKEN_KEY ('qrnr.super.jwt')를 사용합니다.
        if (data.token) {
            setSuperToken(data.token);
        }

        msg.style.color = '#10b981';
        msg.textContent = '✅ 로그인 성공! 페이지를 불러옵니다.';

        // 3. [핵심] 새로고침을 통해 즉시 UI 상태(fetchSuperMe)를 갱신
        // 가장 안정적인 방법입니다.
        setTimeout(() => {
            location.reload();
        }, 500); 

      } else {
        msg.style.color = '#ef4444';
        msg.textContent = '❌ 로그인 실패: 아이디 또는 비밀번호를 확인하세요.';
      }
    } catch (e) {
      console.error(e);
      msg.style.color = '#ef4444';
      msg.textContent = '❌ 서버와 통신할 수 없습니다.';
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


function bindStoreUI() {
  const btn = document.getElementById('store-save');
  if (!btn) return;

  btn.onclick = async () => {
    const storeId = document.getElementById('store-id').value.trim();
    const name = document.getElementById('store-name').value.trim();
    const code = document.getElementById('store-code').value.trim();

    // Create result div if it doesn't exist
    let resultDiv = document.getElementById('store-save-result');
    if (!resultDiv) {
      resultDiv = document.createElement('div');
      resultDiv.id = 'store-save-result';
      resultDiv.style.marginTop = '8px';
      resultDiv.style.fontSize = '14px';
      btn.parentElement.appendChild(resultDiv);
    }

    if (!storeId || !code) {
      resultDiv.innerHTML = '<span style="color:#ef4444">❌ Store ID와 주문 코드는 필수입니다.</span>';
      return;
    }

    resultDiv.innerHTML = '<span style="color:#3b82f6">⏳ 저장 중...</span>';

    try {
      // Check if store exists
      const checkRes = await fetch(`/api/stores?page=1&limit=1&search=${encodeURIComponent(storeId)}`);
      const checkData = await checkRes.json();
      const exists = checkData.list && checkData.list.some(s => s.store_id === storeId);

      const method = exists ? 'PUT' : 'POST';
      const res = await fetch('/api/stores', {
        method,
        headers: superHeaders(),
        body: JSON.stringify({ storeId, name, code })
      });

      const data = await res.json();

      if (data.ok) {
        resultDiv.innerHTML = `<span style="color:#10b981">✅ ${exists ? '수정' : '등록'} 완료!</span>`;
        document.getElementById('store-id').value = '';
        document.getElementById('store-name').value = '';
        document.getElementById('store-code').value = '';
        renderStoreTable();
        setTimeout(() => { resultDiv.innerHTML = ''; }, 3000);
      } else {
        resultDiv.innerHTML = `<span style="color:#ef4444">❌ ${data.error || data.message}</span>`;
      }
    } catch (e) {
      console.error('Store save error:', e);
      resultDiv.innerHTML = '<span style="color:#ef4444">❌ 저장 중 오류가 발생했습니다.</span>';
    }
  };
}
