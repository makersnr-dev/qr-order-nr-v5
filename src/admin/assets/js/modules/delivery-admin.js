import { showToast } from '../admin.js';

export async function renderDeliveryConfig(storeId) {
    try {
        const res = await fetch(`/api/store-settings?storeId=${storeId}`);
        const data = await res.json();
        const config = data.settings?.delivery_config || {};

        document.getElementById('deliv-enabled').checked = !!config.enabled;
        document.getElementById('pickup-enabled').checked = !!config.pickup_enabled;
        document.getElementById('deliv-base-addr').value = config.base_addr || "";
        document.getElementById('deliv-max-dist').value = config.max_distance || 5;
        document.getElementById('deliv-base-fee').value = config.base_fee || 0;
        document.getElementById('deliv-extra-fee').value = config.extra_fee_per_km || 0;
        
        // 초기 좌표 보관
        window.delivBaseCoords = { 
            lat: config.base_lat || 37.5665, 
            lng: config.base_lng || 126.9780 
        };
    } catch (e) { console.error(e); }
}

export function bindDeliveryAdmin(storeId) {
    // 1. 주소 검색 및 좌표 추출 (카카오 맵 라이브러리 필요)
    document.getElementById('btn-search-base-addr').onclick = () => {
        new daum.Postcode({
            oncomplete: function(data) {
                const addr = data.address;
                document.getElementById('deliv-base-addr').value = addr;

                // 주소로 좌표 찾기 (비용 0원)
                const geocoder = new kakao.maps.services.Geocoder();
                geocoder.addressSearch(addr, (result, status) => {
                    if (status === kakao.maps.services.Status.OK) {
                        window.delivBaseCoords = {
                            lat: parseFloat(result[0].y),
                            lng: parseFloat(result[0].x)
                        };
                        console.log("좌표 추출 성공:", window.delivBaseCoords);
                    }
                });
            }
        }).open();
    };

    // 2. 저장 로직 (백엔드 필드명과 일치시켜야 함)
    document.getElementById('btn-save-deliv-config').onclick = async () => {
        const config = {
            enabled: document.getElementById('deliv-enabled').checked,
            pickup_enabled: document.getElementById('pickup-enabled').checked,
            base_addr: document.getElementById('deliv-base-addr').value,
            max_distance: Number(document.getElementById('deliv-max-dist').value),
            base_fee: Number(document.getElementById('deliv-base-fee').value),
            extra_fee_per_km: Number(document.getElementById('deliv-extra-fee').value),
            base_lat: window.delivBaseCoords?.lat,
            base_lng: window.delivBaseCoords?.lng
        };

        try {
            const res = await fetch(`/api/store-settings?storeId=${storeId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ deliveryConfig: config }) // 백엔드 COALESCE($7)와 매칭
            });

            if (res.ok) {
                showToast("지역 및 배달 설정이 저장되었습니다.", "success");
            } else {
                throw new Error("저장 실패");
            }
        } catch (e) {
            showToast("저장 중 오류가 발생했습니다.", "error");
        }
    };
}
