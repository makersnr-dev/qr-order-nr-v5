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

# PHASE 1 상태 스냅샷

## 현재 단계
- PHASE 0 완료
- PHASE 1 진행 중 (DB 도입 준비 단계)

## 기술 상태
- DB: Neon (선택 완료, 아직 연결 안 함)
- JWT / 인증: 비활성화 (의도적)
- stores API: GET only (FIXED_STORES)
- orders API: local 기반 (DB 전환 예정)

## 정상 동작 기준
- /api/stores → 200 OK
- 관리자 로그인/매핑 안 됨 → 정상
- JWT 관련 기능 동작 안 함 → 정상
- 결제/배달 기능 없음 → 정상

## 주의
- 이 상태는 버그가 아님
- DB 도입(PHASE 2) 전까지 기능 추가/보안 강화하지 않음

## 다음 단계
- PHASE 2: Neon 실제 연결 시작

