import type { GameDefinition } from "@/lib/game/types";

export const everybodyKnows = {
  id: "everybody-knows-except-you",
  title: "Everybody Knows Except You",
  tagline: "잠깐, 나만 모르는 거 있어?",
  description: "한 명만 모르는 비밀 규칙. 친구들의 이상한 반응 속에서 숨겨진 상황을 알아내세요.",
  minPlayers: 4,
  maxPlayers: 8,
  durationSeconds: 480,
  maxDirectorEvents: 2,
  rules: ["한 명을 제외한 모두가 같은 비밀 규칙을 받아요.", "대화 중 규칙에 맞춰 함께 반응해요.", "대상 플레이어가 상황을 추리하고 정답을 공개해요."],
  phases: ["lobby", "playing", "guessing", "reveal", "results"],
  promptContext: "대상 한 명에게 비밀 규칙을 노출하지 않는다. 나머지 플레이어에게 동일한 가벼운 행동 지시를 준다. 대상이 추론할 단서를 만들고 모욕이나 배제를 유도하지 않는다.",
  resultPolicy: "대상의 최종 추리를 숨겨진 규칙과 비교한다. 승패보다 함께 웃은 순간을 요약하며 대상에게 굴욕적인 평가를 하지 않는다.",
} as const satisfies GameDefinition;
