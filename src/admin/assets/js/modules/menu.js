// /src/admin/assets/js/modules/menu.js
import { showToast } from '../admin.js';

// --- 유틸리티: 현재 매장 ID ---
function currentStoreId() {
    if (!window.qrnrStoreId) {
        showToast('매장 정보가 초기화되지 않았습니다.', 'error');
        throw new Error('STORE_ID_NOT_INITIALIZED');
    }
    return window.qrnrStoreId;
}

// 1. [DB] 메뉴 목록 가져오기
async function loadMenuFromServer() {
    try {
        const res = await fetch(`/api/menus?storeId=${currentStoreId()}`);
        const data = await res.json();
        return data.menus || [];
    } catch (e) {
        console.error(e);
        showToast('메뉴를 불러오지 못했습니다.', 'error');
        return [];
    }
}

// 2. [DB] 메뉴 저장하기 (단건 또는 배열)
async function saveMenuToServer(menuData) {
    try {
        const sid = currentStoreId();
        const res = await fetch(`/api/menus?storeId=${sid}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(menuData)
        });

        if (res.ok) {
            console.log("✅ DB 저장 성공, 실시간 신호 발송 준비...");

            // 🚀 전역에 등록된 supabaseClient 확인 (admin.js에서 등록됨)
            const supabase = window.supabaseClient;
            if (supabase) {
                // 채널 이름을 주문페이지와 100% 일치시킴
                const channelName = `qrnr_realtime_${sid}`;
                const channel = supabase.channel(channelName);

                channel.subscribe(async (status) => {
                    if (status === 'SUBSCRIBED') {
                        console.log(`📡 [${channelName}] 채널 구독 완료 -> 신호 쏩니다!`);
                        
                        // broadcast 방식으로 데이터 전송
                        const sendRes = await channel.send({
                            type: 'broadcast',
                            event: 'RELOAD_SIGNAL',
                            payload: { type: 'menu_update', at: Date.now() }
                        });

                        console.log("📨 신호 전송 결과:", sendRes);

                        // 전송 완료 후 채널 해제 (안정성을 위해 2초 뒤 삭제)
                        setTimeout(() => supabase.removeChannel(channel), 2000);
                    } else if (status === 'CHANNEL_ERROR') {
                        console.error("❌ 채널 연결 에러 발생");
                    }
                });
            } else {
                console.error("❌ supabaseClient가 정의되지 않았습니다.");
            }
            return true;
        }
        return false;
    } catch (e) {
        console.error("메뉴 저장 중 오류:", e);
        return false;
    }
}


// ------------------------------------------------------------
// 3. 상세 설정 모달 (이미지 업로드 + 옵션 관리 통합 버전)
// ------------------------------------------------------------

function ensureMenuDetailModal() {
    if (document.getElementById('menu-detail-modal')) return;
    const modal = document.createElement('div');
    modal.id = 'menu-detail-modal';
    modal.style.cssText = `position:fixed; inset:0; background:rgba(0,0,0,.6); display:none; align-items:center; justify-content:center; z-index:9999; padding:16px;`;
    
    modal.innerHTML = `
        <div style="width:860px; max-width:100%; max-height:90vh; overflow:auto; background:#0b1620; border-radius:16px; padding:18px; color:#e5e7eb; border:1px solid #1f2937;">
            <h3 style="margin:0 0 14px; color:#fff">메뉴 상세 설정</h3>
            
            <div style="background:#111827; border:1px solid #1f2937; border-radius:12px; padding:14px; margin-bottom:12px; text-align:center;">
                <div style="margin-bottom:10px; color:#9ca3af; font-size:13px;">메뉴 이미지</div>
                <img id="md-img-preview" src="" style="width:120px; height:120px; border-radius:10px; object-fit:cover; background:#000; margin-bottom:10px; border:1px solid #263241;">
                <div class="hstack" style="justify-content:center; gap:8px">
                    <input type="file" id="md-file-input" accept="image/*" style="display:none;">
                    <button type="button" class="btn xs" onclick="document.getElementById('md-file-input').click()">사진 선택</button>
                    <input id="md-img" class="input" placeholder="이미지 URL" style="flex:1; font-size:12px;" readonly>
                </div>
                <div id="upload-status" style="margin-top:5px; font-size:11px; color:var(--primary); height:14px;"></div>
            </div>

            <div style="background:#111827; border:1px solid #1f2937; border-radius:12px; padding:14px; margin-bottom:16px;">
                <div style="margin-bottom:14px; color:#9ca3af; font-size:13px; text-align:center;">메뉴 설명</div>
                <textarea id="md-desc" class="input" style="width:100%; min-height:90px; white-space:pre-wrap"></textarea>
            </div>
            
            <h4 style="margin:0 0 10px; color:#fff">옵션 관리</h4>
            <div id="md-opt-groups"></div>
            <button id="md-opt-add-group" class="btn xs" style="margin-top:9px">+ 옵션 그룹 추가</button>
            
            <div class="hstack" style="justify-content:flex-end; margin-top:18px; gap:8px">
                <button id="md-cancel" class="btn">취소</button>
                <button id="md-save" class="btn primary">저장</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });
}

function openMenuDetailModal(target, onSave) {
    ensureMenuDetailModal();
    const modal = document.getElementById('menu-detail-modal');
    const imgEl = document.getElementById('md-img');
    const imgPreview = document.getElementById('md-img-preview');
    const fileInput = document.getElementById('md-file-input');
    const statusEl = document.getElementById('upload-status');
    const descEl = document.getElementById('md-desc');
    const groupsMount = document.getElementById('md-opt-groups');
    const addGroupBtn = document.getElementById('md-opt-add-group');
    const saveBtn = document.getElementById('md-save');

    // 초기값 세팅
    imgEl.value = target.img || '';
    imgPreview.src = target.img || '/assets/img/no-image.png';
    descEl.value = target.desc || '';
    statusEl.textContent = '';
    let optionGroups = JSON.parse(JSON.stringify(target.options || []));

    // 🚀 사진 업로드 로직
    fileInput.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        statusEl.textContent = "⏳ 업로드 중...";
        try {
            const ext = file.name.split('.').pop();
            const filePath = `${currentStoreId()}/${Date.now()}.${ext}`;
            const { data, error } = await window.supabaseClient.storage
                .from('menu-images').upload(filePath, file);
            if (error) throw error;
            const { data: { publicUrl } } = window.supabaseClient.storage
                .from('menu-images').getPublicUrl(filePath);
            imgPreview.src = publicUrl;
            imgEl.value = publicUrl;
            statusEl.textContent = "✅ 업로드 완료!";
        } catch (err) {
            statusEl.textContent = "❌ 실패: " + err.message;
        }
    };

    const render = () => renderOptionGroups(optionGroups, groupsMount);
    render();

    addGroupBtn.onclick = () => {
        optionGroups.push({ id: crypto.randomUUID(), name: '', type: 'single', required: false, items: [] });
        render();
    };

    document.getElementById('md-cancel').onclick = () => modal.style.display = 'none';
    saveBtn.onclick = () => {
        target.img = imgEl.value.trim();
        target.desc = descEl.value.trim();
        target.options = optionGroups.filter(g => g.name && g.items.length);
        modal.style.display = 'none';
        onSave();
    };
    modal.style.display = 'flex';
}

function renderOptionGroups(groups, mountEl) {
    mountEl.innerHTML = '';
    groups.forEach((g, gi) => {
        const wrap = document.createElement('div');
        wrap.style.cssText = `background:#02040a; border:1px solid #263241; border-radius:14px; padding:16px; margin-bottom:18px;`;
        wrap.innerHTML = `
            <div class="hstack" style="gap:16px; flex-wrap:wrap">
                <input class="input" placeholder="옵션 그룹명" style="flex:1" value="${g.name}" data-k="name">
                <select class="input" style="width:100px" data-k="type">
                    <option value="single" ${g.type === 'single' ? 'selected' : ''}>단일</option>
                    <option value="multi" ${g.type === 'multi' ? 'selected' : ''}>복수</option>
                </select>
                <label class="hstack small"><input type="checkbox" ${g.required ? 'checked' : ''} data-k="required"> 필수</label>
                <button class="btn danger xs" data-act="del-group">삭제</button>
            </div>
            <div class="opt-items" style="margin-top:10px"></div>
            <button class="btn xs" data-act="add-item" style="margin-top:6px">+ 항목 추가</button>
        `;
        wrap.querySelector('[data-k="name"]').oninput = (e) => g.name = e.target.value;
        wrap.querySelector('[data-k="type"]').onchange = (e) => g.type = e.target.value;
        wrap.querySelector('[data-k="required"]').onchange = (e) => g.required = e.target.checked;
        wrap.querySelector('[data-act="del-group"]').onclick = () => { groups.splice(gi, 1); renderOptionGroups(groups, mountEl); };
        
        const itemBox = wrap.querySelector('.opt-items');
        g.items.forEach((it, ii) => {
            const irow = document.createElement('div');
            irow.className = 'hstack'; irow.style.marginBottom = '4px';
            irow.innerHTML = `<input class="input" placeholder="항목명" style="flex:1" value="${it.label}">
                              <input class="input" type="number" placeholder="가격" style="width:80px" value="${it.price}">
                              <button class="btn xs" data-act="del-item">X</button>`;
            irow.querySelectorAll('input')[0].oninput = (e) => it.label = e.target.value;
            irow.querySelectorAll('input')[1].oninput = (e) => it.price = Number(e.target.value);
            irow.querySelector('[data-act="del-item"]').onclick = () => { g.items.splice(ii, 1); renderOptionGroups(groups, mountEl); };
            itemBox.appendChild(irow);
        });
        wrap.querySelector('[data-act="add-item"]').onclick = () => { g.items.push({ label: '', price: 0 }); renderOptionGroups(groups, mountEl); };
        mountEl.appendChild(wrap);
    });
}

// ------------------------------------------------------------
// 4. 테이블 렌더링 및 이벤트 바인딩
// ------------------------------------------------------------

export async function renderMenu() {
    const menu = await loadMenuFromServer();
    const body = document.getElementById('m-body');
    if (!body) return;
    body.innerHTML = '';

    if (!menu.length) {
        body.innerHTML = '<tr><td colspan="6" class="small">등록된 메뉴가 없습니다.</td></tr>';
        return;
    }

    menu.forEach((m) => {
        const tr = document.createElement('tr');
        const active = m.active !== false;
        const soldOut = !!m.soldOut;
        tr.innerHTML = `
            <td>${m.id}</td>
            <td><input class="input" value="${m.name || ''}" data-k="name"></td>
            <td><input class="input" type="number" value="${m.price || 0}" data-k="price"></td>
            <td><input class="input" value="${m.category || ''}" data-k="category"></td>
            <td>
                <label class="small"><input type="checkbox" ${active ? 'checked' : ''} data-k="active"> 판매</label>
                <label class="small"><input type="checkbox" ${soldOut ? 'checked' : ''} data-k="soldOut"> 품절</label>
            </td>
            <td class="right">
                <button class="btn small" data-act="detail">상세</button>
                <button class="btn small" data-act="save">저장</button>
                <button class="btn small" data-act="del">삭제</button>
            </td>
        `;
        body.appendChild(tr);

        tr.querySelector('[data-act="save"]').onclick = async () => {
            const updated = {
                ...m,
                name: tr.querySelector('[data-k="name"]').value,
                price: Number(tr.querySelector('[data-k="price"]').value),
                category: tr.querySelector('[data-k="category"]').value,
                active: tr.querySelector('[data-k="active"]').checked,
                soldOut: tr.querySelector('[data-k="soldOut"]').checked
            };
            if (await saveMenuToServer(updated)) showToast(`✅ [${updated.name}] 저장 완료!`, 'success');
        };

        tr.querySelector('[data-act="detail"]').onclick = () => {
            openMenuDetailModal(m, async () => {
                if (await saveMenuToServer(m)) {
                    showToast('상세 설정 저장 완료', 'success');
                    renderMenu();
                }
            });
        };

        tr.querySelector('[data-act="del"]').onclick = async () => {
            if (!confirm(`[${m.name}] 삭제할까요?`)) return;
            const res = await fetch(`/api/menus?storeId=${currentStoreId()}&menuId=${m.id}`, { method: 'DELETE' });
            if (res.ok) { renderMenu(); showToast('삭제되었습니다.', 'success'); }
        };
    });
}

export function bindMenu() {
    const addBtn = document.getElementById('m-add');
    if (addBtn) {
        addBtn.onclick = async () => {
            const id = document.getElementById('m-id').value.trim();
            const name = document.getElementById('m-name').value.trim();
            const price = Number(document.getElementById('m-price').value);
            if (!id || !name) return showToast('ID와 이름을 입력하세요.', 'info');
            if (await saveMenuToServer({ id, name, price, active: true, soldOut: false, options: [] })) {
                renderMenu();
                ['m-id', 'm-name', 'm-price'].forEach(el => document.getElementById(el).value = '');
            }
        };
    }
    // 엑셀 바인딩은 기존 코드 유지
    const excelBtn = document.getElementById('menu-excel-upload');
    if(excelBtn) excelBtn.onclick = () => showToast('엑셀 기능은 별도 구현되어 있습니다.', 'info');
}
