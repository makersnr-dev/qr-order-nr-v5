import {patch, get} from './store.js';

const PATH = ['admin', 'qrList'];

function ensureList() {
  const cur = get(PATH);
  if (Array.isArray(cur)) return cur;
  return patch(PATH, () => []);
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
    const table = (tableInput.value || '').trim();
    const label = (labelInput.value || '').trim() || `${table}번 테이블`;

    if (!table) {
      alert('테이블 번호를 입력하세요.');
      tableInput.focus();
      return;
    }

    const url = `${location.origin}/order/store?table=${encodeURIComponent(table)}`;

    try {
      if (!window.QRCode || !QRCode.toDataURL) {
        throw new Error('QR코드 라이브러리가 로드되지 않았습니다.');
      }

      const dataUrl = await new Promise((resolve, reject) => {
        QRCode.toDataURL(url, { width: 256, margin: 2 }, (err, res) => {
          if (err) reject(err);
          else resolve(res);
        });
      });

      const item = {
        id: `${Date.now()}-${table}`,
        table,
        label,
        url,
        dataUrl,
      };

      // 같은 테이블 번호가 있으면 덮어쓰기
      patch(PATH, (list) => {
        list = Array.isArray(list) ? list : [];
        const filtered = list.filter(x => x.table !== table);
        return [...filtered, item];
      });

      renderList();
    } catch (e) {
      console.error(e);
      alert('QR 생성 중 오류가 발생했습니다.');
    }
  });

  // 전체 삭제
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (!confirm('저장된 QR을 모두 삭제할까요?')) return;
      patch(PATH, () => []);
      renderList();
    });
  }

  // 리스트 렌더링
  function renderList() {
    const list = get(PATH) || [];
    if (!list.length) {
      grid.innerHTML = '<div class="small">저장된 QR이 없습니다.</div>';
      return;
    }

    grid.innerHTML = '';
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

      // 개별 PNG 다운로드
      const down = document.createElement('a');
      down.textContent = '다운로드';
      down.href = q.dataUrl;
      down.download = `table-${q.table}.png`;
      down.className = 'btn small';

      // 개별 삭제
      const del = document.createElement('button');
      del.textContent = '삭제';
      del.className = 'btn small';
      del.onclick = () => {
        patch(PATH, (list) => (list || []).filter(x => x.id !== q.id));
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
