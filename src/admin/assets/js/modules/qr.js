import { patch, get } from './store.js';

// 기본 베이스 키
const BASE_PATH = ['admin', 'qrList'];

// 현재 관리자 페이지의 매장 ID
function currentStoreId() {
  // admin.js에서 window.qrnrStoreId 를 세팅해두었으므로 우선 사용
  if (window.qrnrStoreId) return window.qrnrStoreId;

  // 혹시 모를 fallback: URL에서 직접 읽기
  try {
    const u = new URL(location.href);
    return u.searchParams.get('store') || 'store1';
  } catch (e) {
    return 'store1';
  }
}

// 매장별 QR 저장 위치
function storePath() {
  return [...BASE_PATH, currentStoreId()];
}

// 현재 매장용 리스트 보장
function ensureList() {
  const cur = get(storePath());
  if (Array.isArray(cur)) return cur;

  // 초기화
  patch(storePath(), () => []);
  return [];
}

// qrcodejs 사용해서 QR PNG DataURL 생성
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

export function initQR() {
  const tableInput = document.getElementById('qr-table');
  const labelInput = document.getElementById('qr-label');
  const genBtn = document.getElementById('qr-generate');
  const clearBtn = document.getElementById('qr-clear');
  const grid = document.getElementById('qr-grid');

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

    // 매장별 매장주문 URL 포함
    const url = `${location.origin}/order/store?store=${encodeURIComponent(
      storeId
    )}&table=${encodeURIComponent(table)}`;

    try {
      const dataUrl = await makeQRDataUrl(url);

      const item = {
        id: `QR-${Date.now()}-${table}`,
        storeId,     // 🔴 어느 매장 QR인지 표시
        table,
        label,
        url,
        dataUrl,
      };

      // 현재 매장 리스트에만 저장
      patch(storePath(), (list) => {
        list = Array.isArray(list) ? list : [];
        // 같은 테이블 번호 QR 있으면 교체
        const filtered = list.filter((x) => x.table !== table);
        return [...filtered, item];
      });

      renderList();
    } catch (e) {
      console.error(e);
      alert('QR 생성 중 오류가 발생했습니다.');
    }
  });

  // 현재 매장에 대한 QR 전체 삭제
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (!confirm('이 매장의 저장된 QR을 모두 삭제할까요?')) return;
      patch(storePath(), () => []);
      renderList();
    });
  }

  // 목록 렌더링 (현재 매장 전용)
  function renderList() {
    const storeId = currentStoreId();
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
      wrap.style.border = '1px solid #eee';
      wrap.style.padding = '8px';
      wrap.style.borderRadius = '6px';

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
