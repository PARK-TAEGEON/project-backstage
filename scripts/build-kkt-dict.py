#!/usr/bin/env python3
"""
쿵쿵따 사전 만들기 — 표준국어대사전 XML에서 '한글 세 글자' 단어만 뽑는다 (KKT 스펙 K-1).

  git clone --depth 1 https://github.com/spellcheck-ko/korean-dict-nikl-stdict stdict
  python3 scripts/build-kkt-dict.py stdict apps/server/dict/stdict-3syl.tsv.gz

출력: gzip TSV, 한 줄에 `단어<TAB>짧은 뜻`. 단어 기준 정렬, 중복(동형어)은 첫 뜻 하나만.
정규화: NFC → 한글 음절이 아닌 글자(붙임표 -, 띄어쓰기 표시 ^, 어깨번호, 기호, 공백) 제거 → 정확히 3음절만.
범위: word_unit이 '단어'인 표제어 전체 (방언·옛말·북한어·고유 명사·용언 포함, 품사 제한 없음).
      구·관용구·속담은 단어가 아니라서 뺀다.
"""
import glob
import gzip
import html
import re
import sys
import unicodedata
import xml.etree.ElementTree as ET

src, out = sys.argv[1], sys.argv[2]
three = re.compile(r'^[가-힣]{3}$')
words: dict[str, str] = {}
for f in sorted(glob.glob(f'{src}/*.xml')):
    for item in ET.parse(f).getroot().iter('item'):
        wi = item.find('word_info')
        if wi is None or (wi.findtext('word_unit') or '').strip() != '단어':
            continue
        w = re.sub(r'[^가-힣]', '', unicodedata.normalize('NFC', wi.findtext('word') or ''))
        if not three.match(w) or w in words:
            continue
        d = ''
        for s in wi.iter('sense_info'):
            d = (s.findtext('definition') or '').strip()
            break
        d = html.unescape(re.sub(r'<[^>]+>', '', d)).replace('\t', ' ').replace('\n', ' ').strip()
        d = re.split(r'(?<=[.])\s', d)[0]
        words[w] = d[:47] + '…' if len(d) > 48 else d

data = ''.join(f'{w}\t{words[w]}\n' for w in sorted(words)).encode()
with gzip.open(out, 'wb', 9) as fh:
    fh.write(data)
print(f'{len(words)} words → {out}')
