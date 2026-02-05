import { currentStoreId } from './cust-store.js';

// 숫자를 3,000원 형식으로 바꿔주는 도구
const fmt = (n) => Number(n || 0).toLocaleString();

/**
 * 1. [DB 연동] 서버에서 메뉴 목록 가져오기
 */
export async function loadMenu() {
    const sid = currentStoreId();
    try {
        const res = await fetch(`/api/menus?storeId=${sid}`);
        const data = await res.json();
        // 활성화된 메뉴만 필터링
        return (data.menus || []).filter(m => m.active !== false);
    } catch (e) {
        console.error('[menu-cart] 로딩 실패:', e);
        return [];
    }
}

/**
 * 2. 장바구니 시스템
 */
export function makeCart(boxId, totalId) {
    const cart = {
        items: [],
        box: document.getElementById(boxId),
        totalEl: document.getElementById(totalId),

        add(item, qty, selectedOptions = [], optionText = []) {
            const optKey = JSON.stringify(selectedOptions);
            const existing = this.items.find(i => i.id === item.id && JSON.stringify(i.selectedOptions) === optKey);

            if (existing) {
                existing.qty += qty;
            } else {
                this.items.push({ ...item, qty, selectedOptions, optionText });
            }
            this.render();
        },

        updateQty(idx, delta) {
            this.items[idx].qty += delta;
            if (this.items[idx].qty <= 0) this.items.splice(idx, 1);
            this.render();
        },

        total() {
            return this.items.reduce((sum, item) => {
                const optPrice = (item.selectedOptions || []).reduce((s, o) => s + Number(o.price || 0), 0);
                return sum + (Number(item.price) + optPrice) * item.qty;
            }, 0);
        },

        render() {
            if (!this.box) return;
            if (this.items.length === 0) {
                this.box.innerHTML = '<div class="small" style="padding:10px; opacity:0.5;">담긴 메뉴가 없습니다.</div>';
            } else {
                this.box.innerHTML = this.items.map((it, idx) => `
                    <div class="hstack" style="justify-content:space-between; padding:12px 0; border-bottom:1px solid #263241;">
                        <div style="flex:1">
                            <div style="font-size:14px; font-weight:600;">${it.name}</div>
                            ${(() => {
                                if (!it.optionText || it.optionText.length === 0) return "";
                                const groups = {};
                                it.optionText.forEach(t => {
                                    const [g, v] = t.split(':');
                                    if (!groups[g]) groups[g] = [];
                                    groups[g].push(v);
                                });
                                return Object.entries(groups)
                                    .map(([g, v]) => `<div class="small" style="color:#9ca3af; font-size:11px; margin-top:2px;">└ ${g}: ${v.join(', ')}</div>`)
                                    .join('');
                            })()}
                            <div style="font-size:13px; color:var(--primary); margin-top:4px;">
                                ${fmt((Number(it.price) + (it.selectedOptions || []).reduce((s,o)=>s+Number(o.price||0),0)) * it.qty)}원
                            </div>
                        </div>
                        <div class="hstack" style="gap:10px; margin-left:10px;">
                            <button class="btn small" onclick="qrnrCart.updateQty(${idx}, -1)">-</button>
                            <b style="min-width:20px; text-align:center;">${it.qty}</b>
                            <button class="btn small" onclick="qrnrCart.updateQty(${idx}, 1)">+</button>
                        </div>
                    </div>
                `).join('');
            }
            if (this.totalEl) this.totalEl.textContent = fmt(this.total());
            window.qrnrCart = this;
        }
    };
    window.qrnrCart = cart;
    return cart;
}

/**
 * 3. 메뉴판 렌더링
 */
window.currentOrderTab = window.currentOrderTab || 'A';

export async function renderMenu(gridId, cartObj) {
    const grid = document.getElementById(gridId);
    if (!grid) return;

    const allMenus = await loadMenu();
    if (!allMenus || allMenus.length === 0) {
        grid.innerHTML = '<div class="small" style="grid-column: 1/-1; padding: 40px 0; opacity: 0.5;">메뉴를 불러올 수 없습니다.</div>';
        return;
    }

    // 1. 대문자 카테고리 추출 및 정렬
    const categories = [...new Set(allMenus.map(m => m.id.charAt(0).toUpperCase()))].sort();

    // 2. 탭 생성 및 삽입
    renderOrderTabs(categories, allMenus, gridId, cartObj);

    // 3. 현재 탭 유효성 검사 및 필터링
    if (!categories.includes(window.currentOrderTab)) window.currentOrderTab = categories[0];
    const filtered = allMenus.filter(m => m.id.charAt(0).toUpperCase() === window.currentOrderTab);

    grid.innerHTML = '';
    filtered.forEach(item => {
        const card = document.createElement('div');
        card.className = 'menu-card vstack';
        // 품절 처리 로직 추가 (soldOut 체크)
        const isSoldOut = !!item.soldOut;
        card.style.opacity = isSoldOut ? '0.5' : '1';
        card.style.pointerEvents = isSoldOut ? 'none' : 'auto';

        card.innerHTML = `
            <div style="width:100%; aspect-ratio:1/1; background:#1c2632; border-radius:10px; overflow:hidden; margin-bottom:8px; position:relative;">
                <img src="${item.img || ''}" style="width:100%; height:100%; object-fit:cover;" onerror="this.style.display='none'">
                ${isSoldOut ? '<div style="position:absolute; inset:0; background:rgba(0,0,0,0.5); display:flex; align-items:center; justify-content:center; font-weight:700; color:#fff;">품절</div>' : ''}
            </div>
            <div style="font-weight:600; font-size:14px; text-align:center;">${item.name}</div>
            <div style="color:var(--primary); font-weight:700; font-size:13px; margin-top:4px;">${fmt(item.price)}원</div>
        `;
        if (!isSoldOut) card.onclick = () => openMenuModal(item, cartObj);
        grid.appendChild(card);
    });
}

function renderOrderTabs(categories, allMenu, gridId, cartObj) {
    let container = document.getElementById('order-cat-tabs');
    if (!container) {
        container = document.createElement('div');
        container.id = 'order-cat-tabs';
        container.className = 'tabbar';
        document.getElementById(gridId).before(container);
    }

    container.innerHTML = categories.map(cat => {
        const first = allMenu.find(m => m.id.charAt(0).toUpperCase() === cat);
        const label = (first && first.category) ? first.category : cat;
        return `<button class="tab ${window.currentOrderTab === cat ? 'active' : ''}" data-cat="${cat}">${label}</button>`;
    }).join('');

    container.querySelectorAll('.tab').forEach(btn => {
        btn.onclick = () => {
            window.currentOrderTab = btn.dataset.cat;
            renderMenu(gridId, cartObj);
        };
    });
}

/**
 * 4. 메뉴 상세 모달 (코드 그대로 유지)
 */
function openMenuModal(item, cartObj) {
    const modal = document.createElement('div');
    modal.style.cssText = "position:fixed; inset:0; background:rgba(0,0,0,0.8); z-index:9999; display:flex; align-items:center; justify-content:center; padding:20px;";
    
    let qty = 1;
    const options = item.options || [];

    modal.innerHTML = `
        <div class="vstack" style="background:#0d1117; width:100%; max-width:400px; border-radius:20px; padding:20px; border:1px solid #263241; max-height:90vh; overflow-y:auto;">
            <div style="width:100%; aspect-ratio:1.5/1; background:#1c2632; border-radius:12px; overflow:hidden; margin-bottom:15px;">
                <img src="${item.img || ''}" style="width:100%; height:100%; object-fit:cover;">
            </div>
            <h2 style="margin:0;">${item.name}</h2>
            <p style="color:#9ca3af; font-size:14px; margin:8px 0 15px;">${item.desc || '맛있는 메뉴입니다.'}</p>
            
            <div id="modal-options-bin" class="vstack" style="gap:15px; margin-bottom:20px;">
                ${options.map((grp, gIdx) => `
                    <div class="opt-group vstack" data-gidx="${gIdx}" data-req="${grp.required}">
                        <div style="font-weight:700; font-size:14px; margin-bottom:8px;">${grp.name} ${grp.required ? '<span style="color:#ef4444; font-size:12px;">(필수)</span>' : ''}</div>
                        <div class="vstack" style="gap:8px;">
                            ${grp.items.map((opt, oIdx) => `
                                <label class="hstack" style="background:#1c2632; padding:12px; border-radius:10px; justify-content:space-between; cursor:pointer;">
                                    <div class="hstack" style="gap:8px;">
                                        <input type="${grp.type === 'multi' ? 'checkbox' : 'radio'}" name="grp-${gIdx}" value="${oIdx}">
                                        <span>${opt.label}</span>
                                    </div>
                                    <span style="font-size:13px; color:var(--primary);">+${fmt(opt.price)}원</span>
                                </label>
                            `).join('')}
                        </div>
                    </div>
                `).join('')}
            </div>

            <div class="hstack" style="justify-content:space-between; padding:15px 0; border-top:1px solid #263241;">
                <span>수량</span>
                <div class="hstack" style="gap:15px;">
                    <button class="btn" id="m-minus">-</button>
                    <b id="m-qty">1</b>
                    <button class="btn" id="m-plus">+</button>
                </div>
            </div>

            <button id="m-add-btn" class="btn primary" style="height:50px; font-weight:700; margin-top:10px;">장바구니 담기</button>
            <button id="m-close-btn" class="btn" style="margin-top:10px; background:transparent; border:none; opacity:0.5;">닫기</button>
        </div>
    `;

    document.body.appendChild(modal);

    modal.querySelector('#m-plus').onclick = () => { qty++; modal.querySelector('#m-qty').textContent = qty; };
    modal.querySelector('#m-minus').onclick = () => { if(qty > 1) qty--; modal.querySelector('#m-qty').textContent = qty; };
    modal.querySelector('#m-close-btn').onclick = () => modal.remove();

    modal.querySelector('#m-add-btn').onclick = () => {
        const selectedOptions = [];
        const optionText = [];
        const groups = modal.querySelectorAll('.opt-group');

        for (const grp of groups) {
            const gIdx = grp.dataset.gidx;
            const checked = grp.querySelectorAll('input:checked');
            if (grp.dataset.req === 'true' && checked.length === 0) {
                alert(`'${options[gIdx].name}' 옵션은 필수입니다.`);
                return;
            }
            checked.forEach(input => {
                const oIdx = input.value;
                const optObj = options[gIdx].items[oIdx];
                selectedOptions.push({ group: options[gIdx].name, label: optObj.label, price: optObj.price });
                optionText.push(`${options[gIdx].name}:${optObj.label}`);
            });
        }

        cartObj.add(item, qty, selectedOptions, optionText);
        modal.remove();
    };
}
