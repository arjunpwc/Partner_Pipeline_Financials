#!/usr/bin/env python3
"""Build aggregated data/pipeline.json from local Excel extracts in data/raw/.

Raw files are never committed. Run from repo root:

    python scripts/build_data.py
"""

from __future__ import annotations

import json
import re
import sys
from datetime import datetime, timezone
from fnmatch import fnmatch
from pathlib import Path
import warnings

warnings.filterwarnings("ignore", message="Workbook contains no default style")

try:
    import pandas as pd
except ImportError:
    sys.stderr.write(
        "ERROR: pandas is required. Install with: python -m pip install pandas openpyxl\n"
    )
    sys.exit(1)

REPO_ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = REPO_ROOT / "data" / "raw"
OUT_PATH = REPO_ROOT / "data" / "pipeline.json"

DCM_SHEET = "DCM D&T Pipeline View"
PARTNER_SHEET = "Pipeline Partner View - OD&A Al"
HEADER_ROW = 11  # 0-indexed; Excel row 12

DCM_COLUMNS = [
    "Opportunity Name",
    "Product Name",
    "Product Code",
    "Stage",
    "Amount",
    "Close Date",
    "Created Date",
    "Opportunity Owner: Full Name",
    "Opportunity Lead: Full Name",
    "Industry Sector",
]

PARTNER_COLUMNS = [
    "Full Name",
    "Local LOS 2",
    "Stage",
    "Account Name: Account Name",
    "Opportunity Name",
    "Opportunity Lead: Full Name",
    "Amount",
    "Close Date",
    "Created Date",
    "Primary Campaign: Campaign Name",
    "Ultimate Parent Account: Industry",
    "Last Modified By: Full Name",
    "Last Modified Date",
    "Opportunity ID",
    "Lead Source",
    "PwC Legal Entity: Account Name",
]

OPEN_STAGES = {"Target", "Interact", "Propose", "Risk Initiated"}
AGING_STAGES = {"Target", "Interact", "Propose"}
WON_STAGE = "Won"
CLOSE_STAGE = "Close"

DCM_GLOB = "DCM_D_T_Pipeline_View*.xlsx"
PARTNER_GLOB = "Pipeline_Partner_View*.xlsx"
FOCUS_PRODUCT_CODES = ("USH16", "USH17", "USG18")
NO_DA_LABEL = "No D&A"
PRODUCT_BREAKDOWN_KEYS = FOCUS_PRODUCT_CODES + (NO_DA_LABEL,)

NAMED_RECON_PARTNERS = [
    "Sunil Warier",
    "Ajeetha Menezes",
    "Tojo Johnson",
    "Yeon Lee",
    "Brad Housour",
    "Saurabh Sarbaliya",
    "Satyen Popat",
    "Samir Mehta",
    "Rattan Singh",
    "Ken Becker",
    "Faisal Ghadially",
    "Jithendra Pai Brahmavar",
]


def fail(message: str, code: int = 1) -> None:
    sys.stderr.write(f"ERROR: {message}\n")
    sys.exit(code)


def slug(text: str) -> str:
    """Normalize punctuation/spaces to underscores, preserving glob wildcards."""
    protected = text.lower().replace("*", "\x00")
    slugged = re.sub(r"[^a-z0-9\x00]+", "_", protected).strip("_")
    return slugged.replace("\x00", "*")


def find_one_excel(raw_dir: Path, pattern: str, label: str) -> Path:
    if not raw_dir.is_dir():
        fail(f"{label} source folder is missing: {raw_dir}")

    pattern_slug = slug(pattern)
    matches: list[Path] = []
    for path in raw_dir.iterdir():
        if not path.is_file():
            continue
        if path.name.startswith("~$") or path.name.startswith("."):
            continue
        if path.suffix.lower() != ".xlsx":
            continue
        if fnmatch(slug(path.name), pattern_slug):
            matches.append(path)

    if not matches:
        fail(
            f"No {label} Excel file found in {raw_dir}. "
            f"Expected one file matching {pattern} "
            f"(spaces/punctuation in export names are ignored)."
        )
    if len(matches) > 1:
        names = ", ".join(p.name for p in sorted(matches))
        fail(
            f"Multiple {label} Excel files found in {raw_dir}: {names}. "
            "Leave only one matching export in data/raw/."
        )
    return matches[0]


def resolve_sheet(path: Path, expected: str) -> str:
    try:
        xl = pd.ExcelFile(path)
    except Exception as exc:  # noqa: BLE001
        fail(f"Could not read Excel workbook {path.name}: {exc}")
    names = xl.sheet_names
    if expected in names:
        return expected
    prefix = expected[:31]
    for name in names:
        if name == prefix or name.startswith(expected[:20]):
            return name
    fail(
        f"{path.name} is missing sheet {expected!r}. "
        f"Found: {', '.join(names) or '(none)'}"
    )
    return expected


def coerce_amount(series: pd.Series) -> pd.Series:
    if pd.api.types.is_numeric_dtype(series):
        return pd.to_numeric(series, errors="coerce").fillna(0.0)
    cleaned = (
        series.astype(str)
        .str.replace(r"[\$,]", "", regex=True)
        .str.strip()
        .replace({"": "0", "nan": "0", "None": "0", "NaT": "0"})
    )
    return pd.to_numeric(cleaned, errors="coerce").fillna(0.0)


def parse_dates(series: pd.Series) -> pd.Series:
    return pd.to_datetime(series, errors="coerce")


def clean_frame(df: pd.DataFrame, required: list[str], path: Path, sheet: str) -> pd.DataFrame:
    df = df.copy()
    df.columns = [str(c).strip() if pd.notna(c) else "" for c in df.columns]
    missing = [c for c in required if c not in df.columns]
    if missing:
        fail(
            f"{path.name} sheet {sheet!r} is missing expected columns: {', '.join(missing)}. "
            f"Found: {', '.join(df.columns)}"
        )
    out = df[required].copy()
    out = out.dropna(how="all")
    if "Opportunity Name" in out.columns:
        out["Opportunity Name"] = (
            out["Opportunity Name"].fillna("").astype(str).str.strip()
        )
        out = out[out["Opportunity Name"] != ""]
        summary_names = {"total", "grand total", "subtotal"}
        out = out[~out["Opportunity Name"].str.lower().isin(summary_names)]
    if "Amount" in out.columns:
        out["Amount"] = coerce_amount(out["Amount"])
    for col in ("Close Date", "Created Date", "Last Modified Date"):
        if col in out.columns:
            out[col] = parse_dates(out[col])
    for col in out.columns:
        if col in ("Amount", "Close Date", "Created Date", "Last Modified Date"):
            continue
        if out[col].dtype == object or pd.api.types.is_string_dtype(out[col]):
            out[col] = out[col].apply(
                lambda v: v.strip() if isinstance(v, str) else v
            )
    return out.reset_index(drop=True)


def read_excel_table(path: Path, sheet: str, required: list[str]) -> pd.DataFrame:
    try:
        df = pd.read_excel(path, sheet_name=sheet, header=HEADER_ROW, dtype=object)
    except Exception as exc:  # noqa: BLE001
        fail(f"Could not read {path.name} sheet {sheet!r}: {exc}")
    return clean_frame(df, required, path, sheet)


def money(value) -> float:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return 0.0
    return round(float(value), 2)


def text_or_blank(value) -> str:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return ""
    try:
        if pd.isna(value):
            return ""
    except (TypeError, ValueError):
        pass
    text = str(value).strip()
    if text.lower() in {"nan", "none", "nat"}:
        return ""
    return text


def iso_date(value) -> str | None:
    if value is None or pd.isna(value):
        return None
    ts = pd.Timestamp(value)
    if pd.isna(ts):
        return None
    return ts.date().isoformat()


def group_stage_totals(df: pd.DataFrame) -> list[dict]:
    if df.empty:
        return []
    grouped = (
        df.groupby("Stage", dropna=False)
        .agg(count=("Amount", "size"), amount=("Amount", "sum"))
        .reset_index()
        .sort_values("amount", ascending=False)
    )
    rows = []
    for _, row in grouped.iterrows():
        stage = row["Stage"]
        rows.append(
            {
                "stage": "" if pd.isna(stage) else str(stage),
                "count": int(row["count"]),
                "amount": money(row["amount"]),
            }
        )
    return rows


def fy_label_for(today: pd.Timestamp) -> str:
    """PwC FY label from the July start year, e.g. Jul 2026 → FY26."""
    start, _ = fiscal_year_bounds(today)
    return f"FY{start.year % 100:02d}"


def fiscal_year_bounds(today: pd.Timestamp) -> tuple[pd.Timestamp, pd.Timestamp]:
    if today.month >= 7:
        start = pd.Timestamp(year=today.year, month=7, day=1)
    else:
        start = pd.Timestamp(year=today.year - 1, month=7, day=1)
    end = start + pd.DateOffset(years=1) - pd.Timedelta(days=1)
    return start, end


def unique_partner_opps(partner: pd.DataFrame) -> pd.DataFrame:
    """One row per opportunity so duplicated partner credits are not summed twice."""
    if partner.empty:
        return partner
    key = "Opportunity ID" if partner["Opportunity ID"].notna().any() else "Opportunity Name"
    work = partner.copy()
    work["_key"] = work[key].fillna(work["Opportunity Name"]).astype(str)
    partners = (
        work.groupby("_key")["Full Name"]
        .apply(lambda s: "; ".join(sorted({str(x) for x in s.dropna() if str(x).strip()})))
        .rename("_partners")
    )
    first = work.sort_values(["Amount", "Created Date"], ascending=[False, True]).drop_duplicates(
        "_key", keep="first"
    )
    return first.merge(partners, left_on="_key", right_index=True, how="left")


def opportunity_record(row: pd.Series) -> dict:
    partner = text_or_blank(row.get("_partners"))
    if not partner:
        partner = text_or_blank(row.get("Full Name"))
    return {
        "name": text_or_blank(row.get("Opportunity Name")),
        "partner": partner,
        "lead": text_or_blank(row.get("Opportunity Lead: Full Name")),
        "account": text_or_blank(row.get("Account Name: Account Name")),
        "stage": text_or_blank(row.get("Stage")),
        "amount": money(row["Amount"]),
        "close_date": iso_date(row.get("Close Date")),
    }


def records_over_amount(opps: pd.DataFrame, threshold: float) -> list[dict]:
    subset = opps[opps["Amount"] >= threshold].sort_values("Amount", ascending=False)
    return [opportunity_record(row) for _, row in subset.iterrows()]


def all_open_opportunity_records(opps: pd.DataFrame) -> list[dict]:
    if opps.empty:
        return []
    open_rows = opps[opps["Stage"].isin(OPEN_STAGES)].sort_values("Amount", ascending=False)
    return [opportunity_record(row) for _, row in open_rows.iterrows()]


def build_reconciliation(dcm: pd.DataFrame, partner: pd.DataFrame) -> dict:
    """Opportunities on a named DCM D&T partner's team that are absent from the DCM extract."""
    named = list(NAMED_RECON_PARTNERS)
    named_set = set(named)
    dcm_names = {text_or_blank(v) for v in dcm["Opportunity Name"].tolist() if text_or_blank(v)}

    work = partner.copy()
    work["_opp"] = work["Opportunity Name"].map(text_or_blank)
    work["_member"] = work["Full Name"].map(text_or_blank)
    tagged = work[work["_member"].isin(named_set) & work["_opp"].ne("")]

    missing: list[dict] = []
    for opp_name, subset in tagged.groupby("_opp", sort=False):
        if opp_name in dcm_names:
            continue
        members = sorted({m for m in subset["_member"] if m in named_set})
        pick = subset.sort_values(["Amount", "Created Date"], ascending=[False, True]).iloc[0]
        missing.append(
            {
                "name": opp_name,
                "partners": members,
                "account": text_or_blank(pick.get("Account Name: Account Name")),
                "stage": text_or_blank(pick.get("Stage")),
                "amount": money(pick["Amount"]),
                "close_date": iso_date(pick.get("Close Date")),
            }
        )
    missing.sort(key=lambda r: (-r["amount"], r["name"]))
    return {
        "named_partners": named,
        "missing_from_dcm": missing,
        "count": len(missing),
        "total": money(sum(r["amount"] for r in missing)),
    }


def industry_totals(df: pd.DataFrame, col: str) -> list[dict]:
    if df.empty:
        return []
    work = df.copy()
    work[col] = work[col].fillna("(blank)").astype(str).str.strip().replace({"": "(blank)"})
    grouped = (
        work.groupby(col)
        .agg(amount=("Amount", "sum"), count=("Amount", "size"))
        .reset_index()
        .sort_values("amount", ascending=False)
    )
    return [
        {"industry": row[col], "amount": money(row["amount"]), "count": int(row["count"])}
        for _, row in grouped.iterrows()
    ]


def partner_code_totals(dcm: pd.DataFrame, partner_opps: pd.DataFrame) -> list[dict]:
    codes_by_name = (
        dcm.groupby("Opportunity Name")["Product Code"]
        .apply(
            lambda s: sorted(
                {str(x).strip() for x in s.dropna() if str(x).strip() and str(x).strip().lower() != "nan"}
            )
        )
        .to_dict()
    )
    joined = partner_opps.copy()
    joined["_codes"] = joined["Opportunity Name"].map(codes_by_name)
    matched = joined["_codes"].apply(lambda v: isinstance(v, list) and len(v) > 0).any()

    if matched:
        rows = []
        for _, row in joined.iterrows():
            codes = row["_codes"] if isinstance(row["_codes"], list) and row["_codes"] else ["Unmapped"]
            share = float(row["Amount"]) / len(codes)
            for code in codes:
                rows.append({"product_code": code, "Amount": share})
        work = pd.DataFrame(rows)
        grouped = (
            work.groupby("product_code")
            .agg(amount=("Amount", "sum"), count=("Amount", "size"))
            .reset_index()
            .sort_values("amount", ascending=False)
        )
        source = "partner_joined_to_dcm_codes"
    else:
        work = dcm.copy()
        work["product_code"] = (
            work["Product Code"].fillna("Unmapped").astype(str).str.strip().replace({"": "Unmapped"})
        )
        grouped = (
            work.groupby("product_code")
            .agg(amount=("Amount", "sum"), count=("Amount", "size"))
            .reset_index()
            .sort_values("amount", ascending=False)
        )
        source = "dcm_only"

    return [
        {
            "product_code": row["product_code"],
            "amount": money(row["amount"]),
            "count": int(row["count"]),
            "source": source,
        }
        for _, row in grouped.iterrows()
    ]


def build_trend(partner_opps: pd.DataFrame, today: pd.Timestamp) -> dict:
    start, end = fiscal_year_bounds(today)
    months = pd.date_range(start, end, freq="MS")
    fy = partner_opps[
        partner_opps["Close Date"].notna()
        & (partner_opps["Close Date"] >= start)
        & (partner_opps["Close Date"] <= end + pd.Timedelta(days=1) - pd.Timedelta(seconds=1))
    ].copy()
    fy["month"] = fy["Close Date"].dt.to_period("M").dt.to_timestamp()
    by_month = fy.groupby("month")["Amount"].sum() if not fy.empty else pd.Series(dtype=float)
    won = fy[fy["Stage"] == WON_STAGE]
    won_month = won.groupby("month")["Amount"].sum() if not won.empty else pd.Series(dtype=float)

    by_month_rows = []
    cumulative = 0.0
    for month in months:
        total = money(by_month.get(month, 0.0))
        won_amt = money(won_month.get(month, 0.0))
        cumulative = money(cumulative + won_amt)
        by_month_rows.append(
            {
                "month": month.strftime("%Y-%m"),
                "amount": total,
                "won_amount": won_amt,
                "cumulative_won": cumulative,
            }
        )
    return {
        "fiscal_year_start": start.date().isoformat(),
        "fiscal_year_end": end.date().isoformat(),
        "by_month": by_month_rows,
    }


def build_aging(partner_opps: pd.DataFrame, today: pd.Timestamp) -> dict:
    open_opps = partner_opps[partner_opps["Stage"].isin(AGING_STAGES)].copy()
    open_opps = open_opps[open_opps["Created Date"].notna()]
    open_opps["age_days"] = (today.normalize() - open_opps["Created Date"].dt.normalize()).dt.days
    open_opps["age_days"] = open_opps["age_days"].clip(lower=0)

    def bucket(days: int) -> str:
        if days <= 90:
            return "0-90"
        if days <= 180:
            return "91-180"
        if days <= 365:
            return "181-365"
        return "365+"

    open_opps["bucket"] = open_opps["age_days"].apply(bucket)
    order = ["0-90", "91-180", "181-365", "365+"]
    dist = []
    for label in order:
        subset = open_opps[open_opps["bucket"] == label]
        dist.append(
            {
                "bucket": label,
                "count": int(len(subset)),
                "amount": money(subset["Amount"].sum()),
            }
        )
    oldest = open_opps.sort_values("age_days", ascending=False).head(10)
    oldest_rows = []
    for _, row in oldest.iterrows():
        oldest_rows.append(
            {
                "name": row["Opportunity Name"],
                "partner": row.get("_partners") or row.get("Full Name") or "",
                "stage": row.get("Stage") or "",
                "amount": money(row["Amount"]),
                "created_date": iso_date(row.get("Created Date")),
                "age_days": int(row["age_days"]),
            }
        )
    return {"buckets": dist, "oldest": oldest_rows}


def _norm_code(value) -> str:
    if value is None or (isinstance(value, float) and pd.isna(value)) or pd.isna(value):
        return ""
    text = str(value).strip()
    if not text or text.lower() in {"nan", "none"}:
        return ""
    return text.upper()


def _partner_lookup(partner_opps: pd.DataFrame) -> pd.DataFrame:
    if partner_opps.empty:
        return pd.DataFrame(
            columns=["Opportunity Name", "_partners", "Full Name",
                     "Opportunity Lead: Full Name", "Account Name: Account Name"]
        )
    cols = [
        "Opportunity Name",
        "_partners",
        "Full Name",
        "Opportunity Lead: Full Name",
        "Account Name: Account Name",
    ]
    available = [c for c in cols if c in partner_opps.columns]
    return (
        partner_opps[available]
        .drop_duplicates("Opportunity Name", keep="first")
        .set_index("Opportunity Name")
    )


def _lookup_text(lookup: pd.DataFrame, name: str, col: str) -> str:
    if lookup.empty or name not in lookup.index or col not in lookup.columns:
        return ""
    val = lookup.at[name, col]
    if isinstance(val, pd.Series):
        val = val.iloc[0]
    return text_or_blank(val)


def _partner_totals_from_opps(opps: list[dict]) -> list[dict]:
    buckets: dict[str, dict] = {}
    for row in opps:
        key = text_or_blank(row.get("partner")) or text_or_blank(row.get("lead")) or "(blank)"
        rec = buckets.setdefault(key, {"partner": key, "amount": 0.0, "count": 0})
        rec["amount"] += float(row.get("amount") or 0)
        rec["count"] += 1
    out = []
    for rec in buckets.values():
        rec["amount"] = money(rec["amount"])
        out.append(rec)
    out.sort(key=lambda r: (-r["amount"], r["partner"]))
    return out


def _product_block(opps: list[dict]) -> dict:
    opps_sorted = sorted(opps, key=lambda r: (-float(r.get("amount") or 0), r.get("name") or ""))
    return {
        "total": money(sum(float(r.get("amount") or 0) for r in opps_sorted)),
        "count": len(opps_sorted),
        "opportunities": opps_sorted,
        "partner_totals": _partner_totals_from_opps(opps_sorted),
    }


def _dcm_open_records(slice_df: pd.DataFrame, lookup: pd.DataFrame) -> list[dict]:
    if slice_df.empty:
        return []
    agg = (
        slice_df.groupby("Opportunity Name", as_index=False)
        .agg(
            Amount=("Amount", "sum"),
            Stage=("Stage", "first"),
            **{"Close Date": ("Close Date", "first")},
            **{"Opportunity Lead: Full Name": ("Opportunity Lead: Full Name", "first")},
            **{"Opportunity Owner: Full Name": ("Opportunity Owner: Full Name", "first")},
        )
    )
    records = []
    for _, row in agg.iterrows():
        name = text_or_blank(row.get("Opportunity Name"))
        dcm_lead = text_or_blank(row.get("Opportunity Lead: Full Name"))
        owner = text_or_blank(row.get("Opportunity Owner: Full Name"))
        partner = _lookup_text(lookup, name, "_partners") or _lookup_text(lookup, name, "Full Name")
        lead = _lookup_text(lookup, name, "Opportunity Lead: Full Name")
        account = _lookup_text(lookup, name, "Account Name: Account Name")
        if not partner:
            partner = lead or dcm_lead or owner
        if not lead:
            lead = dcm_lead or owner
        records.append(
            {
                "name": name,
                "partner": partner,
                "lead": lead,
                "account": account,
                "stage": text_or_blank(row.get("Stage")),
                "amount": money(row["Amount"]),
                "close_date": iso_date(row.get("Close Date")),
            }
        )
    return records


def product_breakdown(dcm: pd.DataFrame, partner_opps: pd.DataFrame) -> dict:
    """Open pipeline by USH16 / USH17 / USG18, plus a No D&A catch-all."""
    lookup = _partner_lookup(partner_opps)
    work = dcm.copy()
    work["_code"] = work["Product Code"].map(_norm_code)
    tagged_names = set(
        work.loc[work["_code"].isin(FOCUS_PRODUCT_CODES), "Opportunity Name"]
        .dropna()
        .map(lambda v: str(v).strip())
    )
    dcm_open = work[work["Stage"].isin(OPEN_STAGES)]

    out: dict = {}
    for code in FOCUS_PRODUCT_CODES:
        out[code] = _product_block(_dcm_open_records(dcm_open[dcm_open["_code"] == code], lookup))

    no_da: list[dict] = []
    partner_open = partner_opps[partner_opps["Stage"].isin(OPEN_STAGES)]
    partner_open_names: set[str] = set()
    for _, row in partner_open.iterrows():
        name = text_or_blank(row.get("Opportunity Name"))
        partner_open_names.add(name)
        if name not in tagged_names:
            no_da.append(opportunity_record(row))

    untagged_dcm = dcm_open[
        ~dcm_open["_code"].isin(FOCUS_PRODUCT_CODES)
        & ~dcm_open["Opportunity Name"].map(lambda v: str(v).strip() if pd.notna(v) else "").isin(tagged_names)
        & ~dcm_open["Opportunity Name"].map(lambda v: str(v).strip() if pd.notna(v) else "").isin(partner_open_names)
    ]
    no_da.extend(_dcm_open_records(untagged_dcm, lookup))
    out[NO_DA_LABEL] = _product_block(no_da)
    return out


def win_rate_by_partner(partner: pd.DataFrame) -> list[dict]:
    if partner.empty:
        return []
    work = partner.copy()
    work["Full Name"] = work["Full Name"].fillna("(blank)").astype(str).str.strip().replace({"": "(blank)"})
    rows = []
    for name, subset in work.groupby("Full Name"):
        won = money(subset.loc[subset["Stage"] == WON_STAGE, "Amount"].sum())
        closed = money(subset.loc[subset["Stage"] == CLOSE_STAGE, "Amount"].sum())
        denom = won + closed
        rate = round(won / denom, 4) if denom else None
        rows.append(
            {
                "partner": name,
                "won_amount": won,
                "close_amount": closed,
                "win_rate": rate,
            }
        )
    rows.sort(key=lambda r: (r["win_rate"] is None, -(r["win_rate"] or 0), -r["won_amount"]))
    return rows


def main() -> None:
    dcm_path = find_one_excel(RAW_DIR, DCM_GLOB, "DCM D&T Pipeline View")
    partner_path = find_one_excel(RAW_DIR, PARTNER_GLOB, "Pipeline Partner View")

    dcm_sheet = resolve_sheet(dcm_path, DCM_SHEET)
    partner_sheet = resolve_sheet(partner_path, PARTNER_SHEET)

    dcm = read_excel_table(dcm_path, dcm_sheet, DCM_COLUMNS)
    partner = read_excel_table(partner_path, partner_sheet, PARTNER_COLUMNS)
    partner_opps = unique_partner_opps(partner)

    today = pd.Timestamp(datetime.now().date())

    open_opps = partner_opps[partner_opps["Stage"].isin(OPEN_STAGES)]
    all_open = all_open_opportunity_records(partner_opps)
    max_open_amount = (
        money(open_opps["Amount"].max())
        if not open_opps.empty and pd.notna(open_opps["Amount"].max())
        else 0.0
    )
    won_opps = partner_opps[partner_opps["Stage"] == WON_STAGE]
    open_count = int(len(open_opps))
    open_amount = money(open_opps["Amount"].sum())
    won_amount = money(won_opps["Amount"].sum())
    avg_deal = money(open_amount / open_count) if open_count else 0.0

    partner_name_totals = (
        partner.assign(
            **{
                "Full Name": partner["Full Name"]
                .fillna("(blank)")
                .astype(str)
                .str.strip()
                .replace({"": "(blank)"})
            }
        )
        .groupby("Full Name")
        .agg(amount=("Amount", "sum"), count=("Amount", "size"))
        .reset_index()
        .sort_values("amount", ascending=False)
    )

    accounts = partner_opps.copy()
    accounts["Account Name: Account Name"] = (
        accounts["Account Name: Account Name"]
        .fillna("(blank)")
        .astype(str)
        .str.strip()
        .replace({"": "(blank)"})
    )
    account_totals = (
        accounts.groupby("Account Name: Account Name")
        .agg(amount=("Amount", "sum"), count=("Amount", "size"))
        .reset_index()
        .sort_values("amount", ascending=False)
    )
    pipeline_total = money(partner_opps["Amount"].sum())
    top5_amount = money(account_totals.head(5)["amount"].sum())
    top5_pct = round(top5_amount / pipeline_total, 4) if pipeline_total else 0.0
    top_accounts = [
        {
            "account": row["Account Name: Account Name"],
            "amount": money(row["amount"]),
            "count": int(row["count"]),
        }
        for _, row in account_totals.head(15).iterrows()
    ]

    breakdown = product_breakdown(dcm, partner_opps)
    recon = build_reconciliation(dcm, partner)

    extra_full_names = sorted(
        {
            text_or_blank(v)
            for v in partner["Full Name"].tolist()
            if text_or_blank(v) and text_or_blank(v) not in set(NAMED_RECON_PARTNERS)
        }
    )

    print(f"DCM rows: {len(dcm)}  ({dcm_path.name})")
    print(f"Partner rows: {len(partner)}  ({partner_path.name})")
    print(f"Unique partner opportunities: {len(partner_opps)}")
    print(f"Open opportunities (slider): {len(all_open)}  max ${max_open_amount:,.0f}")
    print(
        f"Reconciliation missing from DCM: {recon['count']} opps  "
        f"${recon['total']:,.0f}"
    )
    if extra_full_names:
        print(f"Partner Full Name values not on named list: {', '.join(extra_full_names)}")
    for code in PRODUCT_BREAKDOWN_KEYS:
        block = breakdown[code]
        print(
            f"Product {code}: open ${block['total']:,.0f}  "
            f"({block['count']} opps, {len(block['partner_totals'])} partners)"
        )

    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "fy_label": fy_label_for(today),
        "yoy_growth": {
            "total_open_pipeline": None,
            "open_opportunity_count": None,
            "total_won": None,
        },
        "kpis": {
            "total_open_pipeline": open_amount,
            "open_opportunity_count": open_count,
            "total_won": won_amount,
            "average_deal_size": avg_deal,
        },
        "stage_totals": {
            "dcm_stage_totals": group_stage_totals(dcm),
            "partner_stage_totals": group_stage_totals(partner_opps),
        },
        "opps_over_10m": records_over_amount(partner_opps, 10_000_000),
        "opps_over_20m": records_over_amount(partner_opps, 20_000_000),
        "all_open_opportunities": all_open,
        "max_open_opportunity_amount": max_open_amount,
        "partner_totals": [
            {
                "partner": row["Full Name"],
                "amount": money(row["amount"]),
                "count": int(row["count"]),
            }
            for _, row in partner_name_totals.iterrows()
        ],
        "partner_code_totals": partner_code_totals(dcm, partner_opps),
        "product_breakdown": breakdown,
        "industry_totals": {
            "dcm": industry_totals(dcm, "Industry Sector"),
            "partner": industry_totals(partner_opps, "Ultimate Parent Account: Industry"),
        },
        "top_accounts": {
            "top_15": top_accounts,
            "top_5_amount": top5_amount,
            "top_5_pct_of_pipeline": top5_pct,
            "pipeline_total": pipeline_total,
        },
        "reconciliation": recon,
        "trend": build_trend(partner_opps, today),
        "aging": build_aging(partner_opps, today),
        "win_rate_by_partner": win_rate_by_partner(partner),
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(payload, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(f"Wrote {OUT_PATH.relative_to(REPO_ROOT)}")


if __name__ == "__main__":
    main()
