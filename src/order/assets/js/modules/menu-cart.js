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
        return (data.menus || []).filter(m => m.active !== false);
    } catch (e) {
        console.error('[menu-cart] 로딩 실패:', e);
        return [];
    }
}

/**
 * 2. 장바구니 시스템 (수량 조절 및 옵션 텍스트 포함)
 */
export function makeCart(boxId, totalId) {
    const cart = {
        items: [],
        box: document.getElementById(boxId),
        totalEl: document.getElementById(totalId),

        add(item, qty, selectedOptions = [], optionText = []) {
            // 옵션이 다르면 별개 항목으로 취급하기 위해 키 생성
            const optKey = JSON.stringify(selectedOptions);
            const existing = this.items.find(i => i.id === item.id && JSON.stringify(i.selectedOptions) === optKey);

            if (existing) {
                existing.qty += qty;
            } else {
                this.items.push({
                    ...item,
                    qty,
                    selectedOptions,
                    optionText // 화면 표시용 (예: ["사이즈:라지"])
                });
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

        // menu-cart.js 약 65라인 근처 render() 함수 수정
        render() {
            if (!this.box) return;
            if (this.items.length === 0) {
                this.box.innerHTML = '<div class="small" style="padding:10px; opacity:0.5;">담긴 메뉴가 없습니다.</div>';
            } else {
                this.box.innerHTML = this.items.map((it, idx) => `
                    <div class="hstack" style="justify-content:space-between; ...">
                        <div>
                            <div style="font-size:14px; font-weight:600;">${it.name} x ${it.qty}</div>
                            ${it.optionText && it.optionText.length 
                                ? `<div class="small" style="color:#9ca3af; font-size:11px; margin-top:2px;">
                                     ${it.optionText.map(opt => `└ ${opt}`).join('<br>')}
                                   </div>` 
                                : ''}
                            <div style="font-size:13px; color:var(--primary); margin-top:4px;">
                                ${fmt((Number(it.price) + it.selectedOptions.reduce((s,o)=>s+o.price,0)) * it.qty)}원
                            </div>
                        </div>
                        ...
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
 * 3. 메뉴판 렌더링 (클릭 시 모달 열기 연결)
 */
export async function renderMenu(gridId, cartObj) {
    const grid = document.getElementById(gridId);
    if (!grid) return;

    const menu = await loadMenu();
    grid.innerHTML = '';

    menu.forEach(item => {
        const card = document.createElement('div');
        card.className = 'menu-card vstack';
        card.style.cssText = "background:#111922; border-radius:15px; padding:10px; cursor:pointer; border:1px solid #263241; align-items:center;";
        card.innerHTML = `
            <div style="width:100%; aspect-ratio:1/1; background:#1c2632; border-radius:10px; overflow:hidden; margin-bottom:8px;">
                <img src="${item.img || ''}" style="width:100%; height:100%; object-fit:cover;" onerror="this.style.display='none'">
            </div>
            <div style="font-weight:600; font-size:14px; text-align:center;">${item.name}</div>
            <div style="color:var(--primary); font-weight:700; font-size:13px; margin-top:4px;">${fmt(item.price)}원</div>
        `;
        // 🔥 클릭 시 모달 열기!
        card.onclick = () => openMenuModal(item, cartObj);
        grid.appendChild(card);
    });
}

/**
 * 4. 메뉴 상세 모달 (핵심 기능)
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

    // 수량 조절 이벤트
    modal.querySelector('#m-plus').onclick = () => { qty++; modal.querySelector('#m-qty').textContent = qty; };
    modal.querySelector('#m-minus').onclick = () => { if(qty > 1) qty--; modal.querySelector('#m-qty').textContent = qty; };
    modal.querySelector('#m-close-btn').onclick = () => modal.remove();

    // 장바구니 담기 클릭
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
