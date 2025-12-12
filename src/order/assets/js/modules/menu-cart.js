// /src/order/assets/js/modules/menu-cart.js
//
// 메뉴 카드 + 모달 상세 + 장바구니
// - 메뉴 데이터: ['admin','menuByStore', storeId] → ['admin','menu'] → 기본 시드
// - 필드: id, name, price, img, desc, active, soldOut

import { get, patch, fmt } from './cust-store.js';

// 1) 현재 storeId 얻기: window 전역 → URL → 'store1' 순
function currentStoreId() {
  if (window.qrnrStoreId) return window.qrnrStoreId;
  try {
    const u = new URL(location.href);
    return u.searchParams.get('store') || 'store1';
  } catch (e) {
    return 'store1';
  }
}

// 2) 스토어별 메뉴 로딩:
//    ['admin','menuByStore', storeId] → ['admin','menu'] → 시드
export function loadMenu() {
  const storeId = currentStoreId();

  // (A) 다점포: 매장별 메뉴 우선
  let menu = get(['admin', 'menuByStore', storeId]) || [];

  // (B) 과거 전역 키 호환 (admin.menu 템플릿)
  if (!Array.isArray(menu) || menu.length === 0) {
    menu = get(['admin', 'menu']) || [];
  }

  // (C) active 필터
  const active = (menu || []).filter(m => m && m.active !== false);

  // (D) 그래도 없으면 시드로 폴백
  if (active.length) return active;

  return [
    { id: 'A1', name: '아메리카노', price: 3000, active: true },
    { id: 'A2', name: '라떼',       price: 4000, active: true },
    { id: 'B1', name: '크로와상',   price: 3500, active: true },
  ];
}

// ─────────────────────────────────────────────
// 모달 DOM 준비
// ─────────────────────────────────────────────
let modalInited = false;
let modalBackdrop;
let modalBox;
let modalImg;
let modalName;
let modalDesc;
let modalPrice;
let modalQtyInput;
let modalAddBtn;
let modalCloseBtn;

// 한 번만 body에 모달 DOM 생성
function ensureMenuModal() {
  if (modalInited) return;
  modalInited = true;

  modalBackdrop = document.createElement('div');
  modalBackdrop.id = 'menu-detail-backdrop';
  modalBackdrop.style.position = 'fixed';
  modalBackdrop.style.inset = '0';
  modalBackdrop.style.background = 'rgba(0,0,0,0.55)';
  modalBackdrop.style.display = 'none';
  modalBackdrop.style.alignItems = 'center';
  modalBackdrop.style.justifyContent = 'center';
  modalBackdrop.style.zIndex = '9998';
  modalBackdrop.style.padding = '16px';

  modalBox = document.createElement('div');
  modalBox.style.maxWidth = '420px';
  modalBox.style.width = '100%';
  modalBox.style.background = '#0b1620';
  modalBox.style.borderRadius = '18px';
  modalBox.style.boxShadow = '0 18px 40px rgba(0,0,0,0.6)';
  modalBox.style.overflow = 'hidden';
  modalBox.style.display = 'flex';
  modalBox.style.flexDirection = 'column';

  modalBox.innerHTML = `
    <div id="menu-detail-img-wrap" style="width:100%;aspect-ratio:4/3;background:#111;display:flex;align-items:center;justify-content:center;overflow:hidden">
      <img id="menu-detail-img" src="" alt="" style="max-width:100%;max-height:100%;object-fit:cover;display:none"/>
      <div id="menu-detail-img-placeholder" style="font-size:12px;color:#9ca3af">이미지 없음</div>
    </div>
    <div style="padding:16px;display:flex;flex-direction:column;gap:8px">
      <div id="menu-detail-name" style="font-size:17px;font-weight:600"></div>
      <div id="menu-detail-price" style="font-size:15px;color:#facc15"></div>
      <div id="menu-detail-desc" style="font-size:13px;color:#9ca3af;white-space:pre-wrap"></div>

      <div style="margin-top:10px;display:flex;align-items:center;justify-content:space-between;gap:8px">
        <div style="display:flex;align-items:center;gap:6px">
          <button type="button" id="menu-detail-qty-dec" class="btn" style="min-width:32px">-</button>
          <input id="menu-detail-qty" type="number" min="1" value="1" class="input" style="width:60px;text-align:center">
          <button type="button" id="menu-detail-qty-inc" class="btn" style="min-width:32px">+</button>
        </div>
        <div id="menu-detail-total" style="font-size:14px;color:#e5e7eb"></div>
      </div>

      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px">
        <button type="button" id="menu-detail-close" class="btn">닫기</button>
        <button type="button" id="menu-detail-add" class="btn primary">장바구니 담기</button>
      </div>
    </div>
  `;

  modalBackdrop.appendChild(modalBox);
  document.body.appendChild(modalBackdrop);

  // 요소 참조
  modalImg          = modalBox.querySelector('#menu-detail-img');
  const imgPlaceholder = modalBox.querySelector('#menu-detail-img-placeholder');
  modalName         = modalBox.querySelector('#menu-detail-name');
  modalDesc         = modalBox.querySelector('#menu-detail-desc');
  modalPrice        = modalBox.querySelector('#menu-detail-price');
  modalQtyInput     = modalBox.querySelector('#menu-detail-qty');
  modalAddBtn       = modalBox.querySelector('#menu-detail-add');
  modalCloseBtn     = modalBox.querySelector('#menu-detail-close');
  const decBtn      = modalBox.querySelector('#menu-detail-qty-dec');
  const incBtn      = modalBox.querySelector('#menu-detail-qty-inc');
  const totalEl     = modalBox.querySelector('#menu-detail-total');

  function updateTotal(unitPrice) {
    const q = Math.max(1, Number(modalQtyInput.value || 1));
    totalEl.textContent = `${fmt(unitPrice * q)}원`;
  }

  // 수량 버튼
  if (decBtn) {
    decBtn.onclick = () => {
      const v = Math.max(1, Number(modalQtyInput.value || 1) - 1);
      modalQtyInput.value = String(v);
      const unit = Number(modalPrice.dataset.unit || 0);
      updateTotal(unit);
    };
  }
  if (incBtn) {
    incBtn.onclick = () => {
      const v = Math.max(1, Number(modalQtyInput.value || 1) + 1);
      modalQtyInput.value = String(v);
      const unit = Number(modalPrice.dataset.unit || 0);
      updateTotal(unit);
    };
  }
  if (modalQtyInput) {
    modalQtyInput.oninput = () => {
      if (!modalQtyInput.value || Number(modalQtyInput.value) <= 0) {
        modalQtyInput.value = '1';
      }
      const unit = Number(modalPrice.dataset.unit || 0);
      updateTotal(unit);
    };
  }

  // 바깥 클릭 시 닫기
  modalBackdrop.addEventListener('click', (e) => {
    if (e.target === modalBackdrop) {
      hideMenuModal();
    }
  });

  if (modalCloseBtn) {
    modalCloseBtn.onclick = () => hideMenuModal();
  }

  // 이미지 표시/숨김 helper
  modalBox._setImage = (src) => {
    if (src) {
      modalImg.src = src;
      modalImg.style.display = 'block';
      if (imgPlaceholder) imgPlaceholder.style.display = 'none';
    } else {
      modalImg.src = '';
      modalImg.style.display = 'none';
      if (imgPlaceholder) imgPlaceholder.style.display = 'block';
    }
  };

  // 가격/합계 helper
  modalBox._setUnitPrice = (p) => {
    const unit = Number(p || 0);
    modalPrice.dataset.unit = String(unit);
    modalPrice.textContent = unit ? `${fmt(unit)}원` : '';
    updateTotal(unit);
  };
}

function showMenuModal() {
  if (!modalBackdrop) return;
  modalBackdrop.style.display = 'flex';
}

function hideMenuModal() {
  if (!modalBackdrop) return;
  modalBackdrop.style.display = 'none';
}

// 특정 메뉴 아이템으로 모달 열기
function openMenuModal(item, cart) {
  ensureMenuModal();
  if (!modalBox || !modalName || !modalDesc || !modalPrice || !modalQtyInput || !modalAddBtn) return;

  const unitPrice = Number(item.price || 0);

  modalName.textContent = item.name || '';
  modalDesc.textContent = item.desc || '';
  modalBox._setImage(item.img || '');
  modalQtyInput.value = '1';
  modalBox._setUnitPrice(unitPrice);

  // "장바구니 담기" 버튼 핸들러 재설정
  modalAddBtn.onclick = () => {
    const qty = Math.max(1, Number(modalQtyInput.value || 1));

    // 이미 같은 id 항목 있으면 수량만 증가
    const idx = cart.items.findIndex(x => x.id === item.id);
    if (idx >= 0) {
      cart.items[idx].qty += qty;
    } else {
      cart.items.push({
        id: item.id,
        name: item.name,
        price: unitPrice,
        qty,
      });
    }

    cart.render();
    hideMenuModal();
  };

  showMenuModal();
}

// ─────────────────────────────────────────────
// 메뉴 카드 렌더링
// ─────────────────────────────────────────────
export function renderMenu(gridId, cart) {
  const list = loadMenu();
  const g = document.getElementById(gridId);
  if (!g) return;
  g.innerHTML = '';

  ensureMenuModal();

  list.forEach(item => {
    const hasOptions =
    Array.isArray(item.options) && item.options.length > 0;

    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.style.cssText = [
      'width:180px',
      'height:140px',
      'border-radius:14px',
      'display:flex',
      'flex-direction:column',
      'justify-content:space-between',
      'align-items:stretch',
      'padding:8px',
      'background:#0b1620',
      'border:1px solid #263241',
      'text-align:left'
    ].join(';');

    const hasImg = !!item.img;
    const soldOut = !!item.soldOut;

    // 카드 내부 구조
    btn.innerHTML = `
      <div style="flex:1;display:flex;align-items:center;justify-content:center;overflow:hidden;border-radius:10px;background:#111;margin-bottom:4px">
        ${
          hasImg
            ? `<img src="${item.img}" alt="" style="max-width:100%;max-height:100%;object-fit:cover">`
            : `<span class="small" style="color:#6b7280">이미지 없음</span>`
        }
      </div>
      <div style="display:flex;flex-direction:column;gap:2px">
        <div style="font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
          ${item.name}
        </div>
        <div style="font-size:13px;color:#facc15">
          ${fmt(item.price || 0)}원
        </div>
        ${
          soldOut
            ? `<div style="font-size:11px;color:#f97316;">일시품절</div>`
            : ''
        }
      </div>
    `;

    if (soldOut) {
      btn.onclick = () => {
        alert('현재 일시품절 메뉴입니다.');
      };
    } else {
      btn.onclick = () => {
        openMenuModal(item, cart);
      };
    }

    g.appendChild(btn);
  });
}

// ─────────────────────────────────────────────
// 장바구니
// ─────────────────────────────────────────────
export function makeCart(containerId, totalId) {
  const cart = {
    items: [],
    total() {
      return this.items.reduce((s, it) => s + Number(it.price || 0) * Number(it.qty || 1), 0);
    },
    render() {
      const box = document.getElementById(containerId);
      if (!box) return;
      box.innerHTML = '';
      if (!this.items.length) {
        box.innerHTML = '<div class="small">담긴 항목이 없습니다. 메뉴를 눌러 추가해주세요.</div>';
      }
      this.items.forEach((it, idx) => {
        const row = document.createElement('div');
        row.className = 'hstack';
        row.style.gap = '8px';
        row.style.justifyContent = 'space-between';
        row.style.padding = '6px 0';
        row.innerHTML =
          `<div>${it.name} x ${it.qty}</div>
           <div>${fmt(Number(it.price || 0) * Number(it.qty || 1))}원</div>
           <div class="hstack" style="gap:6px">
             <button class="btn" data-a="minus">-</button>
             <button class="btn" data-a="plus">+</button>
             <button class="btn" data-a="del">삭제</button>
           </div>`;
        row.querySelector('[data-a="minus"]').onclick = () => {
          if (it.qty > 1) it.qty--;
          else this.items.splice(idx, 1);
          this.render();
        };
        row.querySelector('[data-a="plus"]').onclick = () => {
          it.qty++;
          this.render();
        };
        row.querySelector('[data-a="del"]').onclick = () => {
          this.items.splice(idx, 1);
          this.render();
        };
        box.appendChild(row);
      });
      const totalEl = document.getElementById(totalId);
      if (totalEl) totalEl.textContent = fmt(this.total());
    }
  };
  return cart;
}
