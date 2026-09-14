#!/usr/bin/env python3
"""Rebuild the committed import samples using only Python's standard library."""
from pathlib import Path

target = Path(__file__).with_name("fixtures")
target.mkdir(exist_ok=True)
csv = "이기정,,총장,한양대학교\r\n김민수,,부총장,한양대학교"
tsv = "이기정\t한양대학교\t총장\n김민수\t한양대학교\t부총장"
for filename, text, encoding in [
    ("utf8.csv", csv, "utf-8"),
    ("utf8-bom.csv", csv, "utf-8-sig"),
    ("cp949.csv", csv, "cp949"),
    ("euc-kr.csv", csv, "euc-kr"),
    ("utf8-lf.tsv", tsv, "utf-8"),
    ("utf8-crlf.tsv", tsv.replace("\n", "\r\n"), "utf-8"),
    ("cp949-lf.tsv", tsv, "cp949"),
    ("cp949-crlf.tsv", tsv.replace("\n", "\r\n"), "cp949"),
    ("cp949-extended.csv", "갂뷁힣,한양대학교,총장", "cp949"),
    ("quoted-utf8.csv", '"이,기정","한양""대학교",총장\r\n김민수,,부총장', "utf-8"),
    ("quoted-cp949.csv", '"이,기정","한양""대학교",총장\r\n김민수,,부총장', "cp949"),
]:
    (target / filename).write_bytes(text.encode(encoding))
