# 게임 스펙 템플릿

템플릿 자체는 카탈로그 항목이 아니다. 아래 필드를 채운 후 등록한다. 인원·분류를 정할 근거가 약하면 가설로 명시하되 값은 빠뜨리지 않는다.

## 식별 / 분류
- id / name / version / batch_id:
- status: candidate | astra_passed | fable_passed | human_testing | approved | hold | rejected
- implementation_status: not_started | prototype | implemented | unknown
- platform / owner / updated_at:
- mode: individual | team | asymmetric_team (둘 다 가능하면 방식별로 별도 스펙)
- relationship: stranger | friends | both
- length: short | medium | long
- ai_intervention: none | low | high
- min_players:
- recommended_players: [정수 목록]
- max_players:
- player_constraints: 없음 또는 짝수/팀 구성 등의 제약
- estimated_duration_minutes / duration_scope(game 또는 pack):
- classification_basis: 출처와 가설/검증 여부
- validated_scope: 인원·관계·플랫폼별 실제 검증 범위
- optional_tags:

## 한 줄 경험 / 차별점
무엇을 하고 어떤 순간이 웃기거나 추리할 만한가? 기존 포맷과 어떤 규칙 차이가 있는가?

## 플레이 규칙
- setup: 역할·콘텐츠·초기 상태.
- private_info: 누가 무엇을 알고 누구에게 언제 공개되는가.
- round_flow: 단계, 입력, 시간, 전이 조건.
- actions: 각 참가자가 할 수 있는 행동.
- win_condition / scoring / ties:
- end_condition / timeout / no_response:
- reveal: 무엇을 어떤 순서로 공개하며 앞선 플레이와 어떻게 연결하는가.
- replay_variation:

## 구현 / 실패
- common_components:
- ai_call_points / AI 사용 이유:
- judgment_criteria / deterministic_rules:
- ai_failure_fallback:
- disconnect / reconnect / player_count_change:
- failure_cases / exploit_cases:
- social_risk / 소외 방지:
- three_player_check: min=3이면 역할·정보·동률·Reveal 성립 근거; 아니면 해당 없음과 이유.
- 기타 인원 제약:

## 검수 / 변경
- ASTRA: 버전·판정·리포트 링크
- FABLE: 버전·판정·리포트 링크
- Human: 빌드·조건·관찰·판정·리포트 링크
- known_issues / next_action:
- changelog: 날짜, 이전→새 버전, 변경, 재검수 범위

