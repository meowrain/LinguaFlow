"""
批量给词书补例句和搭配。

数据来源:Youdao 公开 jsonapi (无需 API 密钥)
  - 例句:blng_sents_part (双语句对)
  - 搭配:web_trans (网络短语,key 字段)

用法:
  python _enrich_examples.py <wordbook.json> [--limit N] [--delay 0.35]

示例:
  python _enrich_examples.py cet4_core_2500.json --limit 500
  python _enrich_examples.py cet6_core_2500.json --limit 500
  python _enrich_examples.py kaoyan_core_5500.json --limit 200

脚本会增量执行:例句和搭配都齐了的词条自动跳过。进度每 50 词保存一次,
可中断后继续。
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

COLLOC_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) LinguaFlow-Enrich/1.0",
    "Referer": "https://dict.youdao.com/",
}


def strip_html(s: str) -> str:
    return re.sub(r"<[^>]+>", "", s).strip()


def fetch_examples_and_collocations(word: str, max_examples: int = 2, max_coll: int = 5) -> tuple[list[dict], list[str]]:
    """从 Youdao 公开 jsonapi 拿双语例句 + 网络短语(搭配)。"""
    dicts_param = json.dumps(
        {"count": max(max_examples * 2, max_coll * 2), "dicts": [["ec", "blng_sents_part"], ["ec", "web_trans"]]},
        separators=(",", ":"),
    )
    url = (
        "https://dict.youdao.com/jsonapi?"
        + urllib.parse.urlencode({"q": word, "dicts": dicts_param})
    )
    req = urllib.request.Request(url, headers=COLLOC_HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        print(f"  [youdao] {word} 请求失败: {e}")
        return [], []

    # 例句
    pairs = (data.get("blng_sents_part") or {}).get("sentence-pair") or []
    examples: list[dict] = []
    for p in pairs[:max_examples]:
        en = strip_html(p.get("sentence-eng") or "")
        zh = strip_html(p.get("sentence-translation") or "")
        if en and zh:
            examples.append({"en": en, "zh": zh})

    # 搭配:web_trans 中的 key 字段(过滤掉单词本身、过长短语、含中文的)
    colls: list[str] = []
    wt = data.get("web_trans") or {}
    for item in wt.get("web-translation") or []:
        key = (item.get("key") or "").strip()
        if not key:
            continue
        if key.lower() == word.lower():
            continue
        if len(key) > 60 or any("\u4e00" <= c <= "\u9fff" for c in key):
            continue
        if len(key.split()) < 2:
            continue
        colls.append(key)
        if len(colls) >= max_coll:
            break

    return examples, colls


def enrich_one_wordbook(path: Path, limit: int, delay: float) -> int:
    doc = json.loads(path.read_text(encoding="utf-8"))
    entries = [e for u in doc["units"] for e in u["entries"]]
    print(f"{path.name}: 共 {len(entries)} 词, limit={limit}, delay={delay}s")

    processed = 0
    dirty = False
    last_save = 0

    for entry in entries:
        if processed >= limit:
            break
        # 跳过已补充的(例句 + 搭配都齐了才算完成)
        if entry.get("examples") and entry.get("collocations"):
            continue

        word = entry["word"]
        print(f"[{processed+1}/{min(limit, len(entries))}] {word}")

        examples, colls = fetch_examples_and_collocations(word, max_examples=2, max_coll=5)
        if not entry.get("examples"):
            entry["examples"] = examples
            dirty = True
        if not entry.get("collocations") and colls:
            entry["collocations"] = colls
            dirty = True

        processed += 1
        time.sleep(delay)

        if dirty and processed - last_save >= 50:
            path.write_text(json.dumps(doc, ensure_ascii=False, indent=2), encoding="utf-8")
            print(f"  -- 已保存进度 ({processed} 词)")
            last_save = processed

    if dirty:
        path.write_text(json.dumps(doc, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"最终保存: {processed} 个词条已补充 ({path.name})")
    return processed


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("file", type=Path)
    ap.add_argument("--limit", type=int, default=100)
    ap.add_argument("--delay", type=float, default=0.35)
    args = ap.parse_args()

    if not args.file.exists():
        print(f"文件不存在: {args.file}")
        return 1

    enrich_one_wordbook(args.file, args.limit, args.delay)
    return 0


if __name__ == "__main__":
    sys.exit(main())
