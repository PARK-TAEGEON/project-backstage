# Architecture

## 현재 구현
Next.js App Router + TypeScript + Tailwind CSS. 브라우저 UI는 로컬 React 상태만 사용한다. Supabase client factory는 준비됐지만 실제 연결/인증/테이블/Realtime 구독은 없다. AI는 provider 계약, Zod schema 검증, fixture mock만 있다. 유료 LLM 호출은 없다.

## 폴더 경계
| 경로 | 책임 |
| --- | --- |
| src/app | 페이지, 메타데이터, 전역 스타일 |
| src/components | 로비 미리보기 |
| src/config/brand.ts | 표시 이름과 설명 |
| src/lib/game | 도메인 타입, 시작 조건, 순수 상태 전이 |
| src/games/{game-id} | config, rules, prompt context, phase 순서, 결과 정책 |
| src/lib/ai | 업체 독립 계약, JSON 검증, mock, 서버 진입점 |
| src/prompts/{role} | 역할별 프롬프트 |
| src/lib/supabase | 지연 초기화되는 브라우저 client |
| src/lib/analytics | 이벤트 계약과 주입 가능한 sink |
| supabase | 다음 단계 연결 체크리스트 |

## 도메인
Room은 방/호스트/선택 게임을 갖고 Player는 방 참가자다. 재게임마다 새로운 GameSession을 만든다. GameDefinition은 게임별 설정이다. PrivateInstruction은 수신자에게만, DirectorEvent는 공개 개입, Message는 대화, Vote는 추측, GameResult는 최종 요약이다.
Player.id는 향후 인증된 사용자에 연결된 서버 발급 식별자다. 현재 타입 정의가 DB 스키마를 대신하지는 않는다.

## 예정 데이터 흐름 — 아직 미구현
브라우저 → 익명 Auth → 서버 command/RPC → Postgres transaction → 권한 있는 Realtime 구독 → 화면.
서버가 호스트 권한, 참가자 수, Ready, 세션 phase, 마감 시간을 검증한다. 클라이언트 시계/ID를 신뢰하지 않는다. 중복 시작·투표·재게임은 idempotency/transaction으로 막는다.

Realtime은 알림과 빠른 표시용이다. DB snapshot이 진실의 원천이며 재접속 시 다시 가져온다. Presence는 온라인 표시만 담당하고 방 소속 권한을 대신하지 않는다. 타이머와 게임 종료는 클라이언트가 모두 끊겨도 서버에서 진행 가능하도록 다음 구현에서 수단을 결정한다.

## 공개/비공개 경계
공개 방 데이터와 PrivateInstruction을 별도 테이블/조회로 분리한다. 공개란 인터넷 전체가 아니라 해당 방 멤버에게 공개라는 뜻이다. RLS는 인증된 방 멤버만 허용하고 개인 지시는 수신자만 조회한다. UI에서 숨기기만 하는 방식은 금지한다.
Reveal 시 서버가 공개 가능한 지시의 snapshot을 생성한다. 상대 미션을 Reveal 전 내려보내지 않는다. room code는 초대 수단이며 인증을 대신하지 않는다. 가입 endpoint에 코드 추측 제한을 둔다.

## 최소 engine
현재 nextPhase는 GameDefinition의 phase 순서를 순회하는 순수 함수다. getStartBlocker는 4–8명/중복/Ready 조건을 검사한다. 서버 명령 처리기나 scheduler는 아직 없다. 게임별 결과 정책도 실행 코드가 아닌 문서화된 계약이다.
공통 phase: lobby → playing → guessing → reveal → results. Play Again은 results에서 새 session을 만들고 Ready와 비밀 지시를 초기화하는 별도 명령으로 구현한다.

## AI layer
서버 코드 → getAIProvider → generateStructured → AIProvider.generateJSON → Zod parse.
새 업체 adapter는 AIProvider 계약을 구현하고 서버 factory에서 선택한다. key/model/timeout은 adapter의 서버 설정으로 둔다. SDK 객체를 게임 코드에 노출하지 않는다. 현재 mock은 주어진 fixture만 복제하며 추론하지 않는다.
시작 1회 mission batch, 진행 중 director 최대 2회, 선택적 묶음 referee, 종료 1회 editor를 기본 예산으로 한다. Social Analyst는 필요할 때 이벤트 검토와 묶는다. 프롬프트 지시만으로 호출 예산을 보장할 수 없으므로 실제 서버 orchestration에서 카운터/timeout/최대 1회 retry/중복 방지를 구현한다.
문자열 일치·횟수는 deterministic 판정부터 구현한다. LLM의 모호한 판정은 unresolved로 남긴다. JSON schema는 구조만 검증하므로 수신자 집합, 대상 누락/중복, 실제 evidence ID, game별 미션 수 등 의미 검증은 서버에서 별도로 추가해야 한다.
실제 adapter 연결 전 timeout, 실패 시 고정 미션 fallback, prompt injection, transcript 길이 제한을 테스트한다. 비공개 프롬프트/채팅/키를 로그에 출력하지 않는다.

## Analytics
room_created, player_joined, game_started, game_completed, play_again_clicked, invite_link_copied, game_abandoned, result_shared를 정의했다.
이벤트는 UUID, UTC 발생 시간, room/session/game ID, 선택적 참가자 수를 갖는다. 실제 sink/저장은 미구현이며 UI 미리보기는 이벤트를 발행하지 않는다. 서버의 상태 변경 성공 시 기록하고 event id로 중복 제거한다.
game_abandoned는 일시적 연결 해제와 구분해 서버 유예 시간 이후 정의해야 한다. result_shared는 공유 성공 또는 링크 복사 성공으로 정의하고 클릭만으로 세지 않는다.

## 공식 참고
- [Next.js 설치](https://nextjs.org/docs/app/getting-started/installation)
- [Supabase client 초기화](https://supabase.com/docs/reference/javascript/initializing)
- [Supabase API 키](https://supabase.com/docs/guides/getting-started/api-keys)
