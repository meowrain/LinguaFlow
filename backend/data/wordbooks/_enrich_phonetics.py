"""
给词书 JSON 补充音标 (uk_phonetic, us_phonetic)。

数据来源: Youdao 公开 jsonapi (无需 API 密钥)
  - ukphone: 英式音标
  - usphone: 美式音标

用法:
  python _enrich_phonetics.py <wordbook.json> [--limit N] [--workers 8] [--delay 0.3]

示例:
  python _enrich_phonetics.py ielts_essential.json
  python _enrich_phonetics.py cet4_core_2500.json --workers 10

脚本会增量执行: 已有 uk_phonetic 和 us_phonetic 的词条自动跳过。
进度每 100 词保存一次，可中断后继续。
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) LinguaFlow-Enrich/1.0",
    "Referer": "https://dict.youdao.com/",
}


def fetch_phonetics(word: str) -> tuple[str, str, str]:
    """从 Youdao 公开 jsonapi 拿英式/美式音标。返回 (word, ukphone, usphone)。"""
    dicts_param = json.dumps(
        {"count": 1, "dicts": [["ec"]]},
        separators=(",", ":"),
    )
    url = (
        "https://dict.youdao.com/jsonapi?"
        + urllib.parse.urlencode({"q": word, "dicts": dicts_param})
    )
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except Exception:
        return word, "", ""

    ec = data.get("ec") or {}
    words = ec.get("word") or []
    if words:
        ukphone = (words[0].get("ukphone") or "").strip()
        usphone = (words[0].get("usphone") or "").strip()
        return word, ukphone, usphone
    return word, "", ""


def enrich_one_wordbook(path: Path, limit: int, workers: int, delay: float) -> int:
    doc = json.loads(path.read_text(encoding="utf-8"))
    entries = [e for u in doc["units"] for e in u["entries"]]
    print(f"{path.name}: 共 {len(entries)} 词, limit={limit}, workers={workers}")

    # 收集待处理词条 (两个音标都空的)
    pending = []
    for entry in entries:
        if len(pending) >= limit:
            break
        uk = entry.get("uk_phonetic", "").strip()
        us = entry.get("us_phonetic", "").strip()
        if uk and us:
            continue
        pending.append(entry)

    if not pending:
        print(f"  {path.name}: 无需处理")
        return 0

    print(f"  待处理: {len(pending)} 词")

    processed = 0
    dirty = False
    last_save = 0

    batch_size = workers * 2
    for batch_start in range(0, len(pending), batch_size):
        batch = pending[batch_start:batch_start + batch_size]

        with ThreadPoolExecutor(max_workers=workers) as pool:
            fut_to_entry = {
                pool.submit(fetch_phonetics, entry["word"]): entry
                for entry in batch
            }
            for fut in as_completed(fut_to_entry):
                entry = fut_to_entry[fut]
                word = entry["word"]
                try:
                    _, uk, us = fut.result()
                except Exception:
                    continue

                changed = False
                if uk and not entry.get("uk_phonetic", "").strip():
                    entry["uk_phonetic"] = uk
                    changed = True
                if us and not entry.get("us_phonetic", "").strip():
                    entry["us_phonetic"] = us
                    changed = True

                if changed:
                    dirty = True
                processed += 1

        total_done = batch_start + len(batch)
        if dirty and total_done - last_save >= 100:
            path.write_text(json.dumps(doc, ensure_ascii=False, indent=2), encoding="utf-8")
            print(f"  -- 已保存进度 ({total_done}/{len(pending)} 词)")
            last_save = total_done

        if batch_start + batch_size < len(pending):
            time.sleep(delay)

    if dirty:
        path.write_text(json.dumps(doc, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"最终保存: {processed} 个词条已补充 ({path.name})")
    return processed


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("file", type=Path)
    ap.add_argument("--limit", type=int, default=99999)
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--delay", type=float, default=0.3)
    args = ap.parse_args()

    if not args.file.exists():
        print(f"文件不存在: {args.file}")
        return 1

    enrich_one_wordbook(args.file, args.limit, args.workers, args.delay)
    return 0


if __name__ == "__main__":
    sys.exit(main())
