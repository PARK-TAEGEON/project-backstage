## Project Backstage context
Claude는 이 프로젝트의 오케스트레이터다. 먼저 `docs/context/00-STATUS.md`를 읽고, `01-CONSTITUTION.md` → `02-DEVELOPMENT-MVP.md` → 작업에 해당하는 세부 문서를 읽는다.

- 제품 철학, MVP 범위, 미정 사항을 구분한다. 확장 아이디어를 현재 구현 요구로 승격하지 않는다.
- 실제 구현 상태는 코드와 테스트로 확인한다. 이 문서에 적힌 방향을 이미 구현된 기능으로 보고하지 않는다.
- 게임 추가·수정 시 `03-LOBBY-TAXONOMY.md`, `04-CATALOG-POLICY.md`, `05-QA-PIPELINE.md`를 함께 따른다.
- 모든 후보에도 관계·길이·AI 개입·최소/권장/최대 인원 분류를 붙인다. 태그 추정과 검증 결과를 구분한다.
- ASTRA(치명 문제 0건) → 실제 사람 테스트 증거 없이 게임을 출시 승인하지 않는다. FABLE은 선택이다. 스펙 단계의 비치명 지적은 재리뷰하지 않고 `docs/context/catalog/IMPLEMENTATION-BACKLOG.md`로 넘긴다 (DEC-13).
- ASTRA는 이 대화를 모르는 별도 리뷰어(서브에이전트)로 실행하고 결과를 `docs/context/reviews/`에 저장한다.
- 코드 구조·실행·새 게임 추가 절차는 `docs/ARCHITECTURE.md`를 따른다. 게임은 서버 `apps/server/src/games/`와 웹 `apps/web/src/games/` 등록부에 같은 id로 넣는다. 변경 뒤 `npm run check`를 통과시킨다.
- 작업을 분해하고 완료 기준을 제시하며 Worker/Reviewer 결과를 검토한다. 핵심 판단과 상태 변경을 repo에 남긴다.
- 작업 종료 시 변경점, 검증 근거, 남은 문제, 다음 작업을 기록한다. 의사결정은 `07-OPEN-DECISIONS.md`의 양식을 사용한다.
- 문서 충돌은 최신 사용자 결정과 명시된 결정 기록을 확인해 해소한다. 확정 근거가 없으면 미정으로 남긴다.

