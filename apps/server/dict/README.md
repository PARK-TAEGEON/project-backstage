# 쿵쿵따 사전 데이터

`stdict-3syl.tsv.gz` — 한글 세 글자 단어 96,217개와 짧은 뜻 (gzip TSV: `단어<TAB>뜻`).

| 항목 | 값 |
|---|---|
| 원본 | 국립국어원 **표준국어대사전** XML 내려받기본 (표제어 434,240개, 사전 빌드 2019-06-25) |
| 가져온 곳 | https://github.com/spellcheck-ko/korean-dict-nikl-stdict (커밋 `3bac283`) |
| 스냅샷 버전 | `stdict-2019-06-25` — 서버가 게임 화면에 이 값을 표시한다 |
| 만드는 법 | `scripts/build-kkt-dict.py` (정규화·범위 규칙은 스크립트 주석) |
| 라이선스 | **CC BY-SA 2.0 KR** (저작자표시-동일조건변경허락). 이 파일(가공 데이터)도 같은 조건으로 배포한다. 출처: 국립국어원 표준국어대사전 |

- 게임 코드의 라이선스와는 별개다. 이 폴더의 데이터 파일에만 CC BY-SA가 적용된다.
- 게임 화면 하단에 출처를 표시한다 (“사전: 국립국어원 표준국어대사전 · CC BY-SA 2.0 KR”).
- 최신 사전으로 바꾸려면 새 XML로 스크립트를 다시 돌리고 스냅샷 버전을 `apps/server/src/games/kkt/dictionary.ts`의 `DICT_VERSION`에 반영한다.
