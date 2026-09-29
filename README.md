# Project Backstage

사람들이 채팅만으로 함께 놀고 웃는 소셜 파티게임을 빠르게 실험하는 웹 프로젝트. 사람은 출연자, AI는 필요한 순간에만 개입하는 제작진이다.

현재 이 저장소는 **기획·운영 문서만** 담고 있다 (2026-09-29, DEC-11). 이전의 Next.js 부트스트랩 코드(로비 미리보기, SD·EK 게임 정의, AI 연동 뼈대, 테스트·CI)는 커밋 `7ee494f`의 기록에 남아 있으며, 첫 배치 리뷰 후 새 게임 목록에 맞춰 구현을 다시 시작한다.

Claude 작업 지침은 루트 [CLAUDE.md](CLAUDE.md)를 따른다.

## 읽는 순서
- [현재 상태와 출처](docs/context/00-STATUS.md)
- [1. 헌법 / 제품 철학](docs/context/01-CONSTITUTION.md)
- [2. 개발 규칙 / MVP](docs/context/02-DEVELOPMENT-MVP.md)
- [3. 로비 / 분류 체계](docs/context/03-LOBBY-TAXONOMY.md)
- [4. 카탈로그 운영 / 지속 검수](docs/context/04-CATALOG-POLICY.md)
- [5. QA — ASTRA(치명 문제) → 사람 테스트](docs/context/05-QA-PIPELINE.md)
- [6. 확장 가능성](docs/context/06-EXPANSION.md)
- [7. 미정 / 추후 결정](docs/context/07-OPEN-DECISIONS.md)
- [8. UI 참고 메모](docs/context/08-UI-NOTES.md)
- [9. 공통 판정·진행 규약](docs/context/09-ENGINE-RULES.md)
- [리뷰 기록](docs/context/reviews/)
- [살아있는 게임 카탈로그](docs/context/catalog/INDEX.md)
- [게임 스펙 템플릿](docs/context/templates/GAME-SPEC.md)
- [리뷰 / 실험 기록 템플릿](docs/context/templates/REVIEW.md)
- [리뷰 프롬프트 (ASTRA / FABLE)](docs/context/templates/REVIEW-PROMPTS.md)

상태 구분: **확정** = 현재 사용자 요청 또는 명시적 의사. **방향** = 원대화의 설계 제안. **운영 규약** = 이번 문서에서 이를 실행 가능하게 정리한 절차. **미정** = 구현 전에 결정할 항목.

