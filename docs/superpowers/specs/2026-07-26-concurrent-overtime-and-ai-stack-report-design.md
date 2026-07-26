# 야근 중복 방지와 AI 스택 소개 보고서 설계

## 목적

같은 직원의 겹치는 야근 기록이 동시 요청에서 함께 저장될 수 있는 빈틈을 PostgreSQL이 직접 막는다. 이 변경을 반영해, AI로 작은 사내 서비스를 구현할 때의 스택 선택과 검증 원칙을 소개하는 Notion용 보고서를 작성한다.

## 배경

현재 `TypeOrmOvertimeRepository.saveIfNoOverlap`은 트랜잭션 안에서 겹치는 기록을 조회한 뒤 새 기록을 저장한다. PostgreSQL 기본 격리 수준(`READ COMMITTED`)에서는 두 요청이 모두 빈 결과를 읽고 각각 저장할 수 있다. 애플리케이션 조회는 좋은 사용자 경험을 제공하지만 최종 정합성 제약이 될 수 없다.

보고서는 학습 프로젝트 소개가 목적이다. 핵심은 "AI가 잘 아는 표준 스택"을 선택한 이유를 설명하되, AI 생성 코드가 실제 서비스가 되려면 사람이 정한 경계와 자동 검증이 필요하다는 점을 보여 주는 것이다.

## 범위

### 포함

- `overtime_records`에 사용자별 시간 구간 중복을 금지하는 PostgreSQL exclusion constraint 추가
- 기존 API 오류 계약(`409`, `OVERTIME_OVERLAP`) 유지
- 인접한 기록은 허용하고, 자정을 넘는 기록도 정확히 비교
- 실제 PostgreSQL E2E에서 동시 생성 요청 중 하나만 성공하는 회귀 테스트 추가
- Notion에 붙여 넣을 수 있는 Markdown 보고서 작성
- 기존 README와 운영 문서의 CSV 표현을 Excel로 정정

### 제외

- 기존 야근 데이터 정정 도구
- 재시도·큐·분산 락 추가
- 관리자 권한 모델 변경, UI 디자인 변경, 배포 인프라 교체
- 법률 준수 여부에 대한 판단

## 선택지와 결정

### 선택지 A: 애플리케이션 트랜잭션만 유지

구현은 단순하지만 현재 경합 조건을 해결하지 못한다. 채택하지 않는다.

### 선택지 B: 사용자별 advisory lock

동시에 같은 사용자를 저장하는 요청을 직렬화할 수 있으나, 모든 쓰기 경로가 같은 락 규약을 지켜야 한다. 데이터베이스를 직접 수정하는 경로에는 방어가 없다. 채택하지 않는다.

### 선택지 C: PostgreSQL exclusion constraint

`user_id`가 같고 `[start_at, end_at)` 구간이 겹치는 행을 PostgreSQL이 거부한다. API, 관리 스크립트, 미래의 쓰기 경로에 동일하게 적용되는 최종 방어선이다. `btree_gist` 확장을 사용해 UUID 동등 비교와 `tstzrange` 겹침 연산을 함께 지원한다. 이 방식을 채택한다.

## 데이터베이스와 오류 처리

새 migration은 다음 순서로 실행한다.

1. `CREATE EXTENSION IF NOT EXISTS btree_gist`
2. `overtime_records`에 `(user_id WITH =, tstzrange(start_at, end_at, '[)') WITH &&)` exclusion constraint 추가

`[)`는 종료 시각을 포함하지 않는다. 따라서 `18:00–20:00`과 `20:00–22:00`은 함께 저장되지만, 경계가 아닌 부분이 한 분이라도 겹치면 거부된다.

기존 조회 기반 검사는 빠른 `OVERTIME_OVERLAP` 응답을 유지한다. 그 조회를 통과했지만 DB 제약에서 거부된 경우에도 repository가 PostgreSQL SQLSTATE `23P01`을 `null`로 바꿔 서비스가 같은 `OvertimeOverlapError`를 내보낸다. 예상하지 못한 DB 오류는 삼키지 않는다.

기존 데이터에 이미 겹치는 행이 있으면 migration은 실패한다. 운영 반영 전, migration 실패 메시지로 대상 데이터를 확인하고 사람이 정정한 뒤 다시 실행한다. 데이터가 없거나 현재 애플리케이션 규칙으로만 작성됐다면 정상 적용된다.

## 테스트

- 단위 테스트는 PostgreSQL `23P01` 오류가 기존의 중복 결과로 매핑되는지만 확인한다.
- PostgreSQL E2E는 같은 로그인 세션으로 완전히 겹치는 두 `POST /api/overtime` 요청을 병렬 실행한다.
- 결과는 정확히 하나의 `201 Created`, 하나의 `409 OVERTIME_OVERLAP`, 그리고 월 조회에서 한 건이어야 한다.
- 기존 자정 넘김, 인접 시간, 일반 중복 테스트는 유지한다.
- Docker가 없는 환경에서는 이 E2E를 실행할 수 없으므로, CI와 로컬 실행서는 PostgreSQL test Compose를 먼저 기동하는 전용 명령을 사용한다.

## Notion 보고서 구성

문서는 `docs/reports/` 아래 Markdown으로 작성하고 Notion에 그대로 붙여 넣을 수 있게 한다.

1. 한 문단 요약: 무엇을 만들었고 무엇을 학습했는가
2. 서비스 범위와 사용자 흐름
3. 스택 선택: AI 친화성뿐 아니라 서비스 요구와 연결한 이유
4. 구현 워크플로: spec → plan → 테스트 → 구현·검증, 그리고 사람이 결정한 지점
5. 실제로 발견한 동시성 문제와 PostgreSQL 최종 방어선
6. 구현 범위와 검증 현황
7. 다음 소규모 사내 도구에 적용할 체크리스트

기술 사실은 코드와 문서에 맞춘다. Zod는 환경·migration 환경 검증에 사용하고, HTTP API 본문은 Nest `ValidationPipe`와 DTO 검증을 사용한다. 보고서와 README·runbook에는 CSV가 아닌 Excel(`.xlsx`)을 표기한다. 검증 결과는 실행 사실만 적고, Docker daemon이 없는 환경에서 실행하지 못한 PostgreSQL E2E는 미실행으로 명시한다.

## 성공 기준

- 병렬 중복 생성에서 한 요청만 저장되고 다른 요청은 기존 409 계약으로 실패한다.
- 인접 시간과 자정 넘김 동작은 바뀌지 않는다.
- DB role 분리와 명시 migration 방식은 유지된다.
- 보고서를 읽는 개발자가 스택의 장점, 한계, 검증 기준을 실제 사례와 함께 이해할 수 있다.
