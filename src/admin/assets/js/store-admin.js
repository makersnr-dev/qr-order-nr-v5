// /src/admin/assets/js/store-admin.js

const $ = (s, r = document) => r.querySelector(s);

/**
 * 🚀 SUPER 관리자용 표준 토스트 함수
 */
function showSuperToast(msg, variant = 'info') {
    const t = document.createElement('div');
    t.className = `toast show toast-${variant}`;
    t.style.cssText = "position:fixed; bottom:20px; left:50%; transform:translateX(-50%); z-index:10000; background:#111922; color:#fff; padding:12px 20px; border-radius:10px; border:1px solid #263241; transition: opacity 0.3s; pointer-events:none;";
    
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
// 매장-관리자 매핑 및 통합 매장 관리
// =====================================================

async function loadMappings() {
    try {
        const res = await fetch('/api/admin-mappings');
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

    tbody.innerHTML = '<tr><td colspan="5" class="small">불러오는 중...</td></tr>';

    const mappings = await loadMappings();

    if (!mappings.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="small">등록된 데이터 없음</td></tr>';
        return;
    }

    tbody.innerHTML = '';

    mappings.forEach(m => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
      <td>${m.admin_key}</td>
      <td>${m.store_id}</td>
      <td style="font-weight:bold; color:var(--primary);">${m.code || '-'}</td>
      <td>${m.note || '-'}</td>
      <td class="right">
        <div class="hstack" style="gap:4px; justify-content:flex-end">
            <a class="btn small" href="/admin?store=${encodeURIComponent(m.store_id)}" target="_blank">콘솔</a>
            <button class="btn small danger" data-del="${m.admin_key}" data-store="${m.store_id}">삭제</button>
        </div>
      </td>
    `;
        tbody.appendChild(tr);
    });

    // 삭제 버튼 바인딩
    tbody.querySelectorAll('[data-del]').forEach(btn => {
        btn.onclick = async () => {
            const { del: adminKey, store: storeId } = btn.dataset;

            if (!confirm(`"${adminKey}" 관리자와 "${storeId}" 매장의 매핑을 삭제할까요?`)) return;

            try {
                const res = await fetch('/api/admin-mappings', {
                    method: 'DELETE',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ adminKey, storeId })
                });

                if (!res.ok) throw new Error();
                showSuperToast("✅ 삭제되었습니다.", "success");
                await renderMapTable();
            } catch (e) {
                showSuperToast("삭제 실패", "error");
            }
        };
    });
}

/**
 * 🚀 통합 저장 로직 (adminKey + storeId + code)
 */
function bindMappingUI() {
    const addBtn = $('#map-add');
    if (!addBtn) return;

    addBtn.onclick = async () => {
        const adminKey = $('#map-admin').value.trim();
        const storeId = $('#map-store').value.trim();
        const code = $('#map-code').value.trim(); // 주문 코드 필드
        const note = $('#map-note').value.trim();

        if (!adminKey || !storeId || !code) {
            showSuperToast('관리자ID, storeId, 주문코드를 입력하세요.', 'warning');
            return;
        }

        try {
            // 이제 한 번의 POST로 admin_stores 테이블에 모든 정보가 저장됩니다.
            const res = await fetch('/api/admin-mappings', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ adminKey, storeId, code, note })
            });

            if (!res.ok) throw new Error();

            showSuperToast("✨ 매장 정보가 저장되었습니다.", "success");
            
            // 입력창 초기화
            $('#map-admin').value = '';
            $('#map-store').value = '';
            $('#map-code').value = '';
            $('#map-note').value = '';

            await renderMapTable();
        } catch (e) {
            showSuperToast('저장 실패 (DB 연결 확인 필요)', 'error');
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

async function init() {
    const statusText = $('#super-status-text');
    const logoutBtn = $('#super-logout');
    const loginCard = $('#super-login-card');
    const mappingCard = $('#mapping-card');
    const storeCard = $('#store-card'); // 이제 더 이상 사용 안 함

    const me = await fetchSuperMe();

    if (me.ok && me.isSuper) {
        statusText.textContent = `🛡️ SUPER 관리자: ${me.superId}`;
        logoutBtn.style.display = 'inline-flex';
        loginCard.style.display = 'none';
        mappingCard.style.display = 'block';
        if(storeCard) storeCard.style.display = 'none'; // 하단 매장 테이블 숨김

        await renderMapTable();
        bindMappingUI();
    } else {
        statusText.textContent = '';
        logoutBtn.style.display = 'none';
        loginCard.style.display = 'block';
        mappingCard.style.display = 'none';
        if(storeCard) storeCard.style.display = 'none';
    }

    $('#super-login-btn').onclick = async () => {
        const uid = $('#super-id').value.trim();
        const pwd = $('#super-pw').value.trim();
        const msg = $('#super-login-msg');

        if (!uid || !pwd) {
            msg.textContent = '아이디와 비밀번호를 입력하세요.';
            return;
        }

        msg.textContent = '⏳ 로그인 시도 중...';

        try {
            const r = await fetch('/api/super-login', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ uid, pwd }),
            });
            const data = await r.json();

            if (data.ok) {
                location.reload();
            } else {
                msg.textContent = '❌ 로그인 실패: 계정 정보를 확인하세요.';
                showSuperToast("로그인 실패", "error");
            }
        } catch (e) {
            msg.textContent = '❌ 서버 응답 없음';
        }
    };

    logoutBtn.onclick = async () => {
        if (!confirm('로그아웃할까요?')) return;
        try {
            await fetch('/api/super-logout', { method: 'POST' });
            location.reload();
        } catch (e) {}
    };
}

init();
