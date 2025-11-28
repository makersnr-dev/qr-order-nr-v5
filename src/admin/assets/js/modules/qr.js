// /src/admin/assets/js/modules/qr.js
import { patch, get } from './store.js';

const $ = (s, r = document) => r.querySelector(s);

// ===== 매장 식별 =====
function currentStoreId() {
  // admin.js에서 설정한 값 우선
  if (window.qrnrStoreId) return window.qrnrStoreId;
  // URL 파라미터는 신뢰하지 않는다 (보안상)
  return 'store1';
}

// 공통 저장 위치 : ['admin', 'qrList']
//  - key: storeId
//  - value: 해당 매장의 QR 리스트 배열
const ROOT_PATH = ['admin', 'qrList'];

function loadAll() {
  return get(ROOT_PATH) || {};
}

function saveAll(updater) {
  patch(ROOT_PATH, (cur) => {
    const base = cur && typeof cur === 'object' ? cur : {};
    return updater(base) || base;
  });
}

function currentList() {
  const storeId = currentStoreId();
  const all = loadAll();
  const arr = Array.isArray(all[storeId]) ? all[storeId] : [];
  return { storeId, list: arr };
}

export function initQR() {
  const tbody = $('#tbody-qr');
  const addBtn = $('#qr-add');
  const resetBtn = $('#qr-reset');
  const storeLabel = $('#qr-store-label');

  const { storeId, list } = currentList();
  if (storeLabel) {
    storeLabel.textContent = storeId;
  }

  if (!tbody) return;
  tbody.innerHTML = '';

  if (!list.length) {
    const tr = document.createElement('tr');
    tr.innerHTML =
      '<td colspan="4" class="small text-muted">등록된 QR 없음</td>';
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
      const name = (document.getElementById('qr-name')?.value || '').trim();
      const mode = document.getElementById('qr-mode')?.value || 'table';
      const value = (document.getElementById('qr-value')?.value || '').trim();

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

// (필요하다면 openPreview 구현은 기존 파일 내용 그대로 사용)
function openPreview(q) {
  const storeId = currentStoreId();

  let url = '/order/select';
  const u = new URL(url, location.origin);
  u.searchParams.set('store', storeId);

  if (q.mode === 'table' && q.value) {
    u.searchParams.set('table', q.value);
  }

  window.open(u.toString(), '_blank');
}
