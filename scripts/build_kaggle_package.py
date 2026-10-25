#!/usr/bin/env python3
"""
Kaggle 提交包 JSON 格式转换器
================================================================================
为什么需要这个脚本
--------------------------------------------------------------------------------
站点导出的 JSON 是「元数据标量 + rows 数组」的混合顶层结构：

    { "dataset": "...", "publisher": "...", "row_count": 196,
      "columns": [...], "rows": [ {...}, {...} ] }

这对人和程序都友好（口径说明和数据在一起），但**Kaggle 的 tabular 解析器处理不了**：
它读 JSON 时假设「顶层是等长数组的数组」或「顶层是每列等长的 dict」。
遇到顶层是 dict、且各 value 类型混杂（str / int / list）时会解析失败，
表现为前端报 `Failed to execute 'json' on 'Response': Unexpected end of JSON input`
（后端返回空响应，前端 JSON.parse 炸了）。

实测：2026-10-24 用原始 JSON 格式上传，Create 直接失败。

解决方案
--------------------------------------------------------------------------------
拆成两个文件：
  · <name>.json       → 纯表格数据，dict-of-columns 格式 {列名: [值...]}（每列等长）
                         这是 Kaggle 原生支持的 JSON 表格格式，能正常预览和查询
  · <name>.meta.json  → 元数据（口径说明、许可、年份语义、列清单）

信息一点不丢：元数据在 .meta.json 里，且会写进 Kaggle 的 Description。

⚠️ 站点自身的导出端点**不变**（仍是混合顶层结构）——
   那个格式对 API 消费者更友好，改了会破坏已有契约。
   只有 Kaggle 提交包用转换后的格式。

用法
--------------------------------------------------------------------------------
    python scripts/build_kaggle_package.py
"""
import json
import os
import ssl
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SUBMIT_DIR = os.path.join(ROOT, "data", "kaggle-submission")
HOST = "https://www.openlawprep.com"

# 从生产环境抓取 —— 保证上传的文件与用户下载到的完全一致（口径不漂移）
SOURCES = [
    ("/data/schools/csv/", "openlawprep-aba509-2025.csv"),
    ("/data/schools/json/", "openlawprep-aba509-2025.json"),
    ("/data/trend/csv/", "openlawprep-applicant-trends-2015-2025.csv"),
    ("/data/trend/json/", "openlawprep-applicant-trends-2015-2025.json"),
]

# 需要额外做 JSON 格式转换的（CSV 本身就是 Kaggle 最友好的格式，不用动）
JSON_BASES = [
    "openlawprep-aba509-2025",
    "openlawprep-applicant-trends-2015-2025",
]


def fetch(route, name):
    """从生产环境抓文件。代理环境下系统 CA bundle 可能失效，curl 走 Windows
    证书库所以能过，Python 需要显式降级。"""
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    req = urllib.request.Request(HOST + route, headers={"User-Agent": "Mozilla/5.0"})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=60, context=ctx) as r:
                data = r.read()
            if len(data) > 100:
                with open(os.path.join(SUBMIT_DIR, name), "wb") as f:
                    f.write(data)
                return data
        except Exception as e:
            if attempt == 3:
                raise
    return None


def convert_json(base):
    """把「元数据 + rows」的混合顶层转成 Kaggle 能解析的 dict-of-columns，
    元数据另存 .meta.json。"""
    path = os.path.join(SUBMIT_DIR, f"{base}.json")
    with open(path, encoding="utf-8") as f:
        old = json.load(f)

    meta = {k: v for k, v in old.items() if k not in ("rows", "columns")}
    rows = old["rows"]
    cols = old["columns"]

    # dict-of-columns：{列名: [值...]}，每列严格等长
    col_data = {c: [r.get(c) for r in rows] for c in cols}
    lengths = {len(v) for v in col_data.values()}
    assert len(lengths) == 1, f"{base}: 列长度不一致 {lengths}"

    with open(path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(col_data, f, ensure_ascii=False, separators=(",", ":"))

    meta["columns"] = cols
    meta["row_count"] = len(rows)
    with open(os.path.join(SUBMIT_DIR, f"{base}.meta.json"), "w",
              encoding="utf-8", newline="\n") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)

    return len(cols), len(rows), len(meta)


def main():
    os.makedirs(SUBMIT_DIR, exist_ok=True)

    print("▶ 1/3 从生产环境抓取文件")
    for route, name in SOURCES:
        data = fetch(route, name)
        print(f"   {name:50s} {len(data):>8,} bytes")

    print()
    print("▶ 2/3 转换 JSON 为 Kaggle 兼容格式（dict-of-columns + 独立 meta）")
    for base in JSON_BASES:
        cols, rows, meta_fields = convert_json(base)
        print(f"   {base}.json  → {cols} 列 × {rows} 行")
        print(f"   {base}.meta.json → {meta_fields} 个元数据字段")

    print()
    print("▶ 3/3 校验")
    ok = True

    # Kaggle 的字段长度限制（踩过坑：subtitle 超 80 字符会显示错误）
    # title 上限 50，subtitle 上限 80，description 无明确上限
    meta_path = os.path.join(SUBMIT_DIR, "datasets-metadata.json")
    with open(meta_path, encoding="utf-8") as f:
        kmeta = json.load(f)
    for field, limit in [("title", 50), ("subtitle", 80)]:
        n = len(kmeta.get(field, ""))
        if n > limit:
            print(f"   ✗ {field} {n} 字符，超过 Kaggle 上限 {limit}")
            ok = False
        else:
            print(f"   ✓ {field} {n} 字符（上限 {limit}）")

    for base in JSON_BASES:
        with open(os.path.join(SUBMIT_DIR, f"{base}.json"), encoding="utf-8") as f:
            d = json.load(f)
        if not isinstance(d, dict):
            print(f"   ✗ {base}.json 顶层不是 dict（Kaggle 仍会失败）")
            ok = False
            continue
        lengths = {len(v) for v in d.values()}
        if len(lengths) != 1:
            print(f"   ✗ {base}.json 列长度不一致 {lengths}")
            ok = False
            continue
        print(f"   ✓ {base}.json  {len(d)} 列 × {list(lengths)[0]} 行，顶层为 dict")

    for name in ["openlawprep-aba509-2025.csv", "openlawprep-applicant-trends-2015-2025.csv"]:
        import csv
        with open(os.path.join(SUBMIT_DIR, name), encoding="utf-8") as f:
            r = list(csv.DictReader(f))
        print(f"   ✓ {name:50s} {len(r)} 行 × {len(r[0])} 列")

    if not ok:
        raise SystemExit(1)
    print()
    print("✅ 提交包就绪")


if __name__ == "__main__":
    main()
