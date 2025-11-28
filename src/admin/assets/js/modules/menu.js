// /src/admin/assets/js/modules/menu.js
// 다점포용 메뉴 관리: admin.menuByStore[storeId] 를 매장별 메뉴로 사용
// 없으면 admin.menu(공용 템플릿) 또는 샘플에서 복사해서 초기화
// 필드: id, name, price, active, soldOut, img, desc

import { get, patch } from './store.js';

// 샘플 기본 메뉴 (공용 템플릿이 아예 없을 때만 사용)
const SAMPLE_MENU = [
  { id: 'A1', name: '아메리카노', price: 3000, active: true },
  { id: 'A2', name: '라떼',       price: 4000, active: true },
  { id: 'B1', name: '크로와상',   price: 3500, active: true },
];

// 현재 storeId 가져오기
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

// 매장별 메뉴 경로
const PER_STORE_PATH = () => ['admin', 'menuByStore', currentStoreId()];

// 공용 템플릿 경로 (예: '카페 기본 메뉴')
const TEMPLATE_PATH   = ['admin', 'menu'];

// DOM 헬퍼
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

// 메뉴 정렬: active 우선, id 기준
function sortMenu(list) {
  return [...list].sort((a, b) => {
    if (!!a.active !== !!b.active) {
      return a.active ? -1 : 1;
    }
    return (a.id || '').localeCompare(b.id || '');
  });
}

// 현재 매장 메뉴 불러오기 (없으면 공용/샘플에서 복사)
function loadCurrentStoreMenu() {
  const storeMenu = get(PER_STORE_PATH());
  if (Array.isArray(storeMenu) && storeMenu.length > 0) {
    return sortMenu(storeMenu);
  }

  const template = get(TEMPLATE_PATH);
  if (Array.isArray(template) && template.length > 0) {
    return sortMenu(template);
  }

  return SAMPLE_MENU.slice();
}

function saveCurrentStoreMenu(menu) {
  const sorted = sortMenu(Array.isArray(menu) ? menu : []);
  patch(PER_STORE_PATH(), () => sorted);
}

// 행 렌더링
function createRow(item) {
  const tr = document.createElement('tr');
  tr.dataset.id = item.id || '';

  const tdId = document.createElement('td');
  tdId.textContent = item.id || '';
  tdId.className = 'text-center';

  const tdName = document.createElement('td');
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.value = item.name || '';
  nameInput.className = 'menu-name-input';
  tdName.appendChild(nameInput);

  const tdPrice = document.createElement('td');
  const priceInput = document.createElement('input');
  priceInput.type = 'number';
  priceInput.min = '0';
  priceInput.value = item.price || 0;
  priceInput.className = 'menu-price-input';
  tdPrice.appendChild(priceInput);

  const tdActive = document.createElement('td');
  tdActive.className = 'text-center';
  const activeCheckbox = document.createElement('input');
  activeCheckbox.type = 'checkbox';
  activeCheckbox.checked = item.active !== false;
  tdActive.appendChild(activeCheckbox);

  const tdSoldOut = document.createElement('td');
  tdSoldOut.className = 'text-center';
  const soldOutCheckbox = document.createElement('input');
  soldOutCheckbox.type = 'checkbox';
  soldOutCheckbox.checked = !!item.soldOut;
  tdSoldOut.appendChild(soldOutCheckbox);

  const tdActions = document.createElement('td');
  tdActions.className = 'text-center';
  const btnDelete = document.createElement('button');
  btnDelete.textContent = '삭제';
  btnDelete.className = 'btn btn-sm btn-danger';
  tdActions.appendChild(btnDelete);

  tr.appendChild(tdId);
  tr.appendChild(tdName);
  tr.appendChild(tdPrice);
  tr.appendChild(tdActive);
  tr.appendChild(tdSoldOut);
  tr.appendChild(tdActions);

  btnDelete.addEventListener('click', () => {
    const ok = confirm(`메뉴 "${item.name}" 를 삭제할까요?`);
    if (!ok) return;

    const tbody = $('#tbody-menu');
    if (!tbody) return;
    const id = tr.dataset.id;
    const list = loadCurrentStoreMenu().filter((m) => m.id !== id);
    saveCurrentStoreMenu(list);
    renderMenu();
  });

  return tr;
}

// 메뉴 전체 렌더
export function renderMenu() {
  const tbody = $('#tbody-menu');
  if (!tbody) return;

  const list = loadCurrentStoreMenu();
  tbody.innerHTML = '';

  if (!list.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 6;
    td.className = 'text-center text-muted';
    td.textContent = '메뉴가 없습니다. "행 추가" 버튼으로 메뉴를 추가하세요.';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  list.forEach((item) => {
    tbody.appendChild(createRow(item));
  });
}

// 이벤트 바인딩
export function bindMenu() {
  const btnAdd = document.getElementById('btn-menu-add');
  const btnSave = document.getElementById('btn-menu-save');
  const btnCopyFromTemplate = document.getElementById(
    'btn-menu-copy-from-template'
  );
  const btnSaveAsTemplate = document.getElementById(
    'btn-menu-save-as-template'
  );

  if (btnAdd) {
    btnAdd.addEventListener('click', () => {
      const tbody = $('#tbody-menu');
      if (!tbody) return;

      const list = loadCurrentStoreMenu();
      let maxIndex = 0;
      list.forEach((item) => {
        const m = /^M(\d+)$/.exec(item.id || '');
        if (m) {
          const v = parseInt(m[1], 10);
          if (v > maxIndex) maxIndex = v;
        }
      });
      const nextId = `M${String(maxIndex + 1).padStart(2, '0')}`;

      const newItem = {
        id: nextId,
        name: '',
        price: 0,
        active: true,
        soldOut: false,
      };

      const newList = [...list, newItem];
      saveCurrentStoreMenu(newList);
      renderMenu();
    });
  }

  if (btnSave) {
    btnSave.addEventListener('click', () => {
      const tbody = $('#tbody-menu');
      if (!tbody) return;

      const rows = Array.from(tbody.querySelectorAll('tr'));
      const next = [];

      for (const tr of rows) {
        const id = tr.dataset.id || '';
        if (!id) continue;

        const nameInput = tr.querySelector('.menu-name-input');
        const priceInput = tr.querySelector('.menu-price-input');
        const activeCheckbox = tr.querySelector('input[type="checkbox"]:nth-of-type(1)');
        const soldOutCheckbox = tr.querySelector('input[type="checkbox"]:nth-of-type(2)');

        const name = (nameInput && nameInput.value.trim()) || '';
        const price = priceInput ? Number(priceInput.value || 0) : 0;
        const active = activeCheckbox ? activeCheckbox.checked : true;
        const soldOut = soldOutCheckbox ? soldOutCheckbox.checked : false;

        next.push({
          id,
          name,
          price,
          active,
          soldOut,
        });
      }

      saveCurrentStoreMenu(next);
      alert('메뉴가 저장되었습니다.');
      renderMenu();
    });
  }

  if (btnCopyFromTemplate) {
    btnCopyFromTemplate.addEventListener('click', () => {
      const template = get(TEMPLATE_PATH);
      if (!Array.isArray(template) || !template.length) {
        alert('공용 템플릿이 없습니다.');
        return;
      }

      const ok = confirm(
        '공용 템플릿 메뉴를 이 매장 메뉴로 복사할까요?\n(기존 매장 메뉴는 덮어쓰기됩니다.)'
      );
      if (!ok) return;

      saveCurrentStoreMenu(template);
      renderMenu();
    });
  }

  if (btnSaveAsTemplate) {
    btnSaveAsTemplate.addEventListener('click', () => {
      const list = loadCurrentStoreMenu();
      if (!list.length) {
        alert('현재 매장 메뉴가 없습니다.');
        return;
      }

      const ok = confirm(
        '현재 매장 메뉴를 공용 템플릿으로 저장할까요?\n(기존 공용 템플릿은 덮어쓰기됩니다.)'
      );
      if (!ok) return;

      patch(TEMPLATE_PATH, () => sortMenu(list));
      alert('공용 템플릿이 저장되었습니다.\n다른 매장에서 "공용 템플릿 복사" 버튼으로 불러올 수 있습니다.');
    });
  }
}
