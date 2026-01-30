// /src/order/assets/js/modules/time.js

/**
 * 1. 현재 한국 시간(KST) 문자열 생성
 * DB 저장 시 표준이 되는 시간 포맷입니다.
 */
export function getNowKST() {
    const now = new Date();
    const kst = new Date(now.getTime() + (9 * 60 * 60 * 1000)); // UTC+9 보정
    return kst.toISOString().replace('T', ' ').substring(0, 19);
}

/**
 * 2. 주문 목록 표시용 시간 포맷
 * "2024-05-20 14:30:00" -> "05월 20일 14:30"
 */
export function fmtTime(ts) {
    if (!ts) return '-';
    const d = new Date(ts);
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${m}월 ${dd}일 ${h}:${mm}`;
}

/**
 * 3. 예약 가능 시간 리스트 생성
 * 현재 시간 기준 +30분 후부터 매장 마감 전까지 15분 단위로 생성
 */
export function getAvailableTimeSlots(startHour = 10, endHour = 22) {
    const slots = [];
    const now = new Date();
    
    // 최소 30분 뒤부터 예약 가능하도록 설정
    const startTime = new Date(now.getTime() + 30 * 60 * 1000);
    
    for (let h = startHour; h < endHour; h++) {
        for (let m = 0; m < 60; m += 15) {
            const slotTime = new Date();
            slotTime.setHours(h, m, 0, 0);
            
            // 오늘이면서 이미 지난 시간은 제외
            if (slotTime > startTime) {
                const hh = String(h).padStart(2, '0');
                const mm = String(m).padStart(2, '0');
                slots.push(`${hh}:${mm}`);
            }
        }
    }
    return slots;
}

/**
 * 4. 영업 여부 판단 (Break Time 등 확장 가능)
 */
export function isStoreOpen(openTime = "10:00", closeTime = "22:00") {
    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();
    
    const [oH, oM] = openTime.split(':').map(Number);
    const [cH, cM] = closeTime.split(':').map(Number);
    
    const start = oH * 60 + oM;
    const end = cH * 60 + cM;
    
    return currentTime >= start && currentTime <= end;
}

/**
 * 5. 날짜 차이 계산 (어제 주문, 오늘 주문 구분용)
 */
export function isToday(dateStr) {
    const target = new Date(dateStr).toDateString();
    const today = new Date().toDateString();
    return target === today;
}
