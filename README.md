# ABA Law School Admissions Data 2015–2025

> Data published by the American Bar Association, cleaned and republished by
> **[OpenLawPrep](https://www.openlawprep.com)** — free, no signup, no paywall.
>
> Interactive database: https://www.openlawprep.com/schools/ ·
> Methodology: https://www.openlawprep.com/data-guide/ ·
> Citation formats: https://www.openlawprep.com/press/ ·
> Trend analysis: https://www.openlawprep.com/trends/

**Also on Kaggle** — [dataset](https://www.kaggle.com/datasets/tianen4niu/aba-law-school-admissions-data-2015-2025) ·
[notebook](https://www.kaggle.com/code/tianen4niu/aba-law-school-data-2015-2025-applications-54)
(the notebook reproduces the headline finding from these exact files)

Clean, structured, citable law school admissions data for all **196** ABA-approved
law schools, built from the ABA's own disclosure files.

- **196** law schools, **54** fields each (2025 entering class)
- **11** entering classes of applicant / offer / enrollment data (2015–2025), 2,020 school-year rows
- Every figure traceable to the school's original ABA filing
- No estimates, no third-party models, no sponsored placement

## Why this exists

Every number here was filed by the school itself with the American Bar
Association. The problem is that those filings are published as hundreds of
separate PDFs, which makes them impossible to compare, search, or reuse.

We parse them into a single structured dataset, publish the raw files so the
numbers can be checked against the source, and document every field's meaning
— including the ways the data is easy to misread.

## Files

| File | Shape | What it is |
|---|---|---|
| `data/openlawprep-aba509-2025.csv` | 196 rows × 54 cols | One row per law school, 2025 entering class |
| `data/openlawprep-aba509-2025.meta.json` | — | Metadata and measurement notes for the above |
| `data/openlawprep-applicant-trends-2015-2025.csv` | 2,020 rows × 6 cols | One row per school per entering class |
| `data/openlawprep-applicant-trends-2015-2025.meta.json` | — | Metadata and measurement notes for the above |

### Field groups in the 2025 snapshot

| Group | Fields |
|---|---|
| Identity | `slug`, `name`, `state`, `city` |
| Admissions | `applications`, `offers`, `enrollees`, `fy_class`, `acceptance_rate` |
| Test scores | `lsat_25/50/75`, `ugpa_25/50/75` |
| Cost | `tuition`, `tuition_nonresident`, `tuition_per_credit`, `tuition_basis`, `fees_ft`, `living_on_campus`, `living_off_campus` |
| Financial aid | `grant_pct_receiving`, `grant_ft_25/50/75`, `grant_band_lt_half_pct`, `grant_band_half_full_pct`, `grant_band_full_pct`, `grant_band_gt_full_pct` |
| Bar passage | `bar_first_time_takers`, `bar_first_time_passers`, `bar_first_time_rate`, `bar_ultimate_2023`, `bar_ultimate_2024` |
| Enrollment | `enroll_jd1_total`, `enroll_jd_total`, `enroll_nonjd_total`, `enroll_total` |
| Demographics | `gender_*`, `race_*` |

## How to read the data — the parts that trip people up

**A blank cell means the school did not report that field. It never means zero.**
Blank and `0` are different facts; conflating them produces wrong conclusions.
In the trend file, a school-year that was not reported is **absent entirely**
rather than zero-filled.

**Tuition has two reporting bases.** 164 schools report an annual full-time
figure; 32 report a per-credit rate and have no annual total. We never multiply
per-credit tuition by an assumed credit load — that assumption is a guess, and
guesses reorder rankings without changing any fact. `tuition` is null for the 32
per-credit schools; use `tuition_per_credit` and `tuition_basis` instead.

**Bar passage rates are not interchangeable.**

- `bar_first_time_rate` — first-time takers only (the strictest figure, and
  what most articles quote)
- `bar_ultimate_2023` / `bar_ultimate_2024` — everyone who started, within two
  years, including re-takes, for two different graduating cohorts

**Offer rate and yield rate answer different questions.**

- offer rate = `offers / applications` — the share of applicants offered a seat
- yield rate = `matriculants / offers` — the share of admitted students who
  enrolled

A school can have a healthy offer rate and still struggle to fill its class.

**The four aid bands do not reconcile exactly to `grant_pct_receiving`.** The
509 asks for four mutually exclusive bands, each rounded separately upstream,
so the sum can differ from the reported coverage rate by a point or two. We
publish both values as filed and do not force them to agree.

**`cond_offers` is a yes/no flag, not a count.** 60 of the 196 schools offer
conditional scholarships (renewal contingent on GPA or class rank beyond the
school's normal good academic standing).

## The headline finding

Across a fixed set of 180 schools that reported application counts in 2015:

| | 2015 | 2025 | Change |
|---|---|---|---|
| Applications | 316,319 | 486,718 | **+53.9%** |
| Offers | 133,676 | 124,830 | **−6.6%** |
| Offer rate | 42.3% | 25.6% | −16.7pp |
| Yield rate | 24.3% | 30.5% | **+6.2pp** |

The squeeze is not a story about schools admitting more people. It is a story
about more people applying to a roughly fixed number of seats — and yield rates
actually **rose**, meaning schools are not filling their seats more slowly.

Only 12 of the 178 schools with comparable data saw application counts fall.

**All year-to-year comparisons use a fixed school set**, because the number of
schools filing in any given year varies from 177 to 194. Comparing raw annual
totals would mix a real change with a change in who reported.

## Reproducing this

The scripts that turn the ABA's source files into these CSVs are in `scripts/`:

```bash
# 1. Download the ABA 1L applicant files (2015–2025)
node scripts/download_aba_trend_gap.mjs

# 2. Parse and merge them into the trend dataset
node scripts/parse_aba_trend.mjs

# 3. Regenerate the publishable files (fetch + format + verify)
#    (run from the project root — it also refreshes the Kaggle package)
python scripts/build_kaggle_package.py
```

`parse_aba_trend.mjs` contains the full alias table that maps the ABA's
inconsistent school names across eleven years of files onto stable slugs.

## Source

- American Bar Association, Standard 509 Required Disclosures (2025 reporting cycle)
- American Bar Association, 1L JD Applicant / First-Year Class Data (2015–2025 cycles)
- LSAC official score-conversion and percentile data

Original filings: https://www.abarequireddisclosures.org/

## License

MIT for the scripts and this repository's own documentation. The **data** is CC
BY 4.0 — the underlying figures are published by the American Bar Association;
this is an independent, non-commercial reorganization of publicly disclosed
information. Not affiliated with or endorsed by the ABA or any law school.
