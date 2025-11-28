import { ensureStoreInitialized } from './store.js';
// /src/admin/assets/js/modules/menu.js
// 매장별 메뉴 관리 (admin.menuByStore[storeId])
// 필드: id, name, price, active, soldOut, img, desc

import { get, patch } from './store.js';

// 기본 샘플 (어디에도 메뉴가 없을 때만 1회 사용)
const SAMPLE_MENU = [
  { id: 'A1', name: '아메리카노', price: 3000, active: true, soldOut: false },
  { id: 'A2', name: '카페라떼',   price: 4000, active: true, soldOut: false },
  { id: 'B1', name: '크로와상',   price: 3500, active: true, soldOut: false },
];

// 현재 매장 ID
function currentStoreId() {
  if (window.qrnrStoreId) return window.qrnrStoreId;

  try {
    const saved = localStorage.getItem('qrnr.storeId');
    if (saved) return saved;
  } catch (e) {
    console.error('[menu] currentStoreId localStorage error', e);
  }

  return 'store1';
}

// "이 매장의 메뉴"가 저장되는 경로
const PER_STORE_PATH = () => ['admin', 'menuByStore', currentStoreId()];

/**
 * 현재 매장의 메뉴 배열을 로드.
 *
 * 1) admin.menuByStore[storeId] 가 있으면 그대로 사용
 * 2) 없으면:
 *    - admin.menu (구버전 공용 메뉴)가 있으면 복사
 *    - 그것도 없으면 SAMPLE_MENU 복사
 *    그리고 admin.menuByStore[storeId] 에 저장 후 반환
 */
function loadMenuForAdmin() {
  const storeId = currentStoreId(); ensureStoreInitialized(storeId);
  const storeId = currentStoreId();
  console.log('[menu] loadMenuForAdmin storeId =', storeId);

  const perStore = get(['admin', 'menuByStore', storeId]);
  if (Array.isArray(perStore)) return perStore;

  const common = get(['admin', 'menu']);
  const base =
    Array.isArray(common) && common.length ? common : SAMPLE_MENU;

  const cloned = base.map((m) => ({ ...m }));
  patch(['admin', 'menuByStore', storeId], () => cloned);
  return cloned;
}

// ─────────────────────────────
// 렌더링
// ─────────────────────────────
export function renderMenu() {
  const menu = loadMenuForAdmin();
  const body = document.getElementById('menu-body');
  if (!body) return;

  console.log(
    '[menu] renderMenu storeId =',
    currentStoreId(),
    'items =',
    menu.length
  );

  body.innerHTML = '';

  if (!menu.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 5;
    td.className = 'small text-muted text-center';
    td.textContent = '등록된 메뉴가 없습니다.';
    tr.appendChild(td);
    body.appendChild(tr);
    return;
  }

  menu.forEach((m, idx) => {
    const tr = document.createElement('tr');
    const active = m.active !== false;
    const soldOut = !!m.soldOut;

    tr.innerHTML = `
      <td>${m.id}</td>
      <td><input class="input" value="${m.name || ''}" data-k="name"></td>
      <td><input class="input" type="number" min="0" value="${m.price || 0}" data-k="price"></td>
      <td style="min-width:160px">
        <label class="small" style="display:block;margin-bottom:4px">
          <input type="checkbox" ${active ? 'checked' : ''} data-k="active">
          판매중(표시)
        </label>
        <label class="small" style="display:block">
          <input type="checkbox" ${soldOut ? 'checked' : ''} data-k="soldOut">
          일시품절
        </label>
      </td>
      <td class="right">
        <button class="btn small" data-act="detail">상세</button>
        <button class="btn small danger" data-act="del">삭제</button>
      </td>
    `;

    // 값 변경 핸들러
    const inputs = tr.querySelectorAll('input[data-k]');
    inputs.forEach((input) => {
      input.addEventListener('change', () => {
        const arr = loadMenuForAdmin().slice();
        const target = { ...(arr[idx] || {}) };
        const k = input.dataset.k;

        let v =
          input.type === 'checkbox' ? input.checked : input.value;
        if (k === 'price') {
          v = Number(v || 0);
        }

        target[k] = v;
        arr[idx] = target;

        patch(PER_STORE_PATH(), () => arr);
        renderMenu();
      });
    });

    // 상세/삭제 버튼
    const detailBtn = tr.querySelector('button[data-act="detail"]');
    const delBtn    = tr.querySelector('button[data-act="del"]');

    if (detailBtn) {
      detailBtn.onclick = () => {
        const arr = loadMenuForAdmin().slice();
        const target = { ...(arr[idx] || {}) };

        const curImg  = target.img || '';
        const curDesc = target.desc || '';

        const newImg = window.prompt(
          '이미지 URL (선택 입력)',
          curImg
        );
        if (newImg !== null) {
          target.img = newImg.trim();
        }

        const newDesc = window.prompt(
          '메뉴 설명 (선택, 여러 줄 가능)',
          curDesc
        );
        if (newDesc !== null) {
          target.desc = newDesc.trim();
        }

        arr[idx] = target;
        patch(PER_STORE_PATH(), () => arr);
        renderMenu();
      };
    }

    if (delBtn) {
      delBtn.onclick = () => {
        const ok = confirm('이 메뉴를 삭제할까요?');
        if (!ok) return;

        const arr = loadMenuForAdmin().slice();
        arr.splice(idx, 1);
        patch(PER_STORE_PATH(), () => arr);
        renderMenu();
      };
    }

    body.appendChild(tr);
  });
}

// ─────────────────────────────
// 버튼 바인딩 (메뉴 추가)
// ─────────────────────────────
export function bindMenu() {
  const addBtn = document.getElementById('menu-add');
  if (!addBtn) return;

  addBtn.onclick = () => {
    const idInput    = document.getElementById('m-id');
    const nameInput  = document.getElementById('m-name');
    const priceInput = document.getElementById('m-price');

    const id    = (idInput?.value || '').trim();
    const name  = (nameInput?.value || '').trim();
    const price = Number(priceInput?.value || 0);

    if (!id || !name) {
      alert('메뉴 ID와 이름은 필수입니다.');
      return;
    }

    const arr = loadMenuForAdmin().slice();
    const exists = arr.some((m) => m.id === id);
    if (exists) {
      alert('이미 존재하는 ID입니다.');
      return;
    }

    arr.push({
      id,
      name,
      price,
      active: true,
      soldOut: false,
    });

    patch(PER_STORE_PATH(), () => arr);

    if (idInput)    idInput.value = '';
    if (nameInput)  nameInput.value = '';
    if (priceInput) priceInput.value = '';

    renderMenu();
  };
}
