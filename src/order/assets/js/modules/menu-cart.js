// /src/order/assets/js/modules/menu-cart.js
// 매장별 메뉴 로딩 + 장바구니 + 상세 모달
// 데이터 소스: ['admin','menuByStore', storeId] → ['admin','menu'] → 기본 시드

import { get, fmt } from './cust-store.js';

// ─────────────────────────────────────────────
// 1) 현재 storeId
// ─────────────────────────────────────────────
function currentStoreId() {
  if (window.qrnrStoreId) return window.qrnrStoreId;
  try {
    const u = new URL(location.href);
    return u.searchParams.get('store') || 'store1';
  } catch (e) {
    return 'store1';
  }
}

// ─────────────────────────────────────────────
// 2) 메뉴 로딩 (매장 > 전역 > 시드)
// ─────────────────────────────────────────────
export function loadMenu() {
  const storeId = currentStoreId();

  // (A) 매장별 메뉴
  let menu = get(['admin', 'menuByStore', storeId]);

  // (B) fallback: 전 매장 공통 템플릿
  if (!Array.isArray(menu) || menu.length === 0) {
    menu = get(['admin', 'menu']) || [];
  }

  // (C) active 필터
  let list = (menu || []).filter(m => m && m.active !== false);

  // (D) 그래도 없으면 시드 메뉴
  if (!list.length) {
    list = [
      { id: 'A1', name: '아메리카노', price: 3000, active: true },
      { id: 'A2', name: '라떼',       price: 4000, active: true },
      { id: 'B1', name: '크로와상',   price: 3500, active: true },
    ];
  }

  return list;
}

// ─────────────────────────────────────────────
// 모달 DOM
// ─────────────────────────────────────────────
let modalInited = false;
let modalBackdrop, modalBox, modalImg, modalName, modalDesc, modalPrice;
let modalQtyInput, modalAddBtn;

// 한 번만 생성
function ensureMenuModal() {
  if (modalInited) return;
  modalInited = true;

  modalBackdrop = document.createElement('div');
  modalBackdrop.id = 'menu-detail-backdrop';
  modalBackdrop.style = `
    position:fixed;inset:0;background:rgba(0,0,0,0.55);
    display:none;align-items:center;justify-content:center;
    z-index:9998;padding:16px;
  `;

  modalBox = document.createElement('div');
  modalBox.style = `
    max-width:420px;width:100%;background:#0b1620;border-radius:18px;
    box-shadow:0 18px 40px rgba(0,0,0,0.6);overflow:hidden;
    display:flex;flex-direction:column;
  `;

  modalBox.innerHTML = `
    <div style="width:100%;aspect-ratio:4/3;background:#111;
                display:flex;align-items:center;justify-content:center;overflow:hidden">
      <img id="menu-detail-img" src="" style="max-width:100%;max-height:100%;object-fit:cover;display:none">
      <div id="menu-detail-img-placeholder" style="font-size:12px;color:#9ca3af">이미지 없음</div>
    </div>

    <div style="padding:16px;display:flex;flex-direction:column;gap:8px">
      <div id="menu-detail-name" style="font-size:17px;font-weight:600"></div>
      <div id="menu-detail-price" style="font-size:15px;color:#facc15"></div>
      <div id="menu-detail-desc" style="font-size:13px;color:#9ca3af;white-space:pre-wrap"></div>

      <div style="margin-top:10px;display:flex;align-items:center;justify-content:space-between">
        <div style="display:flex;align-items:center;gap:6px">
          <button id="menu-detail-qty-dec" class="btn" style="min-width:32px">-</button>
          <input id="menu-detail-qty" type="number" min="1" value="1" class="input"
                 style="width:60px;text-align:center">
          <button id="menu-detail-qty-inc" class="btn" style="min-width:32px">+</button>
        </div>
        <div id="menu-detail-total" style="font-size:14px;color:#e5e7eb"></div>
      </div>

      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px">
        <button id="menu-detail-close" class="btn">닫기</button>
        <button id="menu-detail-add" class="btn primary">장바구니 담기</button>
      </div>
    </div>
  `;

  modalBackdrop.appendChild(modalBox);
  document.body.appendChild(modalBackdrop);

  modalImg          = modalBox.querySelector('#menu-detail-img');
  const imgPh       = modalBox.querySelector('#menu-detail-img-placeholder');
  modalName         = modalBox.querySelector('#menu-detail-name');
  modalDesc         = modalBox.querySelector('#menu-detail-desc');
  modalPrice        = modalBox.querySelector('#menu-detail-price');
  modalQtyInput     = modalBox.querySelector('#menu-detail-qty');
  modalAddBtn       = modalBox.querySelector('#menu-detail-add');
  const decBtn      = modalBox.querySelector('#menu-detail-qty-dec');
  const incBtn      = modalBox.querySelector('#menu-detail-qty-inc');
  const totalEl     = modalBox.querySelector('#menu-detail-total');
  const closeBtn    = modalBox.querySelector('#menu-detail-close');

  function updateTotal() {
    const unit = Number(modalPrice.dataset.unit || 0);
    const qty = Math.max(1, Number(modalQtyInput.value || 1));
    totalEl.textContent = `${fmt(unit * qty)}원`;
  }

  decBtn.onclick = () => {
    const v = Math.max(1, Number(modalQtyInput.value) - 1);
    modalQtyInput.value = v;
    updateTotal();
  };
  incBtn.onclick = () => {
    const v = Math.max(1, Number(modalQtyInput.value) + 1);
    modalQtyInput.value = v;
    updateTotal();
  };
  modalQtyInput.oninput = updateTotal;
  closeBtn.onclick = () => (modalBackdrop.style.display = 'none');

  modalBox._setImage = (src) => {
    if (src) {
      modalImg.src = src;
      modalImg.style.display = 'block';
      imgPh.style.display = 'none';
    } else {
      modalImg.src = '';
      modalImg.style.display = 'none';
      imgPh.style.display = 'block';
    }
  };

  modalBox._setUnit = (p) => {
    const unit = Number(p || 0);
    modalPrice.dataset.unit = unit;
    modalPrice.textContent = `${fmt(unit)}원`;
    updateTotal();
  };

  modalBackdrop.addEventListener('click', (e) => {
    if (e.target === modalBackdrop) modalBackdrop.style.display = 'none';
  });
}

function openMenuModal(item, cart) {
  ensureMenuModal();

  modalName.textContent = item.name || '';
  modalDesc.textContent = item.desc || '';
  modalBox._setImage(item.img || '');
  modalBox._setUnit(item.price || 0);
  modalQtyInput.value = '1';

  modalAddBtn.onclick = () => {
    const qty = Math.max(1, Number(modalQtyInput.value || 1));
    const idx = cart.items.findIndex(x => x.id === item.id);

    if (idx >= 0) {
      cart.items[idx].qty += qty;
    } else {
      cart.items.push({
        id: item.id,
        name: item.name,
        price: item.price,
        qty,
      });
    }

    cart.render();
    modalBackdrop.style.display = 'none';
  };

  modalBackdrop.style.display = 'flex';
}

// ─────────────────────────────────────────────
// 메뉴 렌더링
// ─────────────────────────────────────────────
export function renderMenu(gridId, cart) {
  const list = loadMenu();
  const g = document.getElementById(gridId);
  if (!g) return;

  g.innerHTML = '';
  ensureMenuModal();

  list.forEach(item => {
    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.style = `
      width:180px;height:140px;border-radius:14px;padding:8px;
      display:flex;flex-direction:column;justify-content:space-between;
      background:#0b1620;border:1px solid #263241;text-align:left;
    `;

    const soldOut = !!item.soldOut;
    btn.innerHTML = `
      <div style="flex:1;display:flex;align-items:center;justify-content:center;
                  overflow:hidden;border-radius:10px;background:#111;margin-bottom:4px">
        ${
          item.img
            ? `<img src="${item.img}" style="max-width:100%;max-height:100%;object-fit:cover">`
            : `<span class="small" style="color:#6b7280">이미지 없음</span>`
        }
      </div>
      <div style="display:flex;flex-direction:column;gap:2px">
        <div style="font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
          ${item.name}
        </div>
        <div style="font-size:13px;color:#facc15">
          ${fmt(item.price)}원
        </div>
        ${ soldOut ? `<div style="font-size:11px;color:#f97316;">일시품절</div>` : '' }
      </div>
    `;

    btn.onclick = () => {
      if (soldOut) return alert('현재 일시품절 메뉴입니다.');
      openMenuModal(item, cart);
    };

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
      return this.items.reduce((s, it) => s + it.price * it.qty, 0);
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
        row.style = 'gap:8px;justify-content:space-between;padding:6px 0;';
        row.innerHTML = `
          <div>${it.name} x ${it.qty}</div>
          <div>${fmt(it.price * it.qty)}원</div>
          <div class="hstack" style="gap:6px">
            <button class="btn" data-a="minus">-</button>
            <button class="btn" data-a="plus">+</button>
            <button class="btn" data-a="del">삭제</button>
          </div>
        `;

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
    },
  };

  return cart;
}
