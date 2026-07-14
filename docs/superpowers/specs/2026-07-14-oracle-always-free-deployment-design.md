# Oracle Always Free 배포 설계

## 목적

AIMS 추가근무 기록 서비스를 회사 도메인과 월 운영비 없이 배포한다. 직원 3명이 모바일에서 Google 계정으로 로그인해 바로 사용할 수 있어야 하며, 현재 React, NestJS, Docker Compose, SQLite 구조를 유지한다.

## 성공 기준

- `https://aims-overtime.duckdns.org`에서 서비스에 접속할 수 있다.
- 15분 이상의 미사용 후에도 애플리케이션이 의도적으로 휴면하지 않는다.
- `@aimskr.com` Google 계정만 로그인할 수 있다.
- `contact@aimskr.com`은 로그인 직후 관리자 화면으로 이동한다.
- 일반 직원은 추가근무 기록을 등록하고 자신의 기록을 조회할 수 있다.
- 컨테이너와 VM을 재시작해도 SQLite 데이터가 유지된다.
- Object Storage 백업 생성과 별도 경로 복구 시험이 성공한다.
- 생성한 Oracle 리소스가 모두 Always Free 한도 안에 있다.

## 선택한 접근

Oracle VM에서 비공개 GitHub 저장소를 clone하고 Docker 이미지를 직접 빌드한다. 초기 배포는 수동 명령으로 수행하고 GitHub Actions 자동 배포는 범위에서 제외한다.

이 접근은 별도의 유료 컨테이너 레지스트리가 필요 없고 ARM64 교차 빌드와 이미지 전송 절차도 피한다. 직원 3명 규모에서는 VM 내부 빌드 시간이 운영상 문제가 되지 않는다.

## 검토한 대안

### 개발 Mac에서 이미지 빌드 후 전송

VM의 빌드 부하는 줄지만 ARM64 이미지 빌드와 전송 명령이 복잡하고 매 배포마다 큰 이미지를 전송해야 하므로 선택하지 않는다.

### GitHub Actions 자동 배포

push 기반 자동 배포가 가능하지만 SSH 키, GitHub Secrets, 이미지 저장소와 실패 복구 절차가 추가된다. 초기 배포가 안정된 뒤 별도 개선 작업으로 다룬다.

## 인프라 구조

- 홈 리전: Japan East, Tokyo
- Compute: `VM.Standard.A1.Flex`, 1 OCPU, 6GB RAM
- 운영체제: Ubuntu 24.04 ARM64의 Always Free Eligible 이미지
- 부팅 볼륨: 50GB
- SQLite 전용 Block Volume: 50GB
- 공인 주소: Oracle VM 공인 IPv4
- 호스트 이름: `aims-overtime.duckdns.org`
- TLS: Caddy의 자동 HTTPS 인증서 발급과 갱신
- 공개 포트: TCP 80, TCP 443
- 관리 포트: TCP 22, SSH 키 인증 사용
- 비공개 포트: NestJS 3000은 Docker 네트워크 안에서만 접근

Oracle Always Free의 현재 한도는 A1 Compute 총 2 OCPU와 12GB RAM, 부팅 볼륨과 Block Volume 합산 200GB, Object Storage 20GB다. 이 설계는 A1 1 OCPU와 6GB RAM, 합산 Block Volume 100GB만 사용한다. 모든 리소스 생성 화면에서 `Always Free Eligible` 표시를 확인하고 유료 Load Balancer, 추가 VM, 유료 이미지는 생성하지 않는다.

참고: <https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm>

## 애플리케이션 구조

기존 `compose.production.yaml`을 Oracle 환경에 맞게 사용한다.

- `web`: 빌드된 React 정적 파일을 Caddy가 제공한다.
- `web`: `/api/*` 요청을 Docker 내부의 `api:3000`으로 전달한다.
- `api`: NestJS를 production 모드로 실행한다.
- `api`: SQLite를 `/app/data/overtime.sqlite`에서 사용한다.
- 호스트의 `/data/overtime`을 API 컨테이너의 `/app/data`에 bind mount한다.
- 두 컨테이너 모두 `restart: unless-stopped`로 재시작한다.
- 컨테이너 로그에는 크기와 파일 개수 제한을 둔다.

Node.js와 Caddy의 공식 컨테이너 이미지는 ARM64를 지원해야 한다. 실제 배포 전에 로컬 Compose 구성을 검증하고 Oracle A1 VM에서 전체 이미지 빌드를 수행해 호환성을 확인한다.

## 주소와 Google 로그인

DuckDNS에서 `aims-overtime.duckdns.org`를 만들고 Oracle VM 공인 IPv4를 연결한다. 공인 IP가 바뀌는 경우 DuckDNS 레코드를 갱신하는 절차를 실행 문서에 포함한다.

운영 환경변수의 핵심 값은 다음과 같다.

```dotenv
APP_ORIGINS=https://aims-overtime.duckdns.org
DOMAIN=aims-overtime.duckdns.org
GOOGLE_HOSTED_DOMAIN=aimskr.com
ADMIN_EMAILS=contact@aimskr.com
```

Google OAuth 웹 클라이언트의 승인된 JavaScript 원본에는 아래 주소를 등록한다.

```text
https://aims-overtime.duckdns.org
```

Google Identity Services의 기본 `openid`, `email`, `profile` 범위만 사용하고, 백엔드의 hosted domain과 이메일 검증을 계속 적용한다. DuckDNS 호스트 이름이 Google OAuth 설정에서 거절되거나 운영 게시 과정에서 소유권 확인을 요구하면 이는 회사가 제어하는 도메인 없이 해결할 수 없는 외부 제약으로 기록하고, Google OAuth 테스트 사용자 방식 또는 회사 서브도메인을 별도로 검토한다.

## 소스와 비밀값 관리

현재 로컬 저장소를 비공개 GitHub 저장소에 push한다. Oracle VM에는 읽기 전용 GitHub Deploy Key를 등록해 clone과 pull만 허용한다.

다음 항목은 Git에 저장하지 않는다.

- `.env.production`
- `SESSION_HASH_SECRET`
- Google OAuth 관련 비밀값
- SQLite DB와 journal 파일
- 로컬 및 원격 백업 파일
- SSH 개인 키와 Object Storage 인증 정보

`SESSION_HASH_SECRET`은 암호학적으로 안전한 32바이트 이상의 무작위 값으로 생성한다. VM SSH는 키 인증만 사용하고 비밀번호 인증은 비활성 상태를 유지한다.

## 데이터와 백업

SQLite 전용 50GB Block Volume을 VM에 연결하고 `/data/overtime`에 마운트한다. `/etc/fstab`에는 UUID 기반으로 등록하고 `nofail`을 사용한다. API 컨테이너의 UID와 GID가 해당 경로에만 쓰기 권한을 갖도록 설정한다.

백업은 실행 중인 DB 파일을 단순 복사하지 않고 SQLite의 일관된 백업 방식으로 생성한다.

- 매일 새벽 로컬 백업 생성
- 생성 직후 무결성 검사
- Oracle Object Storage에 업로드
- Object Storage에는 최근 30일분만 유지
- 애플리케이션 배포 직전 수동 백업
- 별도 임시 경로에서 월 1회 복구 시험

Object Storage 사용량과 요청 수가 Always Free 한도를 넘지 않도록 백업 파일 크기와 보존 개수를 확인한다. 백업 성공 여부를 로그로 남기며 최근 성공 백업이 일정 시간 이상 없으면 관리자가 확인할 수 있는 점검 명령을 실행 문서에 포함한다.

## 네트워크와 보안

Oracle VCN 보안 목록 또는 Network Security Group과 Ubuntu 방화벽에서 필요한 포트만 허용한다.

- 80과 443: 전체 인터넷에서 허용
- 22: 초기에는 관리자 현재 공인 IP만 허용
- 3000: 외부 규칙을 만들지 않음

Caddy는 HTTP 요청을 HTTPS로 전환하고 인증서를 자동 갱신한다. API의 origin guard는 `APP_ORIGINS`의 정확한 운영 원본만 허용한다. 세션 쿠키는 운영 환경에서 `Secure`, `HttpOnly`와 현재 애플리케이션의 SameSite 정책을 적용한다.

## 배포와 롤백

초기 배포 흐름은 다음과 같다.

1. 비공개 GitHub 저장소 생성과 첫 push
2. Oracle VM 생성 및 SSH 키 접속 확인
3. 50GB Block Volume 생성, 연결, 포맷, 마운트
4. Docker Engine과 Compose 플러그인 설치
5. 읽기 전용 Deploy Key로 저장소 clone
6. `.env.production` 작성
7. DuckDNS 레코드 연결
8. `docker compose` 빌드 및 실행
9. Caddy HTTPS 발급과 API health 확인
10. Google OAuth 승인 원본 등록
11. 직원과 관리자 로그인 검증
12. 백업과 복구 시험

새 배포 전에는 SQLite 백업을 생성한다. 소스는 Git 태그 또는 커밋 SHA로 식별하고, 장애 발생 시 이전 커밋으로 전환한 후 이미지를 다시 빌드한다. DB 마이그레이션을 포함한 배포는 애플리케이션 롤백만으로 DB가 되돌아가지 않으므로 배포 전 백업에서 복구할지를 별도로 판단한다.

## 오류 처리와 진단 순서

서비스가 열리지 않을 때는 다음 순서로 확인한다.

1. DuckDNS가 현재 Oracle 공인 IP를 가리키는지 확인
2. Oracle VCN과 Ubuntu 방화벽의 80, 443 규칙 확인
3. Docker Compose 서비스와 healthcheck 상태 확인
4. Caddy 인증서와 reverse proxy 로그 확인
5. NestJS 시작, 환경변수, TypeORM migration 로그 확인
6. Block Volume 마운트와 쓰기 권한 확인
7. Google OAuth 승인 원본과 `APP_ORIGINS` 값의 정확한 일치 확인

Compose의 healthcheck와 시작 의존성으로 최초 배포 때 API가 준비된 뒤 `web`을 시작한다. 실행 중 API 장애는 Caddy의 5xx 응답과 컨테이너 로그로 진단하고, `restart: unless-stopped`가 종료된 컨테이너를 다시 실행한다. 로그는 회전 설정을 사용해 디스크 부족으로 인한 장애를 방지한다.

## 검증 계획

### 배포 전

- 전체 단위·통합·E2E 테스트 실행
- production Compose 구성 렌더링 검사
- Dockerfile 빌드 검사
- `.env.production` 필수값 목록 검사
- 비밀값과 DB 파일이 Git 추적 대상이 아닌지 검사

### 배포 후

- `https://aims-overtime.duckdns.org/api/health` 응답 확인
- React 정적 자산과 SPA fallback 확인
- `@aimskr.com` 직원 로그인과 기록 등록·조회 확인
- 비허용 도메인 로그인 거절 확인
- `contact@aimskr.com`의 관리자 화면 이동과 조회 확인
- 컨테이너 재시작 후 데이터 유지 확인
- VM 재부팅 후 Block Volume 자동 마운트와 서비스 자동 시작 확인
- Object Storage 백업 생성, 다운로드, 임시 경로 복구 확인

## 운영상 알려진 제약

- Oracle은 Always Free의 장기간 유휴 A1 인스턴스를 회수할 수 있다.
- 무료 리전의 A1 용량이 부족하면 VM 생성이 즉시 되지 않을 수 있다.
- Always Free 정책과 한도는 변경될 수 있으므로 리소스 생성 및 월별 점검 때 공식 문서를 다시 확인한다.
- DuckDNS와 Oracle 무료 서비스에는 상용 SLA가 없다.
- Google OAuth의 운영 게시 또는 도메인 검증 정책이 무료 DuckDNS 주소 사용을 제한할 수 있다.

이 제약은 숨기지 않고 운영 문서에 포함하며, 서비스가 업무상 필수 시스템이 되는 시점에는 회사가 제어하는 도메인과 유료 인프라로 이전한다.
