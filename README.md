# Project Backstage

친구 4–8명이 웹 브라우저에서 같은 방에 접속하고 AI 제작진이 웃긴 상황을 만드는 채팅 파티게임 실험.

> 핵심 가설: 친구 4–8명이 들어와 AI 때문에 웃긴 상황이 발생한다.

**인간 90 / AI 10.** AI는 뒤에서 미션과 판을 만들고 인간들이 대화를 이끈다.

## 현재 범위
- Next.js + TypeScript + Tailwind 실행 기반과 반응형 한국어 로비 UI shell
- 두 게임 선택, 닉네임/코드 입력 검증, 로컬 Ready 토글
- 공통 게임 타입/시작 조건/상태 전이, 두 게임의 정의
- Supabase client 연결 준비, 업체 독립 AI 계약/JSON 검증/mock
- 이벤트 로깅 계약, 협업 문서, 테스트/CI

**현재 화면은 로컬 미리보기다.** 실제 방 생성/입장, 초대 링크, 익명 인증, Realtime 채팅, 미션 배정, 게임 진행/Reveal/결과/재게임은 다음 단계다. API 키 없이 화면이 뜨며 AI 호출 비용은 발생하지 않는다.

## 개발 환경과 실행
Node.js 22 이상 (검증 환경 24), npm, Git. 실제 multiplayer 구현 때 Supabase 프로젝트가 필요하다.

```sh
npm ci
npm run dev
```

[로컬 화면](http://localhost:3000)을 연다. 환경 설정은 선택 사항이다. .env.example을 .env.local로 복사한 뒤 필요할 때 채운다. 현재는 AI_PROVIDER=mock만 지원하며 Supabase 키만 설정해도 multiplayer가 켜지지는 않는다.

```sh
npm run check   # lint + 타입 검사 + 경계 테스트
npm run build   # 프로덕션 빌드
npm start      # 빌드 결과 실행
```

## 주요 구조
```text
src/
  app/                          페이지와 스타일
  components/lobby-shell.tsx    로컬 로비 미리보기
  config/brand.ts               표시 이름 (변경 가능)
  games/
    secret-director/            게임 설정·규칙·프롬프트 맥락·결과 정책
    everybody-knows-except-you/
  lib/
    game/                       공통 도메인과 순수 helper
    ai/                         provider·schema·mock·서버 factory
    supabase/                   지연 초기화 client
    analytics/                  이벤트 계약과 sink
  prompts/                      director·mission·referee·editor·social-analyst
supabase/                       연결 준비 체크리스트
tests/                          게임 경계·AI 응답 검증
docs/                           제품·구조·결정·실험·현재 상태
```

게임 하나의 정의는 아직 작아서 각 폴더의 index.ts에 모았다. 실제 실행 로직이 커질 때만 분리한다.
임시 이름은 src/config/brand.ts에서 관리한다. NEXT_PUBLIC_APP_NAME으로 표시 이름을 덮어쓸 수 있다. package 이름/원격 저장소 이름은 배포 식별자이며 별도로 변경한다.

## 협업 시작점
Claude가 Orchestrator 역할을 맡고 Worker/Reviewer는 한정된 구현·검증을 수행한다. 공통 규칙은 [AGENTS.md](AGENTS.md), Claude 진입점은 [CLAUDE.md](CLAUDE.md)다.

- [제품 철학과 범위](docs/PRODUCT.md)
- [아키텍처와 미구현 경계](docs/ARCHITECTURE.md)
- [게임 디자인](docs/GAME_DESIGN.md)
- [설계 결정](docs/DECISIONS.md)
- [플레이테스트 기록](docs/EXPERIMENTS.md)
- [현재 상태와 다음 작업](docs/STATUS.md)

실제 API key/secret은 커밋하지 않는다. .env.example만 추적하고 로컬 환경 파일은 무시한다. 브라우저 공개 변수에 service role/LLM key를 넣지 않는다.
