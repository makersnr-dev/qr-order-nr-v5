// /src/admin/assets/js/modules/qr.js
// 매장별 QR 리스트 관리: admin.qrList[storeId] = [{ name, mode, value }, ...]

import { get, patch } from './store.js';

const $ = (s, r = document) => r.querySelector(s);

// 현재 매장 ID (URL은 신뢰하지 않고, admin.js 에서 세팅한 값 사용)
function currentStoreId() {
  if (window.qrnrStoreId) return window.qrnrStoreId;

  try {
    const saved = localStorage.getItem('qrnr.storeId');
    if (saved) return saved;
  } catch (e) {
    console.error('[qr] currentStoreId localStorage error', e);
  }

  return 'store1';
}

// 전체 구조: { [storeId]: QR[] }
const ROOT_PATH = ['admin', 'qrList'];

function loadAll() {
  const all = get(ROOT_PATH);
  return all && typeof all === 'object' ? all : {};
}

function saveAll(updater) {
  patch(ROOT_PATH, (cur) => {
    const base = cur && typeof cur === 'object' ? cur : {};
    return updater(base) || base;
  });
}

// 현재 매장 QR 목록
function currentList() {
  const storeId = currentStoreId();
  const all = loadAll();
  const list = Array.isArray(all[storeId]) ? all[storeId] : [];
  return { storeId, list };
}

// ─────────────────────────────
// 렌더링 & 바인딩
// ─────────────────────────────
export function initQR() {
  const tbody       = $('#tbody-qr');
  const addBtn      = $('#qr-add');
  const resetBtn    = $('#qr-reset');
  const storeLabel  = $('#qr-store-label');

  if (!tbody) return;

  const { storeId, list } = currentList();
  console.log('[qr] initQR storeId =', storeId, 'items =', list.length);

  if (storeLabel) {
    storeLabel.textContent = storeId;
  }

  tbody.innerHTML = '';

  if (!list.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 4;
    td.className = 'small text-muted text-center';
    td.textContent = '등록된 QR이 없습니다.';
    tr.appendChild(td);
    tbody.appendChild(tr);
  } else {
    list.forEach((q, idx) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${q.name || ''}</td>
        <td>${q.mode || ''}</td>
        <td>${q.value || ''}</td>
        <td class="right">
          <button class="btn small" data-act="preview">미리보기</button>
          <button class="btn small danger" data-act="del">삭제</button>
        </td>
      `;
      tbody.appendChild(tr);

      const previewBtn = tr.querySelector('button[data-act="preview"]');
      const delBtn     = tr.querySelector('button[data-act="del"]');

      if (previewBtn) {
        previewBtn.onclick = () => openPreview(q);
      }
      if (delBtn) {
        delBtn.onclick = () => {
          const ok = confirm('이 QR을 삭제할까요?');
          if (!ok) return;

          saveAll((all) => {
            const arr = Array.isArray(all[storeId]) ? [...all[storeId]] : [];
            arr.splice(idx, 1);
            return { ...all, [storeId]: arr };
          });

          initQR();
        };
      }
    });
  }

  if (addBtn) {
    addBtn.onclick = () => {
      const nameInput  = document.getElementById('qr-name');
      const modeSelect = document.getElementById('qr-mode');
      const valueInput = document.getElementById('qr-value');

      const name  = (nameInput?.value || '').trim();
      const mode  = modeSelect?.value || 'table';
      const value = (valueInput?.value || '').trim();

      if (!name || !value) {
        alert('QR 이름과 값은 필수입니다.');
        return;
      }

      const { storeId, list } = currentList();
      const nextList = [...list, { name, mode, value }];

      saveAll((all) => ({ ...all, [storeId]: nextList }));
      initQR();
    };
  }

  if (resetBtn) {
    resetBtn.onclick = () => {
      const ok = confirm('이 매장의 QR 리스트를 모두 삭제할까요?');
      if (!ok) return;

      const { storeId } = currentList();
      saveAll((all) => {
        const next = { ...all };
        delete next[storeId];
        return next;
      });
      initQR();
    };
  }
}

// ─────────────────────────────
// 미리보기: 현재 매장 + 옵션으로 URL 열기
// ─────────────────────────────
function openPreview(q) {
  const storeId = currentStoreId();

  // 기본 주문 선택 페이지
  const u = new URL('/order/select', location.origin);
  u.searchParams.set('store', storeId);

  if (q.mode === 'table' && q.value) {
    u.searchParams.set('table', q.value);
  }

  window.open(u.toString(), '_blank');
}
