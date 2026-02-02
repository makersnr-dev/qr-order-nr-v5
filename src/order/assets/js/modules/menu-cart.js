import { currentStoreId } from './cust-store.js';

const $ = (s, r = document) => r.querySelector(s);

/**
 * 1. [DB 연동] 서버에서 실시간 메뉴 목록을 가져옵니다.
 */
export async function loadMenu() {
    const sid = currentStoreId();
    try {
        const res = await fetch(`/api/menus?storeId=${sid}`);
        const data = await res.json();
        return (data.menus || []).filter(m => m.active !== false);
    } catch (e) {
        console.error('[menu-cart] 메뉴 로딩 실패:', e);
        return [];
    }
}

/**
 * 🚀 2. [추가] 장바구니 시스템 생성 (에러 해결 핵심)
 * store.html에서 호출하는 makeCart('cart-box', 'total')가 바로 이것입니다.
 */
export function makeCart(boxId, totalId) {
    const cart = {
        items: [], // 담긴 메뉴들
        box: document.getElementById(boxId),
        totalEl: document.getElementById(totalId),

        // 메뉴 추가 (옵션 포함)
        add(item, selectedOptions = []) {
            // 중복 메뉴 체크 (옵션까지 똑같은 경우만 수량 증가)
            const optKey = JSON.stringify(selectedOptions);
            const existing = this.items.find(i => i.id === item.id && JSON.stringify(i.selectedOptions) === optKey);

            if (existing) {
                existing.qty++;
            } else {
                this.items.push({
                    ...item,
                    qty: 1,
                    selectedOptions
                });
            }
            this.render();
        },

        // 수량 변경/삭제
        updateQty(idx, delta) {
            this.items[idx].qty += delta;
            if (this.items[idx].qty <= 0) this.items.splice(idx, 1);
            this.render();
        },

        // 합계 계산
        total() {
            return this.items.reduce((sum, item) => {
                const itemBase = Number(item.price);
                const optTotal = (item.selectedOptions || []).reduce((s, o) => s + Number(o.price), 0);
                return sum + (itemBase + optTotal) * item.qty;
            }, 0);
        },

        // 화면에 장바구니 그리기
        render() {
            if (!this.box) return;
            this.box.innerHTML = this.items.map((item, idx) => {
                const optText = (item.selectedOptions || []).map(o => o.label).join(', ');
                return `
                    <div class="hstack" style="justify-content:space-between; background:#1c2632; padding:10px; border-radius:8px;">
                        <div class="vstack" style="gap:2px;">
                            <div style="font-size:14px;">${item.name}</div>
                            ${optText ? `<div class="small" style="opacity:0.6; font-size:11px;">${optText}</div>` : ''}
                        </div>
                        <div class="hstack" style="gap:10px;">
                            <div class="hstack" style="gap:5px; border:1px solid #30363d; border-radius:5px; padding:2px 5px;">
                                <span style="cursor:pointer; padding:0 5px;" onclick="window.qrnrCart.updateQty(${idx}, -1)">-</span>
                                <span style="min-width:20px; text-align:center;">${item.qty}</span>
                                <span style="cursor:pointer; padding:0 5px;" onclick="window.qrnrCart.updateQty(${idx}, 1)">+</span>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');

            if (this.totalEl) this.totalEl.textContent = this.total().toLocaleString();
            // 전역에서 접근 가능하도록 연결 (onclick 수량조절용)
            window.qrnrCart = this;
        }
    };
    window.qrnrCart = cart;
    return cart;
}

/**
 * 3. 메뉴판 렌더링
 */
export async function renderMenu(gridId, cartObj) {
    const grid = document.getElementById(gridId);
    if (!grid) return;

    const menu = await loadMenu();
    grid.innerHTML = '';

    menu.forEach(item => {
        const card = document.createElement('div');
        card.className = 'menu-card hstack';
        card.style.cssText = "background:#111922; border-radius:12px; padding:12px; margin-bottom:10px; cursor:pointer; gap:12px; border:1px solid #263241;";
        
        card.innerHTML = `
            <div class="menu-img" style="width:80px; height:80px; background:#1c2632; border-radius:8px; flex-shrink:0; overflow:hidden;">
                <img src="${item.img || '/assets/img/no-image.png'}" style="width:100%; height:100%; object-fit:cover;">
            </div>
            <div class="vstack" style="flex:1; justify-content:center;">
                <div style="font-weight:600; font-size:16px;">${item.name}</div>
                <div class="small" style="color:var(--muted); margin:4px 0;">${item.desc || ''}</div>
                <div style="color:var(--primary); font-weight:700;">${Number(item.price).toLocaleString()}원</div>
            </div>
        `;

        card.onclick = () => {
            // 옵션이 있으면 모달 띄우기, 없으면 바로 장바구니행
            if (item.options && item.options.length > 0) {
                renderOptionModal(item, (it, opts) => cartObj.add(it, opts));
            } else {
                cartObj.add(item);
            }
        };
        grid.appendChild(card);
    });
}

/**
 * 4. 옵션 선택 모달 렌더링
 */
export function renderOptionModal(item, onConfirm) {
    const modal = document.createElement('div');
    modal.className = 'modal show';
    modal.style.cssText = "position:fixed; inset:0; background:rgba(0,0,0,0.7); z-index:10000; display:flex; align-items:center; justify-content:center; padding:16px;";

    const options = item.options || [];
    
    modal.innerHTML = `
        <div class="vstack" style="background:#0d1117; width:100%; max-width:400px; border-radius:20px; padding:20px; border:1px solid #263241; max-height:80vh; overflow-y:auto;">
            <h3 style="margin-bottom:8px;">${item.name}</h3>
            <div class="small" style="margin-bottom:16px; opacity:0.7;">옵션을 선택해주세요.</div>
            <div id="opt-groups-list" class="vstack" style="gap:20px;">
                ${options.map((group, gIdx) => `
                    <div class="opt-group vstack" data-group-idx="${gIdx}" data-required="${group.required}">
                        <div class="hstack" style="justify-content:space-between; margin-bottom:8px;">
                            <span style="font-weight:600;">${group.name} ${group.required ? '<span style="color:#ef4444; font-size:12px;">(필수)</span>' : ''}</span>
                        </div>
                        <div class="vstack" style="gap:8px;">
                            ${group.items.map((opt, oIdx) => `
                                <label class="hstack" style="background:#1c2632; padding:12px; border-radius:10px; justify-content:space-between; cursor:pointer;">
                                    <div class="hstack" style="gap:8px;">
                                        <input type="${group.type === 'multi' ? 'checkbox' : 'radio'}" name="group-${gIdx}" value="${oIdx}">
                                        <span>${opt.label}</span>
                                    </div>
                                    <span class="small" style="color:var(--primary);">+${opt.price.toLocaleString()}원</span>
                                </label>
                            `).join('')}
                        </div>
                    </div>
                `).join('')}
            </div>
            <button id="opt-confirm-btn" class="btn primary" style="margin-top:24px; height:50px; font-weight:bold;">장바구니 담기</button>
            <button id="opt-close-btn" class="btn" style="margin-top:8px; background:transparent; border:none; opacity:0.5;">취소</button>
        </div>
    `;

    document.body.appendChild(modal);
    modal.querySelector('#opt-close-btn').onclick = () => modal.remove();
    modal.querySelector('#opt-confirm-btn').onclick = () => {
        const selectedOptions = [];
        const groups = modal.querySelectorAll('.opt-group');
        for (const group of groups) {
            const gIdx = group.dataset.groupIdx;
            const checked = group.querySelectorAll('input:checked');
            if (group.dataset.required === 'true' && checked.length === 0) {
                alert(`'${options[gIdx].name}' 옵션은 필수 선택입니다.`);
                return;
            }
            checked.forEach(input => {
                const oIdx = input.value;
                selectedOptions.push({
                    groupName: options[gIdx].name,
                    label: options[gIdx].items[oIdx].label,
                    price: options[gIdx].items[oIdx].price
                });
            });
        }
        onConfirm(item, selectedOptions);
        modal.remove();
    };
}
