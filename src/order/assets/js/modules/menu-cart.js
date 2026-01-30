// /src/order/assets/js/modules/menu-cart.js
import { currentStoreId } from './cust-store.js';

const $ = (s, r = document) => r.querySelector(s);

/**
 * [DB 연동] 서버에서 실시간 메뉴 목록을 가져옵니다.
 */
export async function loadMenu() {
    const sid = currentStoreId();
    try {
        const res = await fetch(`/api/menus?storeId=${sid}`);
        const data = await res.json();
        // 판매 중인(active) 메뉴만 반환
        return (data.menus || []).filter(m => m.active !== false);
    } catch (e) {
        console.error('[menu-cart] 메뉴 로딩 실패:', e);
        return [];
    }
}

/**
 * 메뉴판 렌더링
 */
export async function renderMenu(gridId, onAddClick) {
    const grid = document.getElementById(gridId);
    if (!grid) return;

    const menu = await loadMenu();
    grid.innerHTML = '';

    if (!menu.length) {
        grid.innerHTML = '<div class="small" style="padding:40px; text-align:center; opacity:0.6;">준비된 메뉴가 없습니다.</div>';
        return;
    }

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

        card.onclick = () => onAddClick(item);
        grid.appendChild(card);
    });
}

/**
 * 옵션 선택 모달 렌더링 (사장님이 엑셀로 올린 옵션들 처리)
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
                            <span class="small" style="opacity:0.5;">${group.type === 'multi' ? '복수선택' : '단일선택'}</span>
                        </div>
                        <div class="vstack" style="gap:8px;">
                            ${group.items.map((opt, oIdx) => `
                                <label class="hstack" style="background:#1c2632; padding:12px; border-radius:10px; justify-content:space-between; cursor:pointer;">
                                    <div class="hstack" style="gap:8px;">
                                        <input type="${group.type === 'multi' ? 'checkbox' : 'radio'}" 
                                               name="group-${gIdx}" 
                                               value="${oIdx}" 
                                               style="width:18px; height:18px;">
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

    const close = () => modal.remove();
    modal.querySelector('#opt-close-btn').onclick = close;

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
        close();
    };
}

/**
 * 장바구니 합계 계산
 */
export function calculateTotal(cart) {
    return cart.reduce((sum, item) => {
        const itemBase = Number(item.price);
        const optTotal = (item.selectedOptions || []).reduce((s, o) => s + Number(o.price), 0);
        return sum + (itemBase + optTotal) * (item.qty || 1);
    }, 0);
}
