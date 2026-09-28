# 개발 에이전트 작업 지침

1. README.md → docs/PRODUCT.md → docs/ARCHITECTURE.md → docs/DECISIONS.md → docs/STATUS.md 순서로 읽는다.
2. Claude가 Orchestrator다. 우선순위, 작업 분해, 설계 변경, 통합 리뷰를 담당한다. Worker/Reviewer는 맡은 범위만 수행한다. 특정 모델의 기억에 의존하지 않는다.
3. 기준은 “친구 4–8명이 실제로 웃는지 검증하는 데 필요한가?”다. 플랫폼 기능이나 과도한 추상화를 먼저 만들지 않는다.
4. 공통 도메인은 src/lib/game, 게임 규칙은 src/games, 역할별 프롬프트는 src/prompts에 둔다.
5. 비밀 지시는 공개 room payload/Realtime 채널/로그에 넣지 않는다. AI 키와 실제 adapter는 서버에서만 사용한다.
6. LLM을 매 메시지마다 호출하지 않는다. 이벤트/판정 예산과 오류 처리는 서버에서 제한한다.
7. 브랜드명은 src/config/brand.ts에서 관리한다. 게임 ID, 테이블명, 내부 프로토콜에 브랜드명을 넣지 않는다.
8. 변경 뒤 npm run check와 npm run build를 수행한다. 동작 변경에 필요한 경계 테스트를 추가한다.
9. 결정은 docs/DECISIONS.md, 작업 결과/검증/다음 할 일은 docs/STATUS.md에 기록한다. 실제 실험만 EXPERIMENTS.md에 기록한다.
10. 현재 UI는 로컬 미리보기다. 실제 멀티플레이처럼 표현하거나 미리보기 동작을 실제 분석 이벤트로 기록하지 않는다.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
