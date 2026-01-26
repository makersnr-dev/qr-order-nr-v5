## PHASE 0-5-3 Snapshot

- stores API: GET only (FIXED_STORES)
- JWT / super / admin auth: intentionally disabled
- 관리자 매핑 UI: 구조 확인용만 유지
- 주문/결제/배달: 실사용 기준만 남김

→ 다음 단계: DB 도입 직전 PHASE 1

# PHASE 1 상태

- DB: Neon (아직 연결 안 함)
- stores API: GET only
- orders API: local 기반
- JWT / 인증: 비활성화
- 이 상태는 정상이며 버그 아님

PHASE 2에서 DB 실제 연결 시작
