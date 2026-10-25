// ============================================================================
// ABA 2023 / 2024 申请数据下载器
//
// 背景：
//   data/aba/applicant-trend.json 里的趋势序列缺 2023、2024 两年，
//   原因是**本地从未下载过这两年的 1L 申请表**，不是上游没数据。
//   缺口让序列从 2015–2022 + 2025 变成不连续的 9 个点：
//     · 2021 的申请量异常（全国 35.8万 → 45.4万，+27%）无法被正确框定
//     · 任何「十年变化」的表述都不成立
//   补齐后是 2015–2022 + 2023 + 2024 + 2025 共 11 个连续点，
//   才能诚实地做「申请量十年变化」这类可被引用的结论。
//
// 关键约束（沿用 download_aba_extra.mjs 的踩坑记录）：
//   1. americanbar.org 有 Cloudflare 托管挑战，**curl/wget 直接 403**
//      （带 UA 和 Referer 也一样，实测 2026-10-24），
//      必须用真实浏览器会话（playwright，有头模式）触发原生下载。
//   2. 下载触发方式：page.goto(href) 会直接渲染 xlsx → 用 waitForEvent('download')
//      在点击 <a download> 链接时捕获。
//   3. 文件名不能拼 URL：ABA 目录按**发布年**分，链接文字才是**数据年**。
//      本脚本直接用已确认的完整 URL，不做拼接。
//
// 用法：
//   node scripts/download_aba_trend_gap.mjs           # 只下载缺失的
//   node scripts/download_aba_trend_gap.mjs --force   # 强制重下
// ============================================================================
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire("C:/Users/jhliu/.workbuddy/binaries/node/workspace/");
const { chromium } = require("playwright-core");

const OUT = path.resolve("data/aba");
const FORCE = process.argv.includes("--force");

const BASE =
  "https://www.americanbar.org/content/dam/aba/administrative/legal_education_and_admissions_to_the_bar/statistics";

// 需要补齐的文件。full = 完整 URL（已从 ABA 统计页确认，不是拼接的），dest = 本地文件名。
const TARGETS = [
  {
    label: "2024 1L JD Applicant/First-Year Class Data",
    full: `${BASE}/2024/2024-fall-jd-applicant-and-enrollee-class-data.xlsx`,
    dest: "2024-fall-jd-applicant-and-enrollee-class-data.xlsx",
  },
  {
    label: "2023 1L JD Applicant/First-Year Class Data",
    full: `${BASE}/2023/2023-fall-jd-applicant-and-enrollee-class-data.xlsx`,
    dest: "2023-fall-jd-applicant-and-enrollee-class-data.xlsx",
  },
];

fs.mkdirSync(OUT, { recursive: true });

let browser = await chromium.launch({
  channel: "msedge",
  headless: false,
  args: ["--window-position=2200,2200"],
});
let ctx = await browser.newContext({
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0",
  viewport: { width: 1400, height: 950 },
  acceptDownloads: true,
});
let page = await ctx.newPage();

async function clearCloudflare(url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
  for (let i = 0; i < 30; i++) {
    const t = await page.title();
    if (!/moment|稍候|attention|just a moment/i.test(t)) return true;
    await page.waitForTimeout(3000);
  }
  return false;
}

async function download(target) {
  const dest = path.join(OUT, target.dest);
  if (fs.existsSync(dest) && !FORCE) {
    console.log(`  [SKIP] ${target.dest} 已存在`);
    return true;
  }
  console.log(`  [GET ] ${target.label}`);
  try {
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 90000 }),
      page.evaluate((href) => {
        const a = document.createElement("a");
        a.href = href;
        a.download = "";
        document.body.appendChild(a);
        a.click();
        a.remove();
      }, target.full),
    ]);
    await download.saveAs(dest);
    const sz = fs.statSync(dest).size;
    console.log(`  [OK  ] ${target.dest}  ${sz} bytes`);
    return true;
  } catch (e) {
    console.log(`  [FAIL] ${target.dest}: ${e.message.split("\n")[0]}`);
    return false;
  }
}

const STATS =
  "https://www.americanbar.org/groups/legal_education/accreditation/statistics";

console.log("打开 ABA 统计页并通过 Cloudflare 校验…");
const ok = await clearCloudflare(STATS);
if (!ok) {
  console.log("Cloudflare 校验未通过，退出。");
  await browser.close();
  process.exit(1);
}
console.log("Cloudflare 已通过。");

let failed = 0;
for (const t of TARGETS) {
  const r = await download(t);
  if (!r) failed++;
}

await browser.close();
console.log(failed ? `\n完成，${failed} 个失败` : "\n全部完成");
process.exit(failed ? 1 : 0);
