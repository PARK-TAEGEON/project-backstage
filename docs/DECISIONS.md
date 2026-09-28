# Decisions

## DEC-001 — Bootstrap 범위
Decision: UI shell과 계약/문서까지만 만든다.
Reason: 실제 친구들의 재미를 검증하기 전에 플랫폼을 만들지 않는다.
Alternatives: 두 게임 전체를 한 번에 구현.
Consequences: 현재 UI는 로컬 데모이며 방/초대/게임은 동작하지 않는다.

## DEC-002 — 기술과 브랜드
Decision: Next.js App Router, TypeScript, Tailwind, Supabase 준비. 이름은 brand.ts/환경 변수로 분리한다.
Reason: 웹과 모바일 브라우저에 빠르게 접근하고 이름 변경 비용을 낮춘다.
Alternatives: 네이티브 앱, 독립 websocket 서버, 브랜드 기반 내부 이름.
Consequences: 실제 Supabase 프로젝트와 데이터 계층은 다음 단계에서 연결한다.

## DEC-003 — 작은 GameDefinition
Decision: 두 게임이 공통 타입/phase helper를 공유하고 각 게임 정의에 규칙을 둔다.
Reason: 복잡한 플러그인 프레임워크 없이 게임 규칙의 혼합을 막는다.
Alternatives: 단일 거대 컴포넌트, 범용 workflow engine.
Consequences: engine은 순수 helper이며 authoritative 서버 진행은 추가해야 한다.

## DEC-004 — AI 경계
Decision: 업체 독립 provider, Zod JSON schema, 명시적 fixture mock, 서버 전용 factory.
Reason: API 키 없이 bootstrap을 검증하고 공급자를 바꾸기 쉽게 한다.
Alternatives: UI에서 특정 LLM SDK 직접 호출.
Consequences: real adapter/재시도/예산/의미 검증은 미구현이다. 매 메시지 호출은 금지한다.

## DEC-005 — 비밀 정보와 Realtime
Decision: 공개 상태와 수신자별 개인 지시를 분리하고 RLS 검증 후 Realtime을 연결한다.
Reason: UI 숨김만으로 비밀 미션은 보호되지 않는다.
Alternatives: 모든 미션을 브라우저로 전달한 뒤 필터링.
Consequences: 실제 multiplayer 전에 2인 이상 인증 세션으로 접근 제어를 테스트해야 한다.

## DEC-006 — 기록과 협업
Decision: Claude가 Orchestrator, repo 문서가 공유 맥락의 원천이다. 분석 이벤트는 sink를 주입한다.
Reason: 모델 기억이나 외부 analytics 서비스에 초기 개발이 종속되지 않게 한다.
Alternatives: 대화에만 결정 기록, 즉시 외부 분석 서비스 도입.
Consequences: 에이전트는 STATUS/DECISIONS를 갱신해야 한다. 실제 분석 저장소는 아직 없다.
