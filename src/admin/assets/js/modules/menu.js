// /src/admin/assets/js/modules/menu.js
import { showToast } from '../admin.js';

// --- 유틸리티: 현재 매장 ID ---
/*function currentStoreId() {
    if (!window.qrnrStoreId) {
        showToast('매장 정보가 초기화되지 않았습니다.', 'error');
        throw new Error('STORE_ID_NOT_INITIALIZED');
    }
    return window.qrnrStoreId;
}*/

// 1. [DB] 메뉴 목록 가져오기
async function loadMenuFromServer(storeId) {
    try {
        const res = await fetch(`/api/menus?storeId=${storeId}`);
        const data = await res.json();
        return data.menus || [];
    } catch (e) {
        console.error(e);
        showToast('메뉴를 불러오지 못했습니다.', 'error');
        return [];
    }
}

// 2. [DB] 메뉴 저장하기 (단건 또는 배열)
// /src/admin/assets/js/modules/menu.js 내 saveMenuToServer 함수 수정

async function saveMenuToServer(storeId, menuData) {
    try {
        const sid = storeId;
        const res = await fetch(`/api/menus?storeId=${sid}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(menuData)
        });

        if (res.ok && window.supabaseClient) {
            const channelName = `qrnr_realtime_${sid}`;
            
            // 🚀 핵심: 기존에 열려있는 채널이 있는지 확인
            let channel = window.supabaseClient.getChannels().find(c => c.name === channelName);
            
            if (!channel) {
                channel = window.supabaseClient.channel(channelName);
            }

            // 구독 상태 확인 후 전송
            const sendSignal = async () => {
                const resp = await channel.send({
                    type: 'broadcast',
                    event: 'RELOAD_SIGNAL',
                    payload: { type: 'menu_update', at: Date.now() }
                });
                console.log("📨 [관리자] 신호 전송 결과:", resp); // 여기서 'ok'가 찍혀야 함
            };

            if (channel.state === 'joined') {
                await sendSignal();
            } else {
                channel.subscribe(async (status) => {
                    if (status === 'SUBSCRIBED') {
                        await sendSignal();
                    }
                });
            }
        }
        return res.ok;
    } catch (e) {
        console.error("메뉴 저장 중 오류:", e);
        return false;
    }
}
// ==============================
// 엑셀 → 메뉴 JSON 변환 유틸
// ==============================

// 1) 엑셀 한 행(row)을 메뉴 객체로 변환
function convertRowToMenu(row) {
    const optText = String(row['옵션'] || row['options'] || '').trim();
    return {
        id: String(row['ID'] || row['id'] || '').trim(),
        name: String(row['메뉴명'] || row['name'] || '').trim(),
        price: Number(row['가격'] || row['price'] || 0),
        category: String(row['카테고리명'] || row['category'] || '').trim(),
        active: row['판매상태'] !== '중지' && row['active'] !== false,
        soldOut: row['품절여부'] === '품절' || row['soldOut'] === true,
        desc: String(row['설명'] || row['desc'] || '').trim(),
        img: String(row['이미지URL'] || row['img'] || '').trim(),
        options: parseOptions(optText) // 3번에서 만든 parseOptions 연결
    };
}

// 2) options 컬럼 문자열을 옵션 스키마로 변환
// 예시: "사이즈:톨=0,그란데=500; 샷:1샷=500,2샷=1000"
function parseOptions(str) {
    if (!str || !String(str).trim()) return [];
    return String(str).split(';').map(s => s.trim()).filter(Boolean).map((grp) => {
        const [meta, itemsPart] = grp.split(':');
        if (!itemsPart) return null;
        const [name, type, required] = meta.split('|').map(s => s.trim());
        const items = itemsPart.split(',').map(s => s.trim()).filter(Boolean).map((it) => {
            const [label, price] = it.split('=');
            return { label: (label || '').trim(), price: Number(price || 0) };
        });
        // DB 저장 시 필요한 구조로 반환
        return { 
            id: crypto.randomUUID(), 
            name, 
            type: (type === 'multi' ? 'multi' : 'single'), 
            required: (required === '1' || required === 'true'), 
            items 
        };
    }).filter(Boolean);
}


function validateOptionGroups(groups) {
  if (!Array.isArray(groups)) return true;

  return groups.every(g => {
    if (!g.name || !String(g.name).trim()) return false;
    if (!Array.isArray(g.items) || g.items.length === 0) return false;

    return g.items.every(it =>
      it.label && String(it.label).trim()
    );
  });
}




// 3) 기존 메뉴 + 새 메뉴(엑셀)를 ID 기준으로 병합
function mergeMenu(oldMenu, newMenu) {
  const map = {};

  oldMenu.forEach((m) => {
    if (m && m.id) map[m.id] = m;
  });

  newMenu.forEach((m) => {
    if (!m || !m.id) return;

    if (map[m.id]) {
      map[m.id] = {
        ...map[m.id],
        ...m,
        options: (m.options && m.options.length)
          ? m.options
          : map[m.id].options
      };
    } else {
      map[m.id] = m;
    }
  });

  return Object.values(map);
}

export async function exportMenuToExcel(storeId) {
    const menus = await loadMenuFromServer(storeId);
    if (!menus.length) return showToast('다운로드할 메뉴가 없습니다.', 'error');

    const data = menus.map(m => {
        const optStr = (m.options || []).map(g => {
            const items = (g.items || []).map(i => `${i.label}=${i.price}`).join(',');
            return `${g.name}|${g.type}|${g.required ? '1' : '0'}:${items}`;
        }).join('; ');

        return {
            'ID': m.id, '메뉴명': m.name, '가격': m.price, '카테고리명': m.category || '',
            '판매상태': m.active !== false ? '판매중' : '중지', '품절여부': m.soldOut ? '품절' : '정상',
            '옵션': optStr, '이미지URL': m.img || '', '설명': m.desc || ''
        };
    });

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "메뉴관리");
    XLSX.writeFile(workbook, `메뉴관리_${currentStoreId()}.xlsx`);
    showToast('엑셀 다운로드 완료!', 'success');
}
async function handleMenuExcelUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);

            const newMenus = rows.map(convertRowToMenu).filter(m => m.id && m.name);
            if (!newMenus.length) return showToast('유효한 데이터가 없습니다.', 'error');

            if (confirm(`${newMenus.length}개의 메뉴를 서버에 반영할까요?`)) {
                if (await saveMenuToServer(newMenus)) {
                    showToast('엑셀 반영 성공!', 'success');
                    renderMenu();
                }
            }
        } catch (err) {
            showToast('엑셀 처리 오류', 'error');
        } finally {
            event.target.value = '';
        }
    };
    reader.readAsArrayBuffer(file);
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
window.currentMenuTab = window.currentMenuTab || 'A';
export async function renderMenu(storeId) {
    const menu = await loadMenuFromServer(storeId);

    // 데이터가 없을 때의 예외 처리
    if (!menu || menu.length === 0) {
        const body = document.getElementById('m-body');
        if (body) body.innerHTML = '<tr><td colspan="6" class="small">등록된 메뉴가 없습니다.</td></tr>';
        // 기존 탭 영역이 있다면 비워줌
        const oldTabs = document.getElementById('menu-cat-tabs');
        if (oldTabs) oldTabs.innerHTML = '';
        return;
    }
    
    // 1. 카테고리 추출 (ID의 첫 글자 기준: a, b, c...)
    const categories = [...new Set(menu.map(m => m.id.charAt(0).toUpperCase()))].sort();
    
    // 2. 탭 생성 영역 (상단에 탭 버튼 추가)
    renderCategoryTabs(categories, menu,storeId);

   // 3. 현재 선택된 탭이 데이터에 존재하는지 확인 (삭제 시 대비)
    if (!categories.includes(window.currentMenuTab)) {
        window.currentMenuTab = categories[0];
    }

    // 4. 현재 선택된 탭의 메뉴만 렌더링
    filterAndRenderTable(menu, window.currentMenuTab,storeId);
    
    /*
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
    });*/
}

// 카테고리 탭 버튼 생성 함수
function renderCategoryTabs(categories, allMenu,storeId) {
    let tabContainer = document.getElementById('menu-cat-tabs');
    if (!tabContainer) {
        tabContainer = document.createElement('div');
        tabContainer.id = 'menu-cat-tabs';
        tabContainer.className = 'tabbar';
        // 메뉴 입력창 아래, 테이블 위에 배치
        const mBody = document.getElementById('m-body');
        if (mBody) mBody.closest('table').before(tabContainer);
    }
    
    tabContainer.innerHTML = categories.map(cat => {
        const firstItem = allMenu.find(m => m.id.charAt(0).toUpperCase() === cat);
        const label = (firstItem && firstItem.category) ? firstItem.category : cat;
        const activeClass = window.currentMenuTab === cat ? 'active' : '';
        
        return `<button class="tab ${activeClass}" data-cat="${cat}">${label} (${cat})</button>`;
    }).join('');

    // 탭 클릭 이벤트 바인딩
    tabContainer.querySelectorAll('.tab').forEach(btn => {
        btn.onclick = () => {
            window.currentMenuTab = btn.dataset.cat;
            renderMenu(storeId); // 다시 그리기
        };
    });
}
let currentAllMenus = [];
const initMenuEvents = (storeId) => {
    const body = document.getElementById('m-body');
    if (!body || body.dataset.eventBound === 'true') return;
        body.onclick = async (e) => {
            const btn = e.target.closest('button');
            if (!btn || !btn.dataset.act) return;
    
            const act = btn.dataset.act;
            const tr = btn.closest('tr');
            const mId = tr.dataset.id;
    
            const m = currentAllMenus.find(item => item.id === mId); 
            if (!m) return;

            btn.disabled = true;
            btn.classList.add('btn-loading');
    
            if (act === 'save') {
            const updated = {
                ...m,
                name: tr.querySelector('[data-k="name"]').value,
                price: Number(tr.querySelector('[data-k="price"]').value),
                category: tr.querySelector('[data-k="category"]').value,
                active: tr.querySelector('[data-k="active"]').checked,
                soldOut: tr.querySelector('[data-k="soldOut"]').checked
            };
            if (await saveMenuToServer(storeId,updated)) {
                showToast(`✅ [${updated.name}] 저장 완료!`, 'success');
                await renderMenu(); // 최신 데이터 리로드
            }
        } 
        else if (act === 'detail') {
            openMenuDetailModal(m, async () => {
                if (await saveMenuToServer(storeId,m)) {
                    showToast('상세 설정 저장 완료', 'success');
                    renderMenu(storeId);
                }
            },storeId);
        } 
        else if (act === 'del') {
            if (confirm(`[${m.name}] 삭제할까요?`)) {
                const sid = storeId;
                const res = await fetch(`/api/menus?storeId=${sid}&menuId=${m.id}`, { method: 'DELETE' });
                if (res.ok) {
                    showToast('삭제되었습니다.', 'success');
                    
                    // 🚀 [추가] 삭제 성공 후 실시간 신호 발송
                    if (window.supabaseClient) {
                        const channelName = `qrnr_realtime_${sid}`;
                        let channel = window.supabaseClient.getChannels().find(c => c.name === channelName);
                        if (!channel) channel = window.supabaseClient.channel(channelName);
        
                        const sendSignal = async () => {
                            await channel.send({
                                type: 'broadcast',
                                event: 'RELOAD_SIGNAL',
                                payload: { type: 'menu_update', at: Date.now() }
                            });
                        };
        
                        if (channel.state === 'joined') {
                            await sendSignal();
                        } else {
                            channel.subscribe(async (status) => {
                                if (status === 'SUBSCRIBED') await sendSignal();
                            });
                        }
                    }
                    
                    renderMenu(storeId);
                }
            }
        }
        
        // [로딩 상태 해제]
        if (btn) {
            btn.disabled = false;
            btn.classList.remove('btn-loading');
        }
    };
    body.dataset.eventBound = 'true';
};
// 실제 테이블 내용 그리기 및 이벤트 바인딩 합치기
// 실제 테이블 내용 그리기
function filterAndRenderTable(menu, tab,storeId) {
    const body = document.getElementById('m-body');
    if (!body) return;
    
    // 🚩 전역 변수 업데이트
    currentAllMenus = menu; 
    
    // 🚩 이벤트 핸들러 초기화 (딱 한 번만 실행됨)
    initMenuEvents(storeId);

    body.innerHTML = '';
    const filtered = menu.filter(m => m.id.charAt(0).toUpperCase() === tab);

    if (!filtered.length) {
        body.innerHTML = '<tr><td colspan="6" class="small">이 카테고리에 메뉴가 없습니다.</td></tr>';
        return;
    }

    filtered.forEach((m) => {
        const tr = document.createElement('tr');
        tr.dataset.id = m.id; // 이벤트 위임용 ID
        
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
    });
}
export function bindMenu(storeId) {
    initMenuEvents(storeId);
    const addBtn = document.getElementById('m-add');
    if (addBtn) {
        addBtn.onclick = async () => {
            const idInput = document.getElementById('m-id');
            const nameInput = document.getElementById('m-name');
            const priceInput = document.getElementById('m-price');
            const catInput = document.getElementById('m-category');

            const id = idInput.value.trim();
            const name = nameInput.value.trim();
            const price = Number(priceInput.value);
            const category = catInput.value.trim();
            
            if (!id || !name) return showToast('ID와 이름을 입력하세요.', 'info');
            addBtn.disabled = true; // 중복 클릭 방지
            window.currentMenuTab = id.charAt(0).toUpperCase();
            
            const success = await saveMenuToServer(storeId,{ 
                id, name, price, active: false, soldOut: false, options: [] 
            });

            if (success) {
                showToast('새 메뉴가 등록되었습니다.', 'success');
                renderMenu(storeId);
                [idInput, nameInput, priceInput,catInput].forEach(el => el.value = '');
            }
            addBtn.disabled = false;
        };
    }
    
    // 엑셀 바인딩은 기존 코드 유지
    // 엑셀 업로드 연결
    const excelInput = document.getElementById('menu-excel');
    const uploadBtn = document.getElementById('menu-excel-upload');
    if (uploadBtn && excelInput) {
        uploadBtn.onclick = () => excelInput.click();
        excelInput.onchange = handleMenuExcelUpload;
    }
    // [추가] 엑셀 다운로드 버튼 연결
    const downloadBtn = document.getElementById('menu-excel-download');
    if (downloadBtn) {
        downloadBtn.onclick = () => exportMenuToExcel(storeId);
    }
}

