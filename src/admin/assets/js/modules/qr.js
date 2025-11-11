import { patch, get } from './store.js';

const $ = (s, r = document) => r.querySelector(s);

// ===== 매장 식별 =====
function currentStoreId() {
  // admin.js에서 세팅한 값(use) 우선
  if (window.qrnrStoreId) return window.qrnrStoreId;

  // 혹시 누락됐으면 URL에서 store 파라미터 사용
  try {
    const u = new URL(location.href);
    return u.searchParams.get('store') || 'store1';
  } catch (e) {
    return 'store1';
  }
}

// 매장별 QR 저장 위치: ['admin', 'qrList', storeId]
function storePath() {
  return ['admin', 'qrList', currentStoreId()];
}

// 현재 매장의 리스트가 배열 형태인지 보장
function ensureList() {
  const cur = get(storePath());
  if (Array.isArray(cur)) return cur;
  patch(storePath(), () => []);
  return [];
}

// ===== QR 코드 생성 (qrcodejs) =====
function makeQRDataUrl(text) {
  return new Promise((resolve, reject) => {
    try {
      if (!window.QRCode) {
        return reject(new Error('QRCode 전역 객체가 없습니다.'));
      }

      const wrap = document.createElement('div');
      wrap.style.position = 'fixed';
      wrap.style.left = '-9999px';
      wrap.style.top = '-9999px';
      document.body.appendChild(wrap);

      const qr = new QRCode(wrap, {
        text,
        width: 256,
        height: 256,
        correctLevel: QRCode.CorrectLevel.H,
      });

      setTimeout(() => {
        try {
          const canvas = wrap.querySelector('canvas');
          if (!canvas) throw new Error('QR 캔버스를 찾을 수 없습니다.');
          const dataUrl = canvas.toDataURL('image/png');
          document.body.removeChild(wrap);
          resolve(dataUrl);
        } catch (e) {
          document.body.removeChild(wrap);
          reject(e);
        }
      }, 0);
    } catch (e) {
      reject(e);
    }
  });
}

// ===== 초기화 =====
export function initQR() {
  const tableInput = $('#qr-table');
  const labelInput = $('#qr-label');
  const genBtn = $('#qr-generate');
  const clearBtn = $('#qr-clear');
  const grid = $('#qr-grid');

  if (!grid || !tableInput || !genBtn) return;

  ensureList();
  renderList();

  // QR 생성 & 저장
  genBtn.addEventListener('click', async () => {
    const storeId = currentStoreId();
    const table = (tableInput.value || '').trim();
    const label = (labelInput.value || '').trim() || `${table}번 테이블`;

    if (!table) {
      alert('테이블 번호를 입력하세요.');
      tableInput.focus();
      return;
    }

    // 매장별 매장주문 URL
    const url =
      `${location.origin}/order/store` +
      `?store=${encodeURIComponent(storeId)}` +
      `&table=${encodeURIComponent(table)}`;

    try {
      const dataUrl = await makeQRDataUrl(url);

      const item = {
        id: `QR-${Date.now()}-${table}`,
        storeId,
        table,
        label,
        url,
        dataUrl,
      };

      // 현재 매장 리스트에만 저장 (같은 테이블 번호면 교체)
      patch(storePath(), (list) => {
        list = Array.isArray(list) ? list : [];
        const filtered = list.filter((x) => x.table !== table);
        return [...filtered, item];
      });

      renderList();
    } catch (e) {
      console.error(e);
      alert('QR 생성 중 오류가 발생했습니다.');
    }
  });

  // 현재 매장 QR 전체 삭제
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (!confirm('이 매장의 저장된 QR을 모두 삭제할까요?')) return;
      patch(storePath(), () => []);
      renderList();
    });
  }

  // ===== 리스트 렌더 =====
  function renderList() {
    const grid = $('#qr-grid');
    if (!grid) return;

    const list = get(storePath()) || [];

    grid.innerHTML = '';

    if (!list.length) {
      grid.innerHTML = '<div class="small">저장된 QR이 없습니다.</div>';
      return;
    }

    list.forEach((q) => {
      const wrap = document.createElement('div');
      wrap.className = 'vstack';
      wrap.style.gap = '4px';
      wrap.style.alignItems = 'center';
      wrap.style.border = '1px solid #263241';
      wrap.style.padding = '8px';
      wrap.style.borderRadius = '10px';
      wrap.style.background = '#0b1620';

      const img = document.createElement('img');
      img.src = q.dataUrl;
      img.alt = q.label;
      img.style.width = '140px';
      img.style.height = '140px';

      const labelDiv = document.createElement('div');
      labelDiv.className = 'small';
      labelDiv.textContent = `${q.label} (테이블 ${q.table})`;

      const urlDiv = document.createElement('div');
      urlDiv.className = 'small';
      urlDiv.style.wordBreak = 'break-all';
      urlDiv.textContent = q.url;

      const btnRow = document.createElement('div');
      btnRow.className = 'hstack';
      btnRow.style.gap = '4px';

      const down = document.createElement('a');
      down.textContent = '다운로드';
      down.href = q.dataUrl;
      down.download = `table-${q.table}.png`;
      down.className = 'btn small';

      const del = document.createElement('button');
      del.textContent = '삭제';
      del.className = 'btn small';
      del.onclick = () => {
        patch(storePath(), (list) =>
          (list || []).filter((x) => x.id !== q.id)
        );
        renderList();
      };

      btnRow.appendChild(down);
      btnRow.appendChild(del);

      wrap.appendChild(img);
      wrap.appendChild(labelDiv);
      wrap.appendChild(urlDiv);
      wrap.appendChild(btnRow);

      grid.appendChild(wrap);
    });
  }
}
