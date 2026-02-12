// delivery-util.js (함수만 존재해야 함)
export function getDistanceKm(lat1, lng1, lat2, lng2) {
    const R = 6371; // 지구 반지름
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

export function calculateDeliveryFee(config, distance) {
    if (!config || !config.enabled) return 0;
    if (distance > config.max_distance) return -1; // 배달 불가

    let fee = config.base_fee || 0;
    if (distance > 1) {
        fee += Math.floor(distance - 1) * (config.extra_fee_per_km || 0);
    }
    return fee;
}
