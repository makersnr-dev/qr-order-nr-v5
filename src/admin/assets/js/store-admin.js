// /src/admin/assets/js/store-admin.js

const $ = (s, r = document) => r.querySelector(s);

/**
 * 🚀 SUPER 관리자용 표준 토스트 함수
 * (admin.js의 showToast와 규격을 맞춤)
 */
function showSuperToast(msg, variant = 'info') {
    const t = document.createElement('div');
    t.className = `toast show toast-${variant}`;
    // 스타일을 직접 주입하여 CSS 의존성을 낮춤 (안전장치)
    t.style.cssText = "position:fixed; bottom:20px; left:50%; transform:translateX(-50%); z-index:10000; background:#111922; color:#fff; padding:12px 20px; border-radius:10px; border:1px solid #263241; transition: opacity 0.3s;";
    
    // 상황별 색상 포인트
    if (variant === 'success') t.style.borderLeft = "5px solid #2ea043";
    if (variant === 'error') t.style.borderLeft = "5px solid #ef4444";
    if (variant === 'warning') t.style.borderLeft = "5px solid #facc15";
    
    t.textContent = msg;
    document.body.appendChild(t);
    
    setTimeout(() => {
        t.style.opacity = '0';
        setTimeout(() => t.remove(), 300);
    }, 3000);
}

// =====================================================
// 매장-관리자 매핑 관리 (DB 기반)
// =====================================================

async function loadMappings() {
    try {
        const res = await fetch('/api/admin-mappings', {
            headers: { 'content-type': 'application/json' }
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
           target="_blank">콘솔진입</a>
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

            if (!confirm(`"${adminKey}" 관리자의 매핑을 삭제할까요?`)) return;

            try {
                const res = await fetch('/api/admin-mappings', {
                    method: 'DELETE',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ adminKey, storeId })
                });

                if (!res.ok) throw new Error();
                showSuperToast("✅ 매핑이 삭제되었습니다.", "success");
                await renderMapTable();
            } catch (e) {
                showSuperToast("매핑 삭제 실패", "error");
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
            showSuperToast('관리자 ID와 storeId를 입력하세요.', 'warning');
            return;
        }

        try {

            // 매핑 추가
            const res = await fetch('/api/admin-mappings', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ adminKey, storeId, note })
            });

            if (!res.ok) throw new Error();

            showSuperToast("✨ 매핑이 추가되었습니다.", "success");
            $('#map-admin').value = '';
            $('#map-store').value = '';
            $('#map-note').value = '';

            await renderMapTable();
        } catch (e) {
            showSuperToast('매핑 추가 실패', 'error');
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

        // 매장 삭제 버튼 바인딩
        tbody.querySelectorAll('[data-del-store]').forEach(btn => {
            btn.onclick = async () => {
                const storeId = btn.dataset.delStore;
                if (!confirm(`매장 "${storeId}"를 삭제하시겠습니까?\n해당 매장의 모든 데이터가 삭제될 수 있습니다.`)) return;

                try {
                    const res = await fetch('/api/stores', {
                        method: 'DELETE',
                        headers: { 'content-type': 'application/json' },
                        body: JSON.stringify({ storeId })
                    });

                    if (!res.ok) throw new Error();
                    showSuperToast("🗑️ 매장이 삭제되었습니다.", "success");
                    await renderStoreTable();
                } catch (e) {
                    showSuperToast('삭제 실패', 'error');
                }
            };
        });
    } catch (e) {
        console.error('[renderStoreTable] error:', e);
        tbody.innerHTML = '<tr><td colspan="4" class="small">데이터 로드 실패</td></tr>';
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
            showSuperToast('storeId와 주문 코드는 필수입니다.', 'warning');
            return;
        }

        try {
            const checkRes = await fetch('/api/stores');
            const checkData = await checkRes.json();
            const exists = checkData.stores && checkData.stores[storeId];

            const res = await fetch('/api/stores', {
                method: exists ? 'PUT' : 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ storeId, name, code })
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'SAVE_FAILED');
            }

            showSuperToast(`✅ 매장 정보가 ${exists ? '수정' : '생성'}되었습니다.`, 'success');
            $('#store-id').value = '';
            $('#store-name').value = '';
            $('#store-code').value = '';

            await renderStoreTable();
        } catch (e) {
            showSuperToast('저장 실패: ' + e.message, 'error');
        }
    };
}

// =====================================================
// SUPER 로그인 / 로그아웃
// =====================================================

async function fetchSuperMe() {
    try {
        const r = await fetch('/api/super-me');
        return r.ok ? r.json() : { ok: false };
    } catch {
        return { ok: false };
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
        statusText.textContent = `🛡️ SUPER 관리자: ${me.superId}`;
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

        msg.textContent = '⏳ 로그인 시도 중...';

        const data = await superLogin(uid, pw);

        if (data.ok) {
            location.reload();
        } else {
            msg.textContent = '❌ 로그인 실패: 계정 정보를 확인하세요.';
            showSuperToast("로그인 실패", "error");
        }
    };

    logoutBtn.onclick = async () => {
        if (!confirm('로그아웃할까요?')) return;
        await superLogout();
        location.reload();
    };
}

init();
