#!/usr/bin/env python3
"""
쿵쿵따 사전 만들기 — 국립국어원 **표준국어대사전 + 우리말샘** XML에서 '한글 세 글자' 단어만 뽑는다 (KKT K-1, DEC-19).

  python3 scripts/build-kkt-dict.py apps/server/dict/kkt-3syl.tsv.gz [작업폴더]

원본: https://github.com/spellcheck-ko/korean-dict-nikl (국립국어원 내려받기본 미러, 커밋 고정)
  - stdict/   표준국어대사전 (빌드 2026-06-05)
  - opendict/ 우리말샘       (빌드 2026-06-02)
파일을 하나씩 내려받아 처리하고 지운다 (우리말샘 전체 약 1.9GB).

출력: gzip TSV, 한 줄에 `단어<TAB>출처<TAB>짧은 뜻`. 출처 s = 표준국어대사전, u = 우리말샘에만 있음.
정규화: NFC → 한글 음절이 아닌 글자(붙임표 -, 띄어쓰기 표시 ^, 어깨번호, 기호, 공백) 제거 → 정확히 3음절만.
범위: 단어 단위 표제어 전체 (표준: word_unit=단어, 우리말샘: word_unit=어휘). 방언·옛말·북한어·고유 명사·용언 포함.
      구·관용구·속담은 단어가 아니라서 뺀다. 예문은 오픈 라이선스가 아니므로 쓰지 않는다 (뜻풀이만).
"""
import gzip
import html
import os
import re
import sys
import unicodedata
import urllib.request
import xml.etree.ElementTree as ET

COMMIT = '42c0d01889f34536e9cf94fe57f62bd2055b1bde'
RAW = f'https://raw.githubusercontent.com/spellcheck-ko/korean-dict-nikl/{COMMIT}'
STDICT = [f'stdict/{n:06}.xml' for n in range(5000, 440001, 5000)]
OPENDICT = [f'opendict/{n:07}.xml' for n in range(50000, 1200001, 50000)] + ['opendict/1204559.xml']

out = sys.argv[1]
work = sys.argv[2] if len(sys.argv) > 2 else '/tmp/kkt-dict-build'
os.makedirs(work, exist_ok=True)
three = re.compile(r'^[가-힣]{3}$')


def clean_word(raw: str) -> str:
    return re.sub(r'[^가-힣]', '', unicodedata.normalize('NFC', raw or ''))


def short_def(d: str) -> str:
    d = html.unescape(re.sub(r'<[^>]+>', '', d or '')).replace('\t', ' ').replace('\n', ' ').strip()
    d = re.split(r'(?<=[.])\s', d)[0]
    return d[:47] + '…' if len(d) > 48 else d


def fetch(rel: str) -> str | None:
    path = os.path.join(work, rel.replace('/', '_'))
    if not os.path.exists(path):
        try:
            urllib.request.urlretrieve(f'{RAW}/{rel}', path)
        except Exception as e:  # 마지막 번호 파일은 없을 수 있다
            print('skip', rel, e)
            return None
    return path


words: dict[str, tuple[str, str]] = {}


def scan(rel: str, source: str):
    path = fetch(rel)
    if not path:
        return
    info_tag = 'word_info' if source == 's' else 'wordInfo'
    unit_ok = '단어' if source == 's' else '어휘'
    for _, item in ET.iterparse(path, events=('end',)):
        if item.tag != 'item':
            continue
        wi = item.find(info_tag)
        if wi is not None and (wi.findtext('word_unit') or '').strip() == unit_ok:
            w = clean_word(wi.findtext('word'))
            if three.match(w) and w not in words:
                d = ''
                for s in item.iter('sense_info' if source == 's' else 'senseInfo'):
                    d = s.findtext('definition') or ''
                    break
                words[w] = (source, short_def(d))
        item.clear()
    os.remove(path)
    print(rel, len(words), flush=True)


for rel in STDICT:
    scan(rel, 's')
n_std = len(words)
for rel in OPENDICT:
    scan(rel, 'u')

data = ''.join(f'{w}\t{s}\t{d}\n' for w, (s, d) in sorted(words.items())).encode()
with gzip.open(out, 'wb', 9) as fh:
    fh.write(data)
print(f'표준 {n_std} + 우리말샘에만 {len(words) - n_std} = {len(words)} → {out}')
