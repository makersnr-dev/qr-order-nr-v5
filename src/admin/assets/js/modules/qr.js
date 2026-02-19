// /src/admin/assets/js/modules/qr.js
import { showToast } from '../admin.js';

const $ = (s, r = document) => r.querySelector(s);

// ===== 매장 식별 =====
/*function currentStoreId() {
    const storeId = window.qrnrStoreId;
    if (!storeId) {
        showToast('매장 정보가 초기화되지 않았습니다.', 'error');
        throw new Error('STORE_ID_NOT_INITIALIZED');
    }
    return storeId;
}*/

// ===== [DB 연동] 데이터 통신 함수들 =====
async function loadQrListFromServer(storeId) {
    try {
        const res = await fetch(`/api/qrcodes?storeId=${storeId}`);
        const data = await res.json();
        return data.list || [];
    } catch (e) {
        console.error(e);
        showToast('QR 목록을 불러오지 못했습니다.', 'error');
        return [];
    }
}

async function saveQrToDB(storeId, qrData) {
    // 🚀 서버 API 호출 (제한 로직은 서버 api/qrcodes.js에서 처리함)
    return await fetch(`/api/qrcodes?storeId=${storeId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(qrData)
    });
}

// ===== QR 코드 생성 (qrcodejs) =====
function makeQRDataUrl(text) {
    return new Promise((resolve, reject) => {
        try {
            if (!window.QRCode) return reject(new Error('QRCode 전역 객체가 없습니다.'));

            const wrap = document.createElement('div');
            wrap.style.position = 'fixed'; wrap.style.left = '-9999px'; wrap.style.top = '-9999px';
            document.body.appendChild(wrap);

            new QRCode(wrap, {
                text,
                width: 256,
                height: 256,
                correctLevel: QRCode.CorrectLevel.H,
            });

            setTimeout(() => {
                try {
                    const canvas = wrap.querySelector('canvas');
                    const img = wrap.querySelector('img');
                    let dataUrl = canvas ? canvas.toDataURL('image/png') : (img ? img.src : null);
                    document.body.removeChild(wrap);
                    if (!dataUrl) throw new Error('QR 이미지를 생성하지 못했습니다.');
                    resolve(dataUrl);
                } catch (e) {
                    if (wrap.parentNode) document.body.removeChild(wrap);
                    reject(e);
                }
            }, 100);
        } catch (e) { reject(e); }
    });
}

// ===== 초기화 및 렌더링 =====
export async function initQR(storeId) {
    if (!storeId) return; // 방어 코드

    const tableInput = $('#qr-table');
    const labelInput = $('#qr-label');
    const genBtn = $('#qr-generate');
    const clearBtn = $('#qr-clear');
    const grid = $('#qr-grid');

    const delivLabelInput = $('#qr-deliv-label');
    const delivGenBtn = $('#qr-deliv-generate');
    const delivClearBtn = $('#qr-deliv-clear');
    const delivGrid = $('#qr-deliv-grid');

    const downloadAllBtn = $('#qr-download-all');
    const delivDownloadAllBtn = $('#qr-deliv-download-all');

    // 🚀 전체 다운로드 함수 (ZIP 압축)
    async function downloadAllAsZip(kind) {
        const btn = kind === 'store' ? $('#qr-download-all') : $('#qr-deliv-download-all');
        if (btn) {
            btn.disabled = true;
            btn.classList.add('btn-loading'); // 로딩 시작
        }
        try{
        const all = await loadQrListFromServer(storeId);
        const list = all.filter(q => q.kind === kind);
        
        if (list.length === 0) {
            showToast("다운로드할 QR 코드가 없습니다.", "error");
            return;
        }

        const zip = new JSZip();
        const folderName = kind === 'store' ? '매장_테이블_QR' : '예약_주문_QR';
        const folder = zip.folder(folderName);

        list.forEach(q => {
            // base64 데이터에서 실제 파일 데이터만 추출
            const imgData = q.dataUrl.split(',')[1];
            const fileName = kind === 'store' 
                ? `table-${q.table}${q.label ? '_' + q.label : ''}.png`
                : `reserve${q.label ? '_' + q.label : ''}.png`;
            
            folder.file(fileName, imgData, {base64: true});
        });

        const content = await zip.generateAsync({type: "blob"});
        const link = document.createElement("a");
        link.href = URL.createObjectURL(content);
        link.download = `${folderName}_${storeId}.zip`;
        link.click();
        
        showToast(`${list.length}개의 QR 코드가 압축 파일로 다운로드됩니다.`, "success");
    }catch (e) {
        console.error(e);
        showToast("다운로드 중 오류가 발생했습니다.", "error");
    }finally {
            if (btn) {
                btn.disabled = false;
                btn.classList.remove('btn-loading'); // 로딩 종료
            }
        }
    }

    // 버튼 이벤트 바인딩
    if (downloadAllBtn) {
        downloadAllBtn.onclick = () => downloadAllAsZip('store');
    }
    if (delivDownloadAllBtn) {
        delivDownloadAllBtn.onclick = () => downloadAllAsZip('deliv');
    }

    // [보완] 이미 이벤트가 걸려있다면 다시 걸지 않도록 방어
    if (grid && grid.dataset.eventBound === 'true') {
        refreshAllLists(); // 리스트만 갱신하고 종료
        return;
    }

    // ── [추가된 부분] 이벤트 위임용 공통 처리 함수 ──
    const handleGridClick = async (e) => {
        const btn = e.target.closest('button');
        // 클릭된 게 버튼이 아니거나, 삭제 버튼(data-act="del")이 아니면 무시
        if (!btn || btn.dataset.act !== 'del') return; 

        // 버튼 상위의 .qr-card에서 ID를 가져옴
        const qId = btn.closest('.qr-card')?.dataset.id; 
        if (!qId || !confirm('삭제할까요?')) return;

        const res = await fetch(`/api/qrcodes?storeId=${storeId}&id=${qId}`, { method: 'DELETE' });
        if (res.ok) {
            showToast('QR 코드가 삭제되었습니다.', 'success');
            refreshAllLists(); // 리스트 새로고침
        }
    };

    // ── [추가된 부분] 부모 그리드에 딱 한 번만 이벤트 바인딩 ──
    // 이렇게 부모에 걸어두면 innerHTML로 자식들이 계속 바뀌어도 이벤트가 유지됩니다.
    if (grid) {
        grid.addEventListener('click', handleGridClick);
        grid.dataset.eventBound = 'true'; // 플래그 설정
    }
    if (delivGrid) {
        delivGrid.addEventListener('click', handleGridClick);
        delivGrid.dataset.eventBound = 'true'; // 플래그 설정
    }

    // ── 리스트 새로고침 함수 ──
    async function refreshAllLists() {
        const all = await loadQrListFromServer(storeId);
        
        // 1) 매장 테이블용 렌더
        if (grid) {
            const storeList = all.filter(q => q.kind === 'store' || !q.kind);
            renderItems(grid, storeList, 'table');
        }
        // 2) 예약용 렌더
        if (delivGrid) {
            const delivList = all.filter(q => q.kind === 'deliv');
            renderItems(delivGrid, delivList, 'delivery');
        }
    }

    function renderItems(targetGrid, list, downloadPrefix) {
    targetGrid.innerHTML = '';
    if (!list.length) {
        targetGrid.innerHTML = '<div class="small">저장된 QR이 없습니다.</div>';
        return;
    }

    list.sort((a, b) => (a.table || '').localeCompare(b.table || '')).forEach((q) => {
        const wrap = document.createElement('div');
        wrap.className = 'vstack qr-card'; // [수정] 식별용 클래스 추가
        wrap.dataset.id = q.id;           // [추가] 삭제를 위한 ID 저장
        wrap.style.cssText = `display:flex; flex-direction:column; align-items:center; justify-content:center; gap:8px; border:1px solid #263241; padding:16px; border-radius:12px; background:#0b1620; text-align:center; width:100%;`;

        wrap.innerHTML = `
            <img src="${q.dataUrl}" style="width:140px; height:140px; border-radius:4px; display: block; margin: 0 auto;">
            <div class="small" style="width:100%; font-weight:bold; color:#fff;">
                ${
                  q.kind === 'deliv' 
                    ? (q.label || '예약 주문') // 🚀 예약용: 라벨이 있으면 라벨, 없으면 '예약 주문'만 표시
                    : (q.label ? `${q.table}번 테이블 (${q.label})` // 🚀 라벨이 있으면: 2번 테이블 (테스트)
                               : `${q.table}번 테이블`)              // 🚀 라벨이 없으면: 빈칸 (아무것도 안 나옴)
                  }
            </div>
            <div class="small" style="word-break:break-all; color:var(--muted); font-size:10px; width:100%; max-width:160px;">
                ${q.url}
            </div>
            <div class="hstack" style="gap:4px; margin-top:6px; justify-content:center; width:100%;">
                <a href="${q.dataUrl}" download="${downloadPrefix}-${q.table || 'qr'}.png" class="btn small">다운</a>
                <button class="btn small danger" data-act="del">삭제</button> 
            </div>
        `;
        // [삭제] wrap.querySelector('.danger').onclick = ... (개별 이벤트 삭제)
        targetGrid.appendChild(wrap);
    });
}

    // ── 1) 매장 QR 생성 ──
    if (genBtn) {
        genBtn.onclick = async () => {
            const table = (tableInput.value || '').trim();
            const label = (labelInput.value || '').trim();
            if (!table) return showToast('테이블 번호를 입력하세요.', 'info');

            const url = `${location.origin}/order/store?store=${encodeURIComponent(storeId)}&table=${encodeURIComponent(table)}`;
            genBtn.disabled = true;
            genBtn.classList.add('btn-loading'); // 로딩 상태 부여
            
            try {
                const dataUrl = await makeQRDataUrl(url);
                const qrItem = { id: `QR-${Date.now()}-${table}`, kind: 'store', table, label, url, dataUrl };
                
                const res = await saveQrToDB(storeId, qrItem);
                const result = await res.json();

                if (res.ok) {
                    showToast(`✅ ${table}번 QR 생성 완료`, 'success');
                    tableInput.value = ''; labelInput.value = '';
                    refreshAllLists();
                } else {
                    // 🚀 [제한 체크] 서버에서 보낸 "최대 10개..." 메시지를 그대로 토스트로 띄움
                    showToast(result.message || '생성 실패', 'error');
                }
            } catch (e) {
            console.error(e);
            showToast('QR 생성 중 오류가 발생했습니다.', 'error');
        } finally {
            genBtn.disabled = false; // 성공/실패 여부와 상관없이 마지막에 활성화
                genBtn.classList.remove('btn-loading');
        }
        };
    }
    // ── 2) 예약 QR 생성 ──
    if (delivGenBtn) {
        delivGenBtn.onclick = async () => {
            const label = (delivLabelInput.value || '').trim();
            const url = `${location.origin}/src/order/delivery-entry.html?store=${encodeURIComponent(storeId)}`;
            delivGenBtn.disabled = true;
            delivGenBtn.classList.add('btn-loading');
            try {
                const dataUrl = await makeQRDataUrl(url);
                const qrItem = { id: `QR-DELIV-${Date.now()}`, kind: 'deliv', label, url, dataUrl };
                
                const res = await saveQrToDB(storeId, qrItem);
                const result = await res.json();

                if (res.ok) {
                    showToast('✅ 예약용 QR 생성 완료', 'success');
                    delivLabelInput.value = '';
                    refreshAllLists();
                } else {
                    showToast(result.message || '생성 실패', 'error');
                }
            } catch (e) {
                console.error(e);
                showToast('QR 생성 실패', 'error');
            }finally {
            delivGenBtn.disabled = false; // 성공/실패 여부와 상관없이 마지막에 활성화
                delivGenBtn.classList.remove('btn-loading');
        }
        };
    }

    // ── 전체 삭제 버튼 ──
    if (clearBtn) {
        clearBtn.onclick = async () => {
            if (!confirm('매장 테이블용 QR을 모두 삭제할까요?')) return;
            clearBtn.disabled = true;
            clearBtn.classList.add('btn-loading');
            
            // 🚀 Kind를 'store'로 확실히 지정해서 호출
            const res = await fetch(`/api/qrcodes?storeId=${storeId}&kind=store`, { 
                method: 'DELETE' 
            });
            
            if (res.ok) {
                showToast('매장용 QR이 모두 삭제되었습니다.', 'success');
                // ✅ 삭제 후 목록 새로고침 함수 호출 (이게 있어야 화면에서 바로 사라짐)
                if (typeof refreshAllLists === 'function') {
                    await refreshAllLists();
                } else {
                    location.reload(); // 함수가 없으면 페이지 새로고침
                }
            } else {
                showToast('삭제 실패: 서버 오류가 발생했습니다.', 'error');
            }
            clearBtn.disabled = false;
            clearBtn.classList.remove('btn-loading');
        };
    }
    if (delivClearBtn) {
        delivClearBtn.onclick = async () => {
            if (!confirm('예약용 QR을 모두 삭제할까요?')) return;
            delivClearBtn.disabled = true;
            delivClearBtn.classList.add('btn-loading');
            const res = await fetch(`/api/qrcodes?storeId=${storeId}&kind=deliv`, { method: 'DELETE' });
            if (res.ok) {
                showToast('예약 QR이 모두 삭제되었습니다.', 'success');
                refreshAllLists();
            }
            delivClearBtn.disabled = false;
            delivClearBtn.classList.remove('btn-loading');
        };
    }

    // 초기 로드
    refreshAllLists();
}
