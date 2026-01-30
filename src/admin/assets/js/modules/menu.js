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
        const res = await fetch(`/api/menus?storeId=${currentStoreId()}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(menuData)
        });
        return res.ok;
    } catch (e) {
        console.error(e);
        return false;
    }
}

/**
 * 메뉴 관리 테이블 렌더링
 */
export async function renderMenu() {
    const menu = await loadMenuFromServer();
    const body = document.getElementById('m-body');
    if (!body) return;

    body.innerHTML = '';

    if (!menu.length) {
        body.innerHTML = '<tr><td colspan="6" class="small">등록된 메뉴가 없습니다. 추가하거나 엑셀을 업로드하세요.</td></tr>';
        return;
    }

    menu.forEach((m, idx) => {
        const tr = document.createElement('tr');
        const active = m.active !== false;
        const soldOut = !!m.soldOut;
        const category = m.category || '';

        tr.innerHTML = `
            <td data-label="ID">${m.id}</td>
            <td data-label="메뉴명"><input class="input" value="${m.name || ''}" data-k="name"></td>
            <td data-label="가격"><input class="input" type="number" value="${m.price || 0}" data-k="price"></td>
            <td data-label="카테고리"><input class="input" value="${category}" data-k="category"></td>
            <td data-label="상태">
                <label class="small" style="display:block;margin-bottom:4px">
                    <input type="checkbox" ${active ? 'checked' : ''} data-k="active"> 판매중
                </label>
                <label class="small" style="display:block">
                    <input type="checkbox" ${soldOut ? 'checked' : ''} data-k="soldOut"> 품절
                </label>
            </td>
            <td data-label="관리" class="right">
                <button class="btn small" data-act="detail">상세</button>
                <button class="btn small" data-act="save">저장</button>
                <button class="btn small" data-act="del">삭제</button>
            </td>
        `;
        body.appendChild(tr);

        // 💾 개별 저장 버튼
        tr.querySelector('[data-act="save"]').onclick = async () => {
            const updated = {
                ...m, // 기존 데이터(img, desc, options) 유지
                name: tr.querySelector('[data-k="name"]').value,
                price: Number(tr.querySelector('[data-k="price"]').value),
                category: tr.querySelector('[data-k="category"]').value,
                active: tr.querySelector('[data-k="active"]').checked,
                soldOut: tr.querySelector('[data-k="soldOut"]').checked
            };
            const success = await saveMenuToServer(updated);
            if (success) showToast(`✅ [${updated.name}] 저장 완료!`, 'success');
            else showToast('저장 실패', 'error');
        };

        // 📝 상세 설정 모달
        tr.querySelector('[data-act="detail"]').onclick = () => {
            openMenuDetailModal(m, async () => {
                const success = await saveMenuToServer(m);
                if (success) {
                    showToast('상세 설정이 DB에 반영되었습니다.', 'success');
                    renderMenu();
                }
            });
        };

        // 🗑 삭제 버튼
        tr.querySelector('[data-act="del"]').onclick = async () => {
            if (!confirm(`[${m.name}] 메뉴를 정말 삭제할까요?`)) return;
            const res = await fetch(`/api/menus?storeId=${currentStoreId()}&menuId=${m.id}`, { method: 'DELETE' });
            if (res.ok) {
                showToast('메뉴가 삭제되었습니다.', 'success');
                renderMenu();
            } else {
                showToast('삭제 실패', 'error');
            }
        };
    });
}

// ==============================
// 엑셀 관련 기능 (옵션 포함)
// ==============================

function convertRowToMenu(row) {
    const optText = String(row.options || '').trim();
    return {
        id: String(row.id || '').trim(),
        name: String(row.name || '').trim(),
        price: Number(row.price || 0),
        category: (row.category || '').trim(),
        active: true,
        soldOut: false,
        img: (row.img || '').trim(),
        desc: (row.desc || '').trim(),
        options: parseOptions(optText)
    };
}

function parseOptions(str) {
    if (!str || !String(str).trim()) return [];
    return String(str).split(';').map(s => s.trim()).filter(Boolean).map((grp, gi) => {
        const [meta, itemsPart] = grp.split(':');
        if (!itemsPart) return null;
        const [name, type, required] = meta.split('|').map(s => s.trim());
        const items = itemsPart.split(',').map(s => s.trim()).filter(Boolean).map((it, ii) => {
            const [label, price] = it.split('=');
            return { id: `opt-${gi}-${ii}-${Date.now()}`, label: (label || '').trim(), price: Number(price || 0) };
        });
        return { id: `grp-${gi}-${Date.now()}`, name: name || '옵션', type: type === 'multi' ? 'multi' : 'single', required: required === '1', items };
    }).filter(Boolean);
}

function bindExcelUpload() {
    const fileInput = document.getElementById('menu-excel');
    const uploadBtn = document.getElementById('menu-excel-upload');
    if (!fileInput || !uploadBtn) return;

    uploadBtn.onclick = () => {
        const file = fileInput.files?.[0];
        if (!file) return showToast('엑셀 파일을 선택하세요.', 'info');

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheet = workbook.Sheets[workbook.SheetNames[0]];
                const rows = XLSX.utils.sheet_to_json(sheet);
                const newMenu = rows.map(convertRowToMenu).filter(m => m.id && m.name);

                if (newMenu.length) {
                    const success = await saveMenuToServer(newMenu);
                    if (success) {
                        showToast(`🚀 ${newMenu.length}개 메뉴(옵션 포함) 업로드 완료!`, 'success');
                        renderMenu();
                    } else {
                        showToast('DB 저장 중 오류가 발생했습니다.', 'error');
                    }
                }
            } catch (err) {
                showToast('엑셀 파일 형식이 잘못되었습니다.', 'error');
            }
        };
        reader.readAsArrayBuffer(file);
    };
}

// --- 상단 수동 추가 ---
export function bindMenu() {
    const addBtn = document.getElementById('m-add');
    if (addBtn) {
        addBtn.onclick = async () => {
            const id = document.getElementById('m-id').value.trim();
            const name = document.getElementById('m-name').value.trim();
            const price = Number(document.getElementById('m-price').value);

            if (!id || !name) return showToast('ID와 이름을 입력하세요.', 'info');

            const newItem = { id, name, price, active: true, soldOut: false, options: [] };
            const success = await saveMenuToServer(newItem);
            if (success) {
                showToast('새 메뉴가 추가되었습니다.', 'success');
                renderMenu();
                ['m-id', 'm-name', 'm-price'].forEach(el => document.getElementById(el).value = '');
            }
        };
    }
    bindExcelUpload();
}

// ==============================
// 상세 설정 모달 (원본 로직 유지)
// ==============================

function ensureMenuDetailModal() {
    if (document.getElementById('menu-detail-modal')) return;
    const modal = document.createElement('div');
    modal.id = 'menu-detail-modal';
    modal.style.cssText = `position:fixed; inset:0; background:rgba(0,0,0,.6); display:none; align-items:center; justify-content:center; z-index:9999; padding:16px;`;
    modal.innerHTML = `
        <div style="width:860px; max-width:100%; max-height:90vh; overflow:auto; background:#0b1620; border-radius:16px; padding:18px; color:#e5e7eb; border:1px solid #1f2937;">
            <h3 style="margin:0 0 14px; color:#fff">메뉴 상세 설정</h3>
            <div style="background:#111827; border:1px solid #1f2937; border-radius:12px; padding:14px; margin-bottom:12px;">
                <div style="margin-bottom:14px; color:#9ca3af; font-size:13px; text-align:center;">이미지 URL</div>
                <input id="md-img" class="input" placeholder="https://..." style="width:100%">
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
    const descEl = document.getElementById('md-desc');
    const groupsMount = document.getElementById('md-opt-groups');
    const addGroupBtn = document.getElementById('md-opt-add-group');
    const saveBtn = document.getElementById('md-save');

    imgEl.value = target.img || '';
    descEl.value = target.desc || '';
    let optionGroups = JSON.parse(JSON.stringify(target.options || []));

    const render = () => renderOptionGroups(optionGroups, groupsMount, () => {});
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

function renderOptionGroups(groups, mountEl, onChange) {
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
        wrap.querySelector('[data-act="del-group"]').onclick = () => { groups.splice(gi, 1); renderOptionGroups(groups, mountEl, onChange); };
        
        const itemBox = wrap.querySelector('.opt-items');
        g.items.forEach((it, ii) => {
            const irow = document.createElement('div');
            irow.className = 'hstack';
            irow.style.marginBottom = '4px';
            irow.innerHTML = `
                <input class="input" placeholder="항목명" style="flex:1" value="${it.label}">
                <input class="input" type="number" placeholder="가격" style="width:80px" value="${it.price}">
                <button class="btn xs" data-act="del-item">X</button>
            `;
            irow.querySelectorAll('input')[0].oninput = (e) => it.label = e.target.value;
            irow.querySelectorAll('input')[1].oninput = (e) => it.price = Number(e.target.value);
            irow.querySelector('[data-act="del-item"]').onclick = () => { g.items.splice(ii, 1); renderOptionGroups(groups, mountEl, onChange); };
            itemBox.appendChild(irow);
        });

        wrap.querySelector('[data-act="add-item"]').onclick = () => { g.items.push({ label: '', price: 0 }); renderOptionGroups(groups, mountEl, onChange); };
        mountEl.appendChild(wrap);
    });
}
