/**
 * 쿵쿵따 사전 — 서버에 둔 세 글자 단어 목록 (apps/server/dict/README.md).
 * 게임 중에는 외부 API를 부르지 않는다. 처음 쓸 때 한 번 읽어 메모리에 둔다 (약 20만 단어).
 * 표준국어대사전 + 우리말샘 (DEC-19). 우리말샘에만 있는 단어는 뜻 앞에 〔우리말샘〕을 붙인다.
 */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

export const DICT_VERSION = 'stdict-2026-06-05+opendict-2026-06-02';
export const DICT_CREDIT = '사전: 국립국어원 표준국어대사전·우리말샘 · CC BY-SA 2.0 KR';

export interface KktDictionary {
  readonly version: string;
  readonly size: number;
  has(word: string): boolean;
  definition(word: string): string | undefined;
  /** 이 음절로 시작하는 단어 목록 */
  startingWith(syl: string): readonly string[];
  /** 무작위 단어 하나 (시작 글자 뽑기용) */
  randomWord(rand: () => number): string;
  /** 단어의 첫 글자로 쓰이는 음절 전체 */
  syllables(): Iterable<string>;
}

export function buildDictionary(entries: Iterable<[string, string]>, version = DICT_VERSION): KktDictionary {
  const defs = new Map<string, string>();
  const byStart = new Map<string, string[]>();
  for (const [w, d] of entries) {
    if (defs.has(w)) continue;
    defs.set(w, d);
    const first = w[0]!;
    const list = byStart.get(first);
    if (list) list.push(w);
    else byStart.set(first, [w]);
  }
  const all = [...defs.keys()];
  return {
    version,
    size: defs.size,
    has: (w) => defs.has(w),
    definition: (w) => defs.get(w),
    startingWith: (s) => byStart.get(s) ?? [],
    randomWord: (rand) => all[Math.floor(rand() * all.length)] ?? '',
    syllables: () => byStart.keys(),
  };
}

const DEFAULT_PATH = fileURLToPath(new URL('../../../dict/kkt-3syl.tsv.gz', import.meta.url));

export function loadDictionaryFile(path = DEFAULT_PATH): KktDictionary {
  const text = gunzipSync(readFileSync(path)).toString('utf8');
  const entries: [string, string][] = [];
  for (const line of text.split('\n')) {
    if (!line) continue;
    // 단어<TAB>출처(s|u)<TAB>뜻
    const [w, src, def = ''] = line.split('\t');
    if (!w) continue;
    entries.push([w, src === 'u' ? `〔우리말샘〕 ${def}` : def]);
  }
  return buildDictionary(entries);
}

let cached: KktDictionary | null = null;

/** 기본 사전. 읽기에 실패하면 예외를 던진다 → 게임은 경기 중단으로 처리 (K-3 사전 장애). */
export function defaultDictionary(): KktDictionary {
  if (!cached) cached = loadDictionaryFile();
  return cached;
}
