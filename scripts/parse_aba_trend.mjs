// ============================================================================
// ABA 历年申请数据 → 合并为趋势数据集
//
// 输入：data/aba/ 下由 download_aba.mjs 下载的历年 xlsx
//       （文件名形如 2022-2022-fall-fyclass-applicant-and-enrollee.xlsx）
// 输出：data/aba/applicant-trend.json  —— 按学校 × 年份 的申请/录取/入学数
//
// 为什么需要：站点现有 schools.json 只有 2025 单年，无法回答
//  "录取率是在升还是降""入学人数十年变化" 这类趋势问题。
//  趋势类内容是 E-E-A-T 最有说服力的形态之一，且竞品（exhibit509.com）
//  只摆单年数字不做跨年对比。
//
// ⚠️ 口径警告（写文章时必须遵守）：
//   · 1L applicant/class data 的"年份"是该届入学年，不是报告发布年。
//   · ABA 历年文件里学校名写法有变化（"&" vs "and"、逗号位置），
//     合并时按 slug 对齐，未匹配的学校单独列出，不要静默丢弃。
//   · 部分年份文件含分州/多表结构，需要按表头关键词定位列，不能硬编码列号。
//
// 用法：node scripts/parse_aba_trend.mjs
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire("C:/Users/jhliu/.workbuddy/binaries/node/workspace/");
const XLSX = require("xlsx");

const ABA_DIR = path.resolve("data/aba");
const OUT = path.join(ABA_DIR, "applicant-trend.json");
const SCHOOLS = path.resolve("site/data/schools.json");

const schools = JSON.parse(fs.readFileSync(SCHOOLS, "utf8"));

// ---------- 学校名归一化：把 ABA 的各种写法映射到 schools.json 的 slug ----------
function normalizeName(raw) {
  return String(raw || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[,\u2019']/g, "")            // 去逗号/撇号
    .replace(/[–—]/g, "-")
    // ⚠️ 顺序很关键：先把 "university of" 归一，再删 "the"。
    // 反过来会留下 "alabama the university of"（the 没被后面的规则吃掉），
    // 导致与 ABA 2018+ 的 "ALABAMA, UNIVERSITY OF"（无 the）匹配不上。
    .replace(/\bthe\b/g, "")
    .replace(/\bthe\s+/g, " ")
    .replace(/\buniv(ersity)?\b/g, "university")
    .replace(/\bcollege\b/g, "college")
    .replace(/\bschool\b/g, "school")
    .replace(/\bof\b/g, "of")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ABA 历史文件用旧校名 / 全大写写法，schools.json 用现行名。
// 只收录能**确认**对应关系的映射 —— 宁可留未匹配，也不要错配污染趋势数据。
// 未匹配的会记进 unmatchedNames，便于事后审查。
const ALIASES = {
  // 更名（Mississippi College 于 2026-06-01 更名 Mississippi Christian University）
  "mississippi college": "mississippi-college",

  // ABA 用"城市,  大学"式旧写法（如 "ALABAMA, UNIVERSITY OF"），
  // 与现行 "Alabama, The University of" 指同一所学校
  "alabama university of": "alabama",
  "akron university of": "akron",
  "arizona university of": "arizona",
  "arkansas fayetteville university of": "arkansas",
  "arkansas little rock university of": "arkansas-at-little-rock",
  "chicago university of": "chicago",
  "kansas university of": "kansas",
  "memphis university of": "memphis",
  "mississippi university of": "mississippi",
  "new mexico university of": "new-mexico",
  "ohio state university": "the-ohio-state-university",
  "texas at austin university of": "texas",
  "toledo university of": "toledo",
  "tulsa university of": "tulsa",
  "utah university of": "utah",
  "washington university": "washington-university-st-louis",
  "catholic university of america": "catholic-america",
  "city university of new york": "city-new-york",
  "george washington university": "george-washington-university",
  "lewis and clark college": "lewis-clark-law-school",
  "buffalo university at": "buffalo-university-at",
  "southern illinois university carbondale": "southern-illinois-university",
  "st thomas university florida": "st-thomas-university-miami",
  "st thomas university of minnesota": "st-thomas-minneapolis",
  "unt dallas college of law": "north-texas-at-dallas",
  "albany law school of union university": "albany-law-school",
  "chicago kent college of law iit": "chicago-kent-illinois-institute-of-technology",
  "pennsylvania state dickinson law": "penn-state-dickinson-law",
  "john marshall law school": "atlanta-s-john-marshall-law-school",
  "touro college": "touro-university",
  "pontifical catholic university of p r": "pontifical-catholic-puerto-rico",
  "university of massachusetts dartmouth": "massachusetts-dartmouth",

  // ⚠️ 以下学校**故意不映射**（schools.json 当前 ABA 名单里查无此校，
  //    多为已关闭 / 合并 / 改名，强行映射会污染趋势数据）：
  //   CALIFORNIA-HASTINGS→? · GOLDEN GATE→? · WESTERN MICHIGAN→?
  //   MCGEORGE SCHOOL OF LAW→? · FLORIDA COASTAL（已关闭）· PENN STATE MAIN?
  //   它们会留在 unmatchedNames 里供人工审查。
};

// 精确匹配优先；再尝试"去掉 school of law / law school"等后缀
const byNorm = new Map();
const byLoose = new Map();
for (const s of schools) {
  const full = normalizeName(s.name);
  if (!byNorm.has(full)) byNorm.set(full, s.slug);
  const loose = full
    .replace(/\blaw school\b/g, "")
    .replace(/\bcollege of law\b/g, "")
    .replace(/\bschool of law\b/g, "")
    .trim();
  if (loose && !byLoose.has(loose)) byLoose.set(loose, s.slug);
}
function matchSchool(raw) {
  const n = normalizeName(raw);
  if (ALIASES[n]) return ALIASES[n];
  if (byNorm.has(n)) return byNorm.get(n);
  const loose = n.replace(/\b(law school|college of law|school of law)\b/g, "").trim();
  if (ALIASES[loose]) return ALIASES[loose];
  if (byLoose.has(loose)) return byLoose.get(loose);
  // 再宽松：双方都只留字母数字比较
  const sq = (x) => x.replace(/[^a-z]/g, "");
  for (const [k, v] of byNorm) if (sq(k) === sq(n)) return v;
  return null;
}

// 列名匹配：只在单个单元格文本上匹配，不跨行拼接。
// 历年 ABA 文件的列名并不一致，需覆盖多种写法：
//   2018+ : "Total Applications" / "Total Offers" / "Total Enrollees"
//   2017:   "1L Applicants"     / "1L Offers"    / "1L Enrollees"
//   2016:   "1L Applicants"     / "1L Admits"    / "1L Matriculants"
//   2015:   "1L apps"/"1L admits"/"1L matriculants"
const COLS = {
  applications: [
    /^total\s+applications?$/i, /^applications?$/i, /^applicants?$/i,
    /^1l\s+applicants?$/i, /^1l\s+apps$/i, /^#\s*applic/i,
  ],
  matriculants: [
    /^total\s+enrollees?$/i, /^enrollees?$/i, /^matriculants?$/i,
    /^total\s+matriculants?$/i, /^1l\s+enrollees?$/i, /^1l\s+matriculants?$/i,
  ],
  admits: [
    /^total\s+offers?$/i, /^offers?$/i, /^admits?$/i,
    /^1l\s+offers?$/i, /^1l\s+admits?$/i,
  ],
  deferred: [/deferred/i],
  lsat25: [/^total\s+25(th)?\s*percentile$/i, /^25(th)?\s*percentile$/i],
  lsat50: [/^total\s+50(th)?\s*percentile$/i, /^50(th)?\s*percentile$/i, /^median$/i],
  gpa25: [/^total\s+25(th)?\s*percentile$/i, /^25(th)?\s*percentile$/i],
  gpa50: [/^total\s+50(th)?\s*percentile$/i, /^50(th)?\s*percentile$/i, /^median$/i],
};

// ABA 用**两级表头**：
//   r4: ["School List", null, null, "UGPA Data by Percentiles", ...]
//   r5: [null, "Total Applications", "Total Offers", "Total Enrollees", ...]
//   r6: ["Akron, The University of", 762, 446, 199, ...]  ← 数据从这行开始
// 所以真正的列名行是**分组行下面那一行**，而且它前面可能有 null（学校名列表头
// 在上一行）。因此策略：逐行尝试当表头，要求能定位到 applications/matriculants 之一，
// 且数据行数量够多才算命中。
function tryHeader(rows, idx) {
  const header = rows[idx] || [];
  // 合并"上一行 + 当前行"的文本，处理 "UGPA Data by Percentiles" + "Total 75th percentile"
  const merged = header.map((h, i) => {
    const prev = (rows[idx - 1] || [])[i];
    const a = String(prev ?? "").trim();
    const b = String(h ?? "").trim();
    return a && b ? `${a} ${b}` : b || a;
  });
  const cols = mapColumns(merged);
  return cols;
}

function mapColumns(header) {
  const idx = {};
  header.forEach((h, i) => {
    const t = String(h || "").trim();
    if (!t) return;
    for (const [key, pats] of Object.entries(COLS)) {
      if (idx[key] !== undefined) continue;
      if (pats.some((p) => p.test(t))) { idx[key] = i; break; }
    }
  });
  return idx;
}

function num(v) {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).replace(/[$,\s]/g, "").replace(/[^\d.\-]/g, "");
  if (!s || s === "-" || s === "N/A") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// ---------- 主流程 ----------
const files = fs
  .readdirSync(ABA_DIR)
  .filter((f) => /\.xlsx$/i.test(f))
  .filter((f) => /applicant|matriculant|enrollee/i.test(f))
  .sort();

if (files.length === 0) {
  console.error("data/aba/ 下没有 applicant 类文件。先运行 download_aba.mjs --kinds applicant");
  process.exit(1);
}

console.log(`找到 ${files.length} 个 applicant 类文件\n`);

// trend[slug][year] = {applications, matriculants, lsat50, gpa50}
const trend = {};
const unmatched = new Map(); // 原始名 -> 出现次数
const perYear = {};

for (const f of files) {
  // 年份前缀识别：兼容 `{年份}-{原名}` 与 `{年份}_{原名}` 两种格式。
  // ABA 2017 及更早的文件名用下划线（如 2017_fall_1l_applicant_and_enrollee.xlsx），
  // 2018 起用连字符，所以两种都要认。
  const ym = f.match(/^(\d{4})[-_]/);
  if (!ym) { console.log(`  跳过（文件名无年份前缀）: ${f}`); continue; }
  const year = Number(ym[1]);
  if (year < 2015 || year > 2026) { console.log(`  跳过（年份超出范围）: ${f}`); continue; }

  let wb;
  try { wb = XLSX.readFile(path.join(ABA_DIR, f)); } catch (e) {
    console.log(`  ✗ 读取失败 ${f}: ${String(e).slice(0, 70)}`);
    continue;
  }

  // 取行数最多的 sheet（有些文件首sheet 是封面说明）
  let rows = [];
  for (const sn of wb.SheetNames) {
    const r = XLSX.utils.sheet_to_json(wb.Sheets[sn], {
      header: 1, raw: true, defval: null,
    });
    if (r.length > rows.length) rows = r;
  }
  if (!rows || rows.length < 20) {
    console.log(`  ✗ ${f}: 无有效数据行`);
    continue;
  }

  // 逐行尝试定位表头：要求能找到 applications 或 matriculants 列，
  // 且其下方有足够多的"学校名 + 数字"数据行
  let data = null;
  for (let r = 0; r < Math.min(rows.length, 30) && !data; r++) {
    const cols = tryHeader(rows, r);
    if (cols.applications === undefined && cols.matriculants === undefined) continue;

    // 学校名列：取"含文字学校名"的那一列。
    // 通常是第 0 列，但 2015 文件第 0 列全空、校名在第 1 列，
    // 且其右侧可能隔着null（r4: [null,"SCHOOL",null,"1L apps",...]），
    // 所以不能要求"紧邻的下一列是数字"，改为"该行存在任意数字列"。
    let nameIdx = -1;
    for (let rr = r + 1; rr < rows.length; rr++) {
      const row = rows[rr] || [];
      const hasNumber = row.some((c) => typeof c === "number");
      if (!hasNumber) continue;
      for (let c = 0; c < Math.min(5, row.length); c++) {
        const v = String(row[c] ?? "").trim();
        if (
          v.length > 8 &&
          /univers|law|college|school/i.test(v) &&
          !/^\d/.test(v)
        ) {
          nameIdx = c;
          break;
        }
      }
      if (nameIdx >= 0) break;
    }
    if (nameIdx < 0) continue;

    const body = rows.slice(r + 1).filter((row) => {
      const v = String(row?.[nameIdx] ?? "").trim();
      return v.length > 3 && /univers|law|college|school/i.test(v);
    });
    if (body.length < 20) continue;
    data = { rows, headerRow: r, nameIdx, cols, body };
  }

  if (!data) {
    console.log(`  ✗ ${f}: 未能定位表头`);
    continue;
  }

  let nOk = 0, nMiss = 0;
  for (const row of data.body) {
    const rawName = row[data.nameIdx];
    if (rawName == null || !String(rawName).trim()) continue;
    const slug = matchSchool(rawName);
    if (!slug) {
      unmatched.set(String(rawName).trim(), (unmatched.get(String(rawName).trim()) || 0) + 1);
      nMiss++;
      continue;
    }
    const rec = (trend[slug] ||= {});
    const y = (rec[year] ||= {});
    const ap = num(row[data.cols.applications]);
    const mt = num(row[data.cols.matriculants]);
    const off = data.cols.admits != null ? num(row[data.cols.admits]) : null;
    if (ap != null) y.applications = ap;
    if (mt != null) y.matriculants = mt;
    if (off != null) y.offers = off;
    nOk++;
  }

  const yrs = new Set(Object.values(trend).flatMap((r) => Object.keys(r).map(Number)));
  perYear[year] = (perYear[year] || 0) + nOk;
  console.log(
    `  ✓ ${f}\n      表头行 ${data.headerRow} | 匹配 ${nOk} 校，未匹配 ${nMiss}，列映射: ${JSON.stringify(data.cols)}`
  );
}

const out = {
  generatedAt: new Date().toISOString(),
  source: "ABA 1L JD Applicant / First-Year Class Data (annual, 2015–2025 cycles)",
  note:
    "Year = entering class year. applications = applicants to the 1L class; " +
    "matriculants = enrolled 1L students. Some cycles use different source columns.",
  years: Object.fromEntries(
    Object.entries(perYear).sort((a, b) => Number(a[0]) - Number(b[0]))
  ),
  unmatchedNames: [...unmatched.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 80)
    .map(([n, c]) => ({ name: n, count: c })),
  trend,
};

fs.writeFileSync(OUT, JSON.stringify(out, null, 2));

const schoolsWithData = Object.keys(trend).length;
const totalCells = Object.values(trend).reduce(
  (p, r) => p + Object.keys(r).length, 0
);
console.log(`\n${"=".repeat(56)}`);
console.log(`学校数: ${schoolsWithData} / ${schools.length}`);
console.log(`年份覆盖: ${Object.keys(perYear).join(", ")}`);
console.log(`数据点: ${totalCells}`);
console.log(`未匹配名称: ${unmatched.size} 个（见 JSON 的 unmatchedNames）`);
console.log(`输出: ${path.relative(process.cwd(), OUT)}`);

// 完整性提示
const need = schools.length;
if (schoolsWithData < need * 0.9) {
  console.warn(
    `\n⚠️ 仅 ${schoolsWithData}/${need} 所学校匹配到数据。` +
    ` 可能是 ABA 文件里学校名写法与 schools.json 差异较大，需要扩充 normalizeName()。`
  );
}