import type { GameDefinition } from "@/lib/game/types";

export const secretDirector = {
  id: "secret-director",
  title: "Secret Director",
  tagline: "평범한 대화, 수상한 친구들.",
  description: "각자 받은 비밀 미션을 자연스럽게 수행하세요. 누가 무슨 일을 꾸미는지, 끝까지 들키지 않도록!",
  minPlayers: 4,
  maxPlayers: 8,
  durationSeconds: 480,
  maxDirectorEvents: 2,
  rules: ["서로 다른 비밀 미션을 받아요.", "자유롭게 대화하며 미션을 수행해요.", "서로의 미션을 추측한 뒤 함께 공개해요."],
  phases: ["lobby", "playing", "guessing", "reveal", "results"],
  promptContext: "모든 플레이어에게 서로 다른 비밀 미션을 한 개씩 배정한다. 자연스러운 대화로 수행할 수 있고 관찰 가능한 미션을 만든다.",
  resultPolicy: "명시적 발화 조건은 규칙으로 판정한다. 맥락 판단은 증거 메시지를 함께 검토하고 불확실하면 unresolved로 남긴다. 투표는 추측이며 성공 판정이 아니다.",
} as const satisfies GameDefinition;
