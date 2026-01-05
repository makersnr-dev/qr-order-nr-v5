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
      <div id="menu-detail-options" style="margin-top:10px;display:flex;flex-direction:column;gap:10px"></div>

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

//
function renderOptions(container, options) {
  container.innerHTML = '';

  if (!Array.isArray(options) || options.length === 0) {
    container.style.display = 'none';
    return;
  }

  options = options
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  if (!Array.isArray(options) || options.length === 0) {
    container.style.display = 'none';
    return;
  }

  container.style.display = 'flex';
  container.style.flexDirection = 'column';
  container.style.gap = '10px';

  options.forEach(group => {
    const box = document.createElement('div');
    box.dataset.groupName = group.name;   
    box.dataset.groupId = group.id;      
    box.style.border = '1px solid #263241';
    box.style.borderRadius = '10px';
    box.style.padding = '8px';
    box.style.display = 'flex';
    box.style.flexDirection = 'column';
    box.style.gap = '6px';

    const title = document.createElement('div');
    title.textContent = group.name;
    title.style.fontSize = '13px';
    title.style.fontWeight = '600';
    box.appendChild(title);

    const isMulti = group.type === 'multi';
    const max =
      group.max !== undefined && group.max !== null
        ? Number(group.max)
        : Infinity;

    (group.items || [])
      .slice()
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .forEach(opt => {

      const label = document.createElement('label');
      label.style.display = 'flex';
      label.style.alignItems = 'center';
      label.style.gap = '6px';
      label.style.fontSize = '13px';

      const input = document.createElement('input');
      input.type = isMulti ? 'checkbox' : 'radio';
      input.name = `opt-${group.id}`;
      input.dataset.price = opt.price || 0;

      const span = document.createElement('span');
      span.textContent =
        opt.label +
        (opt.price ? ` (+${fmt(opt.price)}원)` : '');

      label.appendChild(input);
      label.appendChild(span);
      box.appendChild(label);

      // ⭐ max 도달 시 UI 제어
      if (isMulti && Number.isFinite(max)) {
        input.addEventListener('change', () => {
          const all = box.querySelectorAll(
            `input[name="opt-${group.id}"]`
          );
          const checked = box.querySelectorAll(
            `input[name="opt-${group.id}"]:checked`
          );

          if (checked.length >= max) {
            all.forEach(i => {
              if (!i.checked) i.disabled = true;
            });
          } else {
            all.forEach(i => {
              i.disabled = false;
            });
          }
        });
      }
    });
    // ⭐ 최초 렌더 시 max 상태 동기화
if (isMulti && Number.isFinite(max)) {
  const all = box.querySelectorAll(`input[name="opt-${group.id}"]`);
  const checked = box.querySelectorAll(`input[name="opt-${group.id}"]:checked`);

  if (checked.length >= max) {
    all.forEach(i => {
      if (!i.checked) i.disabled = true;
    });
  }
}

    container.appendChild(box);
  });
}


function calcSelectedOptionPrice(container) {
  let sum = 0;
  if (!container) return 0;

  const inputs = container.querySelectorAll('input:checked');
  inputs.forEach(input => {
    const price = Number(input.dataset.price || 0);
    sum += price;
  });

  return sum;
}

function getSelectedOptions(container) {
  const result = [];
  if (!container) return result;

  container.querySelectorAll('input:checked').forEach(input => {
    const groupBox = input.closest('[data-group-name]');
    const groupName = groupBox?.dataset.groupName || '';

    const labelText = input.nextElementSibling?.textContent || '';

     result.push({
      groupId: groupBox?.dataset.groupId || '',
      group: groupName,
      label: labelText,
      price: Number(input.dataset.price || 0)
    });

  });

  return result;
}


function validateOptions(optionBox, optionGroups) {
  // 옵션이 아예 없으면 항상 OK
  if (!Array.isArray(optionGroups) || optionGroups.length === 0) {
    return { ok: true };
  }

  // optionBox가 없는데 옵션 그룹은 있다? -> 화면 쪽 문제지만 일단 막기
  if (!optionBox) {
    return { ok: false, message: '옵션 영역을 찾지 못했습니다.' };
  }

  for (const group of optionGroups) {
    const gid = group.id;
    const gname = group.name || '옵션';

    // 이 그룹에 속한 input들만 집기 (name=opt-그룹id 로 이미 만들고 있음)
    const inputs = optionBox.querySelectorAll(`input[name="opt-${gid}"]`);
    const checked = optionBox.querySelectorAll(`input[name="opt-${gid}"]:checked`);
    const count = checked.length;

    // 기본값: single이면 1개, multi면 0개~무한
    const isMulti = group.type === 'multi';

    // required / min / max 규칙 계산
    const required = !!group.required;

    // min/max가 명시되면 그걸 우선, 아니면 required/type 기반 기본값
    let min = (group.min !== undefined && group.min !== null) ? Number(group.min) : (required ? 1 : 0);
    let max = (group.max !== undefined && group.max !== null)
      ? Number(group.max)
      : (isMulti ? Number.POSITIVE_INFINITY : 1);

    // single인데 max를 1보다 크게 줬다면 그래도 1로 고정하는게 안전
    if (!isMulti) max = 1;

    // input이 하나도 없으면(데이터가 이상) 스킵 또는 에러 처리 선택 가능
    if (!inputs || inputs.length === 0) {
      // 옵션 그룹 정의는 있는데 items가 없다 = 관리자 데이터 문제
      return { ok: false, message: `[${gname}] 옵션 항목이 없습니다.` };
    }

    if (count < min) {
      return { ok: false, message: `[${gname}] 최소 ${min}개 선택해야 합니다.` };
    }
    if (count > max) {
      // max가 무한이면 안 걸림
      return { ok: false, message: `[${gname}] 최대 ${max}개까지 선택 가능합니다.` };
    }
  }

  return { ok: true };
}

function isOptionSatisfied(optionBox, optionGroups) {
  if (!Array.isArray(optionGroups) || optionGroups.length === 0) {
    return true; // 옵션 없으면 항상 OK
  }

  for (const group of optionGroups) {
    const gid = group.id;

    const required = !!group.required;
    const min =
      group.min !== undefined && group.min !== null
        ? Number(group.min)
        : (required ? 1 : 0);

    if (min <= 0) continue;

    const checked = optionBox.querySelectorAll(
      `input[name="opt-${gid}"]:checked`
    );

    if (checked.length < min) {
      return false;
    }
  }

  return true;
}



// 특정 메뉴 아이템으로 모달 열기
function openMenuModal(item, cart) {
  ensureMenuModal();
  let currentUnitPrice = Number(item.price || 0);
  if (!modalBox || !modalName || !modalDesc || !modalPrice || !modalQtyInput || !modalAddBtn) return;

  const unitPrice = Number(item.price || 0);

  modalName.textContent = item.name || '';
  modalDesc.textContent = item.desc || '';
  renderOptions(
  modalBox.querySelector('#menu-detail-options'),
  item.options
);

  modalBox._setImage(item.img || '');
  modalQtyInput.value = '1';
  modalBox._setUnitPrice(unitPrice);
  
  const optionBox = modalBox.querySelector('#menu-detail-options');
  function updateAddButtonState() {
  if (!Array.isArray(item.options) || item.options.length === 0) {
    modalAddBtn.disabled = false;
    modalAddBtn.style.opacity = '1';
    return;
  }

  const ok = isOptionSatisfied(optionBox, item.options);
  modalAddBtn.disabled = !ok;
  modalAddBtn.style.opacity = ok ? '1' : '0.4';
}


  if (optionBox) {
    optionBox.onchange = () => {
    const optionPrice = calcSelectedOptionPrice(optionBox);
    const base = Number(item.price || 0);
    const newUnit = base + optionPrice;

    currentUnitPrice = newUnit;          
    modalBox._setUnitPrice(newUnit);
      updateAddButtonState();
  };

}


  // "장바구니 담기" 버튼 핸들러 재설정
  modalAddBtn.onclick = () => {
   

    const qty = Math.max(1, Number(modalQtyInput.value || 1));
const ruleCheck = validateOptions(optionBox, item.options);
  if (!ruleCheck.ok) {
    alert(ruleCheck.message);
    return;
  }
     const selectedOptions = getSelectedOptions(optionBox);

    // ✅ 화면/전송용 옵션 문자열 생성
    const optionText = selectedOptions.map(o => {
      return o.label ? `${o.group}:${o.label}` : o.group;
    });
    
    // ✅ 옵션 비교용 키 (문자열 기준)
    const optionKey = JSON.stringify(optionText);

    // 이미 같은 id 항목 있으면 수량만 증가
    const idx = cart.items.findIndex(x => x.id === item.id && x.optionKey === optionKey);

    if (idx >= 0) {
      cart.items[idx].qty += qty;
    } else {

    cart.items.push({
      id: item.id,
      name: item.name,
      price: currentUnitPrice,
      qty,
    
      // 🔹 데이터용 (관리자 / DB 대비)
      options: selectedOptions,
    
      // 🔥 화면 표시 & API 전송용
      optionText,
    
      optionKey
    });


    }

    cart.render();
    hideMenuModal();
  };
  updateAddButtonState();
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
        ${hasOptions
  ? `<div style="font-size:11px;color:#22c55e">옵션 선택 가능</div>`
  : ''
}

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
        row.innerHTML = `
  <div>
    <div>${it.name} x ${it.qty}</div>
    ${
      Array.isArray(it.optionText) && it.optionText.length
        ? `<div class="small" style="color:#9ca3af">
            ${it.optionText.map(t => `- ${t}`).join('<br>')}
           </div>`
        : ''
    }

  </div>
  <div>${fmt(Number(it.price || 0) * Number(it.qty || 1))}원</div>
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
    }
  };
  return cart;
}
