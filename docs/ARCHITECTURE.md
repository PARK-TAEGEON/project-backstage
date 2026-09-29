# 구조 / 개발 안내

프로토타입의 기초 구조와 “새 미니게임을 넣는 법”을 정리한다. 제품 방향은 [docs/context](context/)가 원본이다.

## 한눈에 보기

```text
packages/shared/        서버·웹이 함께 쓰는 타입과 규칙
  src/game.ts           게임 메타(분류 체계, AI 여부, 입력 방식, 플랫폼)
  src/room.ts           방 규칙(인원·방 라운드·등장 게임·게임별 설정), 순위→점수
  src/avatar.ts         아바타 설정과 닉네임 검증
  src/protocol.ts       Socket.IO 이벤트 규약
  src/analytics.ts      관찰 이벤트·통계 형식
apps/server/            실시간 서버 (Node + Socket.IO, 모든 판정은 서버)
  src/room.ts           방: 로비·방장 설정·매치 진행·채팅·재접속
  src/games/types.ts    게임 모듈 규약 (GameInstance)
  src/games/registry.ts 게임 등록부
  src/games/nunchi/     눈치게임
  src/games/forbes/     포브스
  src/games/kkt/        쿵쿵따 (두음법칙 표 hangul.ts, 사전 로더 dictionary.ts)
  dict/                 쿵쿵따 사전 데이터 (표준국어대사전 세 글자, CC BY-SA — README 참고)
  src/analytics.ts      이벤트 저장(JSONL)과 통계 계산
  test/                 단위 테스트 (가짜 시계로 시간 판정 검증)
apps/web/               웹 화면 (React + Vite)
  src/theme/tokens.css  디자인 토큰 — 색·글꼴·간격은 여기서만 바꾼다
  src/content/ko.ts     화면 문구 모음
  src/config/brand.ts   서비스 이름
  src/ui/               공통 부품 (아바타, 전광판, 채팅, 설정 패널 …)
  src/screens/          화면 (입장, 대기실, 경기, 관리자)
  src/games/            게임별 화면 + 등록부
scripts/e2e-smoke.mjs   브라우저 4개로 한 매치(눈치게임→포브스→쿵쿵따)를 끝까지 돌리는 스모크 테스트
scripts/build-kkt-dict.py  표준국어대사전 XML → 쿵쿵따 사전 파일
```

## 실행

```sh
npm install
npm run dev          # 서버(3001) + 웹(5173) 동시 실행 → http://localhost:5173
npm run check        # 타입 검사 + 단위 테스트
npm run build && npm start   # 배포 모드: 서버가 빌드된 웹까지 제공 → http://localhost:3001
```

- **Windows에서 가장 쉬운 방법:** 저장소 폴더의 `start-backstage.bat`를 더블클릭 → 처음 한 번 패키지 설치 → 빌드 → 서버 실행 → 브라우저에서 http://localhost:3001 이 열린다. 창을 닫으면 서버가 꺼진다. Node.js 22 이상 필요.
- 관리자 관찰 화면: `/admin`. `ADMIN_TOKEN` 환경 변수를 설정하면 토큰을 입력해야 볼 수 있다 (배포 시 필수).
- 관찰 데이터는 `data/events.jsonl`에 쌓인다 (`DATA_DIR`로 변경).
- 스모크 테스트: 서버를 `PORT=3999`로 띄운 뒤 `BASE_URL=http://localhost:3999 npm run e2e`. 캡처는 `e2e-artifacts/`.

## 방과 매치의 흐름

```text
입장(닉네임·캐릭터) → 방 만들기/입장 → 대기실(방장이 규칙 설정, 다른 사람은 준비)
  → [전광판: 게임 이름·한 줄 규칙] → 게임 진행 → [게임 결과: 순위와 방 점수]
  → … 방 라운드 수만큼 반복 …
  → 최종 순위 → 방장 “한 판 더” → 대기실
```

- **방 라운드** = 이번 매치에서 할 **게임의 개수**. 게임 안의 라운드(예: 눈치게임 3라운드)는 각 게임 설정이다.
- 방장이 바꿀 수 있는 것: 최대 인원(3~8), 방 라운드(1~10), 등장 게임, 순서(랜덤/목록). 방을 만들 때(팝업)와 대기실 안에서 바꿀 수 있다. **게임 내부 규칙은 바꿀 수 없다** (DEC-15) — 게임 `meta.settings`는 비워 두고, 규칙 값은 게임 코드의 상수(`NUNCHI_RULES` 등)로 둔다.
- **점수 합산 (DEC-14):** 게임마다 점수 체계가 달라서, 각 게임의 **최종 순위를 점수로 바꿔** 더한다. N명이면 1위 N점 … 꼴찌 1점, 공동 순위는 높은 점수를 함께 받는다.
- 인원이 3명 미만이 되면 다음 게임을 시작하지 않고 최종 순위로 간다 (09-ENGINE-RULES 4절).
- 연결이 끊기면 10초 유예 뒤 이탈 확정. 그 전에 같은 탭에서 다시 연결하면 그대로 이어진다.

## 새 미니게임 추가하기

1. **스펙 먼저:** `docs/context/catalog/games/<ID>.md`에 스펙을 쓰고 ASTRA(치명 문제)를 통과시킨다 (05-QA-PIPELINE).
2. **서버:** `apps/server/src/games/<id>/index.ts`
   - `meta: GameMeta` — 분류(관계·길이·AI·인원), `inputs`, `platforms`, 전광판용 `tagline`. `settings`는 빈 배열 (게임 규칙은 방에서 바꾸지 않음, DEC-15).
   - `create(ctx) → GameInstance` — `start`, `onAction`, (채팅이 입력이면) `onChat`, `onPlayerLeft`, `view`.
   - 시간은 `ctx.now()`·`ctx.setTimer()`만 쓴다 (테스트에서 가짜 시계로 돌릴 수 있게).
   - **비밀 정보는 `view(playerId)`에서 볼 권한이 있는 사람에게만 넣는다.** 서버는 view를 플레이어별로 따로 보낸다.
   - 끝나면 `ctx.end({ ranking, headlines })` — 순위만 주면 방 점수 합산은 플랫폼이 한다.
3. **등록:** `apps/server/src/games/registry.ts`의 `GAMES`에 추가 → 로비 목록·방 설정 UI·관리자 통계에 자동으로 나타난다.
4. **화면:** `apps/web/src/games/<id>/View.tsx`를 만들고 `apps/web/src/games/registry.tsx`에 등록. 채팅이 입력이면 `chatIsInput: true`.
5. **테스트:** `apps/server/test/`에 규칙 테스트를 추가 (가짜 시계 `FakeClock` 사용).

## 확장을 위해 미리 잡아 둔 것

| 요청 | 지금 구조 | 확장할 때 |
|---|---|---|
| AI 없는 게임 구분 / Roblox | `meta.ai`와 `meta.platforms`. `isRobloxCandidate(meta)` = `ai === 'none'`. “Roblox 후보”는 내부 참고용이라 관리자 화면(/admin)과 `/api/catalog`에만 표시, 플레이어 화면에는 없음 | Roblox 쪽은 게임 규칙(스펙)과 meta를 공유하고 구현은 따로. 웹 QA 승인을 그대로 복사하지 않는다 (06-EXPANSION) |
| 아바타 | `AvatarConfig`(색·표정·머리 장식) + `Avatar` 컴포넌트 하나로 모든 화면에 그림 | 파츠 추가는 `avatar.ts` 옵션 배열에 항목만 추가. 움직이는 아바타 게임은 `inputs: ['avatar']`로 표시하고 게임 화면에서 캔버스/3D를 쓰면 된다 |
| 채팅 외 입력 | `inputs: chat / vote / text / avatar`, 게임 전용 입력은 `game:action` | 새 입력 방식도 `onAction`으로 받는다 |
| 관찰 데이터 | 이벤트 JSONL + `/admin` 통계 (인원별 매치 수, 게임별 완주율·평균 시간·인원 분포, 재플레이율, 이탈 단계) | 저장소를 DB로 바꿀 때는 `EventSink` 구현만 교체 |
| UI/UX 수정 | 폰트(`fonts.css` + `--font-*` 토큰, 08-UI-NOTES), 토큰(`tokens.css`), 문구(`content/ko.ts`), 브랜드(`config/brand.ts`)를 한곳에서 관리. 화면별 CSS Module | 테마를 바꾸려면 토큰 값만, 문구는 ko.ts만 수정 |

## 개인정보

관찰 이벤트에는 닉네임·채팅 내용을 넣지 않는다. 방·매치·플레이어는 무작위 ID만 쓴다 (OPEN-11). 채팅은 서버 메모리에만 있고(방당 최근 100개) 방이 닫히면 사라진다.
