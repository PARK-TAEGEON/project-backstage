# Current Status

## 2026-09-29 · Bootstrap
첫 작업 범위는 기반 구성까지다. 게임 전체 구현은 시작하지 않았다.

### 준비된 것
Next.js/TypeScript/Tailwind, 로비 UI shell, 공통 도메인 9개 개념, 두 GameDefinition, 순수 시작 조건/phase helper, Supabase factory, AI provider와 JSON schema/mock, 역할별 prompts, 이벤트 계약, 문서/CI.

### 아직 없는 것
실제 DB migration/RLS, anonymous auth, 방 생성/가입, Realtime/채팅, 서버 명령 처리/타이머, real LLM adapter, 미션 생성·배정·판정, 투표/Reveal/결과, 재게임, analytics 저장.
UI의 코드 입력과 Ready는 로컬 동작이다. 가짜 플레이어/가짜 공유 링크나 실제 분석 이벤트를 만들지 않는다.

### 다음 구현 후보 (권장 순서)
1. 방/익명 세션/RLS: migration과 소속 확인, 생성/가입/나가기. 수락 기준: 서로 다른 4개 세션에서 같은 방 접속, 방 밖 접근 차단, 미션 수신자 외 읽기 차단.
2. 실제 로비/채팅: Realtime, Ready, 재접속 snapshot. 수락 기준: 4–8명 동기화, 9번째 거절, 새로고침 시 세션 복구, 중복 시작 방지.
3. Secret Director 수직 구현: 고정 미션부터 시작 → 서버 타이머 → 추측 → Reveal → 결과 → 새 세션. 수락 기준: API 장애와 무관하게 한 판 완료.
4. 실제 AI adapter/예산/fallback: schema 외 수신자·증거 의미 검증과 timeout 테스트. 수락 기준: 잘못된 AI 응답이 공개 상태를 손상시키지 않음.
5. 플레이테스트 이벤트 저장과 실제 친구 테스트. 재미를 확인한 다음 Everybody Knows 포맷 실행 로직 구현.

### 검증 및 전달
- npm run check 통과: ESLint, TypeScript, 경계 테스트 7개.
- npm run build 통과: Next.js 16.3.6 production build.
- API 키 없이 로컬 서버와 브라우저 렌더링 확인.
- 브라우저에서 닉네임 입력, 대기실 진입, Ready 전환, 돌아가기, 게임 변경, 잘못된 방 코드 안내 확인.
- 모바일 390px 화면에서 카드/폼 세로 배치와 가로 넘침 없음 확인.
- 실제 Supabase 연결/LLM/멀티플레이는 미구현이므로 검증하지 않았다.
- GitHub CI는 설정만 포함하며 원격 실행 결과는 별도 확인한다.
