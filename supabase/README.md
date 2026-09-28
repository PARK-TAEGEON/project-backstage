# Supabase 연결 준비

현재 migration이나 원격 프로젝트 변경은 없다. 실제 키 없이 로비를 실행할 수 있다.

1. Supabase 프로젝트를 준비한다.
2. .env.example을 .env.local로 복사하고 URL/publishable key를 채운다.
3. 다음 multiplayer 작업에서 anonymous sign-in을 켜고 세션 복구를 구현한다.
4. Room, Player, GameSession, PrivateInstruction, DirectorEvent, Message, Vote, GameResult에 대응하는 migration을 작성한다. GameDefinition은 코드에 둔다.
5. RLS/정책을 먼저 구현한다. 익명 사용자가 속하지 않은 방을 읽거나 쓸 수 없어야 하며 개인 지시는 해당 수신자만 읽는다.
6. 시작/투표/재게임은 서버 권한 검증과 transaction을 사용한다. 준비 상태를 다른 참가자가 수정할 수 없어야 한다.
7. 허용한 공개 테이블에만 필요한 Realtime publication/구독을 설정한다. 비밀 지시를 공개 채널에 방송하지 않는다.
8. 별도 사용자 2명과 방 밖 사용자로 RLS, Reveal 전 비밀 차단, 재접속, 중복 요청을 검증한다.

src/lib/supabase/client.ts의 factory는 설정이 없으면 명확한 오류를 낸다. 현재 UI는 이를 호출하지 않는다. 키를 설정하는 것만으로 멀티플레이가 활성화되지는 않는다.
브라우저에는 publishable key만 사용한다. service role/secret key를 NEXT_PUBLIC 변수에 넣지 않는다. 실제 서버 client는 auth/session 설계와 함께 추가한다.
