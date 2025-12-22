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
    const u = new URL(location.href);
    return u.searchParams.get('store') || 'store1';
  } catch (e) {
    return 'store1';
  }
}

// 매장별 메뉴 경로
const PER_STORE_PATH = () => ['admin', 'menuByStore', currentStoreId()];

/**
 * 관리자에서 사용할 "현재 매장의 메뉴" 로딩 규칙
 *
 * 1) admin.menuByStore[storeId] 가 배열이면 그대로 사용 (빈 배열도 허용)
 * 2) 아니면 한 번만 초기화:
 *    - admin.menu (공용 템플릿)이 있으면 그걸 복사
 *    - 없으면 SAMPLE_MENU 복사
 *    그리고 복사본을 admin.menuByStore[storeId]에 저장
 */
function loadMenuForAdmin() {
  const storeId = currentStoreId();

  const perStore = get(['admin', 'menuByStore', storeId]);
  if (Array.isArray(perStore)) return perStore;

  const global = get(['admin', 'menu']);
  let base = [];

  if (Array.isArray(global) && global.length) base = global;
  else base = SAMPLE_MENU;

  const cloned = base.map(m => ({ ...m }));
  patch(['admin', 'menuByStore', storeId], () => cloned);
  return cloned;
}

/**
 * 메뉴 관리 테이블 렌더링
 *
 * - 이름/가격/표시/일시품절 은 행 안에서 직접 수정
 * - "상세" 버튼으로 이미지 URL / 설명 수정 (prompt)
 */
export function renderMenu() {
  const menu = loadMenuForAdmin();
  const body = document.getElementById('m-body');
  if (!body) return;

  body.innerHTML = '';

  if (!menu.length) {
    body.innerHTML = '<tr><td colspan="5" class="small">메뉴 없음</td></tr>';
    return;
  }

  menu.forEach((m, idx) => {
    const tr = document.createElement('tr');
    const active = m.active !== false;
    const soldOut = !!m.soldOut;

   const category = m.category || '';

tr.innerHTML = `
  <td>${m.id}</td>
  <td><input class="input" value="${m.name || ''}" data-k="name"></td>
  <td><input class="input" type="number" value="${m.price || 0}" data-k="price"></td>
  <td><input class="input" value="${category}" data-k="category"></td>
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
    <button class="btn small" data-act="save">저장</button>
    <button class="btn small" data-act="del">삭제</button>
  </td>
`;

    body.appendChild(tr);

    const saveBtn   = tr.querySelector('[data-act="save"]');
    const delBtn    = tr.querySelector('[data-act="del"]');
    const detailBtn = tr.querySelector('[data-act="detail"]');

    // 💾 저장: 이름/가격/표시/일시품절
    if (saveBtn) {
      saveBtn.onclick = () => {
        const arr = loadMenuForAdmin().slice();
        const target = arr[idx] || { id: m.id };

        tr.querySelectorAll('input[data-k]').forEach((input) => {
          const k = input.getAttribute('data-k');
          if (k === 'active') {
            target.active = input.checked;
          } else if (k === 'soldOut') {
            target.soldOut = input.checked;
          } else if (k === 'price') {
            target.price = Number(input.value || 0);
          } else if (k === 'name') {
            target.name = input.value || '';
          }else if (k === 'category') {
    target.category = input.value || '';
  }
        });

        arr[idx] = target;
        patch(PER_STORE_PATH(), () => arr);
        renderMenu();
      };
    }

   // 📝 상세(이미지 / 설명 / 카테고리 / 옵션텍스트)
if (detailBtn) {
 detailBtn.onclick = () => {
  const arr = loadMenuForAdmin().slice();
  const target = arr[idx];

  openMenuDetailModal(target, () => {
    arr[idx] = target;
    patch(PER_STORE_PATH(), () => arr);
    renderMenu();
  });
};

}


    // 🗑 삭제
    if (delBtn) {
      delBtn.onclick = () => {
        if (!confirm('삭제할까요?')) return;
        const arr = loadMenuForAdmin().slice();
        arr.splice(idx, 1);
        patch(PER_STORE_PATH(), () => arr);
        renderMenu();
      };
    }
  });
}

// ==============================
// 엑셀 → 메뉴 JSON 변환 유틸
// ==============================

// 1) 엑셀 한 행(row)을 메뉴 객체로 변환
function convertRowToMenu(row) {
  const optText = String(row.options || '').trim();
  return {
    id: String(row.id || '').trim(),
    name: String(row.name || '').trim(),
    price: Number(row.price || 0),
    active: row.active === true || String(row.active).toUpperCase() === 'TRUE',
    soldOut: row.soldOut === true || String(row.soldOut).toUpperCase() === 'TRUE',
    category: (row.category || '').trim(),
    img: (row.img || '').trim(),
    desc: (row.desc || '').trim(),
    options: parseOptions(optText)
  };
}

// 2) options 컬럼 문자열을 옵션 스키마로 변환
// 예시: "사이즈:톨=0,그란데=500; 샷:1샷=500,2샷=1000"
function parseOptions(str) {
  if (!str || !String(str).trim()) return [];

  return String(str)
    .split(';')
    .map(s => s.trim())
    .filter(Boolean)
    .map((grp, gi) => {
      const [meta, itemsPart] = grp.split(':');
      if (!itemsPart) return null;

      // meta: 옵션명|type|required|min|max
      const [name, type, required, min, max] =
        meta.split('|').map(s => s.trim());

      const items = itemsPart
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
        .map((it, ii) => {
          const [label, price] = it.split('=');
          return {
            id: `g${gi}_i${ii}`,
            label: (label || '').trim(),
            price: Number(price || 0),
          };
        });

      return {
        id: `grp${gi}`,
        name,
        type: type === 'multi' ? 'multi' : 'single',
        required: required === '1' || required === 'true',
        min: Number(min || 0),
        max: max ? Number(max) : undefined,
        items,
      };
    })
    .filter(Boolean);
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

// ==============================
// 엑셀 메뉴 업로드 기능
// ==============================
function bindExcelUpload() {
  const fileInput = document.getElementById('menu-excel');
  const uploadBtn = document.getElementById('menu-excel-upload');
  if (!fileInput || !uploadBtn) return;

  uploadBtn.onclick = () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) {
      alert('엑셀(.xlsx) 파일을 먼저 선택하세요.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet); // 1행은 헤더로 인식

        if (!rows.length) {
          alert('엑셀에 데이터가 없습니다.');
          return;
        }

        // 엑셀 → 메뉴 배열로 변환
        const newMenu = rows.map(convertRowToMenu).filter(m => m.id && m.name);

        if (!newMenu.length) {
          alert('유효한 메뉴 데이터가 없습니다. id, name 은 필수입니다.');
          return;
        }

        const current = loadMenuForAdmin().slice();
        const merged = mergeMenu(current, newMenu);

        patch(PER_STORE_PATH(), () => merged);
        renderMenu();
        alert(`엑셀 업로드 완료! (총 ${newMenu.length}개 행 반영)`);
      } catch (err) {
        console.error('엑셀 파싱 오류:', err);
        alert('엑셀 파일을 읽는 중 오류가 발생했습니다.');
      }
    };

    reader.readAsArrayBuffer(file);
  };
}


/**
 * 상단 "추가" 버튼 바인딩
 * - ID / 이름 / 가격만 입력 → 나머지 필드는 기본값으로
 */
export function bindMenu() {
  const addBtn = document.getElementById('m-add');
  if (!addBtn) return;

  addBtn.onclick = () => {
    const idEl    = document.getElementById('m-id');
    const nameEl  = document.getElementById('m-name');
    const priceEl = document.getElementById('m-price');

    const id    = (idEl?.value || '').trim();
    const name  = (nameEl?.value || '').trim();
    const price = Number((priceEl?.value || '').trim() || 0);

    if (!id || !name || !price) {
      alert('ID, 이름, 가격을 모두 입력하세요.');
      return;
    }

    const arr = loadMenuForAdmin().slice();
    const existingIdx = arr.findIndex((it) => it.id === id);

    if (existingIdx >= 0) {
      if (!confirm('이미 존재하는 ID입니다. 덮어쓸까요?')) return;
      arr[existingIdx] = {
        ...arr[existingIdx],
        id,
        name,
        price,
        active: true,
        soldOut: !!arr[existingIdx].soldOut,
      };
    } else {
      arr.push({
        id,
        name,
        price,
        active: true,
        soldOut: false,
      });
    }

    patch(PER_STORE_PATH(), () => arr);

    ['m-id', 'm-name', 'm-price'].forEach((fieldId) => {
      const el = document.getElementById(fieldId);
      if (el) el.value = '';
    });

    renderMenu();
  };
  bindExcelUpload();
}


function ensureMenuDetailModal() {
  if (document.getElementById('menu-detail-modal')) return;

  const modal = document.createElement('div');
  modal.id = 'menu-detail-modal';
  modal.style.cssText = `
    position:fixed;
    inset:0;
    background:rgba(0,0,0,.55);
    display:none;
    align-items:center;
    justify-content:center;
    z-index:9999;
    padding:16px;
  `;

  modal.innerHTML = `
    <div style="
      width:900px;
      max-width:100%;
      max-height:90vh;
      overflow:auto;
      background:#fff;
      border-radius:14px;
      padding:20px;
      display:flex;
      flex-direction:column;
      gap:18px
    ">
      <h3 style="margin:0">메뉴 상세 설정</h3>

      <!-- 기본 정보 -->
      <section>
        <div class="small" style="margin-bottom:6px">이미지 URL</div>
        <input id="md-img" class="input" placeholder="https://..." style="width:100%">
      </section>

      <section>
        <div class="small" style="margin-bottom:6px">카테고리</div>
        <input id="md-category" class="input" placeholder="예: 커피 / 디저트" style="width:100%">
      </section>

      <section>
        <div class="small" style="margin-bottom:6px">메뉴 설명</div>
        <textarea
          id="md-desc"
          class="input"
          style="width:100%; min-height:90px; white-space:pre-wrap"
          placeholder="메뉴에 대한 설명을 입력하세요"
        ></textarea>
      </section>

      <hr>

      <!-- 옵션 관리 -->
      <section>
        <h4 style="margin:0 0 10px">옵션 관리</h4>
        <div id="md-opt-groups" style="display:flex; flex-direction:column; gap:14px"></div>
        <button
          id="md-opt-add-group"
          class="btn small"
          type="button"
          style="margin-top:10px"
        >
          옵션 그룹 추가
        </button>
      </section>

      <div class="hstack" style="justify-content:flex-end; gap:8px">
        <button id="md-cancel" class="btn" type="button">취소</button>
        <button id="md-save" class="btn primary" type="button">저장</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.style.display = 'none';
  });
}


function renderOptionGroups(groups, mountEl) {
  if (!mountEl) return;

  groups.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  mountEl.innerHTML = '';

  groups.forEach((g, gi) => {
    if (!Array.isArray(g.items)) g.items = [];

    const groupBox = document.createElement('div');
    groupBox.style.cssText = `
      border:1px solid #ddd;
      border-radius:12px;
      padding:12px;
      display:flex;
      flex-direction:column;
      gap:10px;
      background:#fafafa
    `;

    /* 그룹 헤더 */
    groupBox.innerHTML = `
      <div class="hstack" style="gap:8px; flex-wrap:wrap">
        <button class="btn xs" data-act="up">↑</button>
        <button class="btn xs" data-act="down">↓</button>

        <input class="input" data-k="name" placeholder="옵션 그룹명"
          value="${g.name || ''}" style="min-width:180px">

        <select class="input" data-k="type" style="width:110px">
          <option value="single" ${g.type === 'single' ? 'selected' : ''}>단일</option>
          <option value="multi" ${g.type === 'multi' ? 'selected' : ''}>복수</option>
        </select>

        <label class="small hstack" style="gap:4px">
          <input type="checkbox" data-k="required" ${g.required ? 'checked' : ''}>
          필수
        </label>

        <input class="input" data-k="min" type="number" placeholder="min"
          value="${g.min ?? ''}" style="width:70px">
        <input class="input" data-k="max" type="number" placeholder="max"
          value="${g.max ?? ''}" style="width:70px">

        <button class="btn xs danger" data-act="del-group">그룹 삭제</button>
      </div>

      <div class="opt-items" style="display:flex; flex-direction:column; gap:6px"></div>

      <button class="btn xs" data-act="add-item" type="button">
        + 옵션 항목 추가
      </button>
    `;

    /* 순서 이동 */
    groupBox.querySelector('[data-act="up"]').onclick = () => {
      if (gi === 0) return;
      [groups[gi - 1], groups[gi]] = [groups[gi], groups[gi - 1]];
      groups.forEach((x, i) => x.order = i + 1);
      renderOptionGroups(groups, mountEl);
    };

    groupBox.querySelector('[data-act="down"]').onclick = () => {
      if (gi === groups.length - 1) return;
      [groups[gi], groups[gi + 1]] = [groups[gi + 1], groups[gi]];
      groups.forEach((x, i) => x.order = i + 1);
      renderOptionGroups(groups, mountEl);
    };

    /* 그룹 값 반영 */
    groupBox.querySelectorAll('[data-k]').forEach(el => {
      const k = el.dataset.k;
      el.oninput = () => {
        if (k === 'required') g.required = el.checked;
        else if (k === 'min') g.min = el.value === '' ? undefined : Number(el.value);
        else if (k === 'max') g.max = el.value === '' ? undefined : Number(el.value);
        else g[k] = el.value;
      };
    });

    groupBox.querySelector('[data-act="del-group"]').onclick = () => {
      groups.splice(gi, 1);
      renderOptionGroups(groups, mountEl);
    };

    /* 옵션 항목 */
    const itemsBox = groupBox.querySelector('.opt-items');

    g.items.forEach((it, ii) => {
      const row = document.createElement('div');
      row.className = 'hstack';
      row.style.cssText = 'gap:8px; flex-wrap:wrap';

      row.innerHTML = `
        <input class="input" placeholder="옵션명"
          value="${it.label || ''}" style="min-width:200px">

        <input class="input" type="number"
          value="${Number(it.price || 0)}" style="width:100px">

        <button class="btn xs danger">삭제</button>
      `;

      row.children[0].oninput = e => it.label = e.target.value;
      row.children[1].oninput = e => it.price = Number(e.target.value || 0);
      row.children[2].onclick = () => {
        g.items.splice(ii, 1);
        renderOptionGroups(groups, mountEl);
      };

      itemsBox.appendChild(row);
    });

    groupBox.querySelector('[data-act="add-item"]').onclick = () => {
      g.items.push({
        id: crypto.randomUUID(),
        label: '',
        price: 0,
        order: g.items.length + 1
      });
      renderOptionGroups(groups, mountEl);
    };

    mountEl.appendChild(groupBox);
  });
}





function openMenuDetailModal(target, onSave) {
  if (!target) return;

  ensureMenuDetailModal();

  const modal = document.getElementById('menu-detail-modal');
  const imgEl = document.getElementById('md-img');
  const descEl = document.getElementById('md-desc');
  const catEl = document.getElementById('md-category');
  const groupsMount = document.getElementById('md-opt-groups');

  const addGroupBtn = document.getElementById('md-opt-add-group');
  const saveBtn = document.getElementById('md-save');
  const cancelBtn = document.getElementById('md-cancel');

  // 값 채우기
  imgEl.value = target.img || '';
  descEl.value = target.desc || '';
  catEl.value = target.category || '';

  // 옵션 그룹 복사본(모달에서 편집하다 취소하면 원본 유지)
  let optionGroups = Array.isArray(target.options)
    ? JSON.parse(JSON.stringify(target.options))
    : [];

  // 옵션 렌더
  renderOptionGroups(optionGroups, groupsMount);

  // 그룹 추가
  addGroupBtn.onclick = () => {
    optionGroups.push({
      id: crypto.randomUUID(),
      name: '',
      type: 'single',
      required: false,
      min: undefined,
      max: undefined,
      order: optionGroups.length + 1,
      items: []
    });

    renderOptionGroups(optionGroups, groupsMount);
  };

  // 취소
  cancelBtn.onclick = () => {
    modal.style.display = 'none';
  };

  // 저장
  saveBtn.onclick = () => {
    target.img = imgEl.value.trim();
    target.desc = descEl.value.trim();
    target.category = catEl.value.trim();

    // 옵션 최종 정리(빈 그룹/빈 항목 제거)
    const cleaned = (optionGroups || [])
      .map((g, gi) => ({
        ...g,
        order: g.order ?? gi + 1,
        name: String(g.name || '').trim(),
        items: (g.items || [])
          .map((it, ii) => ({
            ...it,
            order: it.order ?? ii + 1
          }))
          .filter(it => String(it.label || '').trim())
      }))

      .filter(g => g.name && g.items && g.items.length);

    target.options = cleaned;

    modal.style.display = 'none';
    onSave && onSave();
  };

  modal.style.display = 'flex';
}



