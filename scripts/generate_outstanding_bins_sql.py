"""
将 bin_number.csv 转成可直接在 Supabase SQL Editor 跑的 SQL 脚本。
输出: supabase/migrations/20260510000003_outstanding_bins.sql
"""
import csv
import os
from datetime import datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV_PATH = os.path.join(ROOT, "bin_number.csv")
OUT_PATH = os.path.join(ROOT, "supabase", "migrations", "20260510000003_outstanding_bins.sql")

MONTH_MAP = {
    "Jan": "01", "Feb": "02", "Mar": "03", "Apr": "04",
    "May": "05", "Jun": "06", "Jul": "07", "Aug": "08",
    "Sep": "09", "Oct": "10", "Nov": "11", "Dec": "12",
}


def parse_date(s: str) -> str:
    """'1-May-26' -> '2026-05-01'"""
    s = s.strip()
    parts = s.split("-")
    if len(parts) != 3:
        return ""
    day, mon, yy = parts
    mm = MONTH_MAP.get(mon.strip(), "01")
    year = int(yy.strip())
    year += 2000 if year < 100 else 0
    return f"{year:04d}-{mm}-{int(day):02d}"


def sql_escape(s: str) -> str:
    return (s or "").replace("'", "''").strip()


rows = []
with open(CSV_PATH, "r", encoding="utf-8") as f:
    reader = csv.reader(f)
    header_seen = False
    for r in reader:
        if not r or not any(r):
            continue
        # 跳过首行标题
        if r[0].startswith("未收桶"):
            continue
        # 跳过表头
        if r[0].strip() == "#":
            header_seen = True
            continue
        if not header_seen:
            continue
        if len(r) < 8:
            r = r + [""] * (8 - len(r))
        seq, order_number, bin_number, send_date, month, address, bin_type_raw, driver = r[:8]
        if not order_number.strip():
            continue
        rows.append({
            "seq": seq.strip(),
            "order_number": sql_escape(order_number),
            "bin_number": sql_escape(bin_number),
            "service_date": parse_date(send_date),
            "month_label": sql_escape(month),
            "address": sql_escape(address),
            "bin_type_raw": sql_escape(bin_type_raw),
            "driver": sql_escape(driver),
        })

print(f"解析到 {len(rows)} 行")

sql_lines = [
    "-- ============================================================",
    "-- 在外未收桶记录 (outstanding_bins)",
    "-- 数据源: bin_number.csv (共 134 单)",
    f"-- 生成时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
    "-- ",
    "-- 用途: 存档目前还没回收的桶，按地址/桶号/送出日期查看",
    "-- 可以在 Supabase SQL Editor 整段粘贴运行",
    "-- ============================================================",
    "",
    "-- 1. 建表",
    "CREATE TABLE IF NOT EXISTS public.outstanding_bins (",
    "  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),",
    "  order_number TEXT NOT NULL,",
    "  bin_number TEXT NOT NULL,",
    "  service_date DATE,",
    "  month_label TEXT,",
    "  address TEXT,",
    "  bin_type_raw TEXT,",
    "  driver TEXT,",
    "  notes TEXT,",
    "  is_returned BOOLEAN DEFAULT FALSE,",
    "  returned_at TIMESTAMPTZ,",
    "  created_at TIMESTAMPTZ DEFAULT now(),",
    "  updated_at TIMESTAMPTZ DEFAULT now(),",
    "  UNIQUE(order_number, bin_number)",
    ");",
    "",
    "-- 2. 索引",
    "CREATE INDEX IF NOT EXISTS idx_outstanding_bins_order_number ON public.outstanding_bins(order_number);",
    "CREATE INDEX IF NOT EXISTS idx_outstanding_bins_bin_number ON public.outstanding_bins(bin_number);",
    "CREATE INDEX IF NOT EXISTS idx_outstanding_bins_service_date ON public.outstanding_bins(service_date);",
    "CREATE INDEX IF NOT EXISTS idx_outstanding_bins_driver ON public.outstanding_bins(driver);",
    "CREATE INDEX IF NOT EXISTS idx_outstanding_bins_is_returned ON public.outstanding_bins(is_returned);",
    "",
    "-- 3. RLS (跟项目其他表一致先全开, 上线前再收紧)",
    "ALTER TABLE public.outstanding_bins ENABLE ROW LEVEL SECURITY;",
    "DROP POLICY IF EXISTS open_all ON public.outstanding_bins;",
    "CREATE POLICY open_all ON public.outstanding_bins FOR ALL USING (true) WITH CHECK (true);",
    "",
    "-- 4. 更新时间戳触发器",
    "CREATE OR REPLACE FUNCTION public.set_outstanding_bins_updated_at()",
    "RETURNS TRIGGER LANGUAGE plpgsql AS $$",
    "BEGIN",
    "  NEW.updated_at := now();",
    "  RETURN NEW;",
    "END;",
    "$$;",
    "",
    "DROP TRIGGER IF EXISTS trg_outstanding_bins_updated_at ON public.outstanding_bins;",
    "CREATE TRIGGER trg_outstanding_bins_updated_at",
    "BEFORE UPDATE ON public.outstanding_bins",
    "FOR EACH ROW EXECUTE FUNCTION public.set_outstanding_bins_updated_at();",
    "",
    "-- 5. 导入数据 (UPSERT, 可重复运行)",
    "INSERT INTO public.outstanding_bins (order_number, bin_number, service_date, month_label, address, bin_type_raw, driver) VALUES",
]

value_lines = []
for r in rows:
    sd = f"DATE '{r['service_date']}'" if r["service_date"] else "NULL"
    value_lines.append(
        f"  ('{r['order_number']}', '{r['bin_number']}', {sd}, '{r['month_label']}', '{r['address']}', '{r['bin_type_raw']}', '{r['driver']}')"
    )

sql_lines.append(",\n".join(value_lines))
sql_lines.append("ON CONFLICT (order_number, bin_number) DO UPDATE SET")
sql_lines.append("  service_date = EXCLUDED.service_date,")
sql_lines.append("  month_label  = EXCLUDED.month_label,")
sql_lines.append("  address      = EXCLUDED.address,")
sql_lines.append("  bin_type_raw = EXCLUDED.bin_type_raw,")
sql_lines.append("  driver       = EXCLUDED.driver,")
sql_lines.append("  updated_at   = now();")
sql_lines.append("")
sql_lines.append(f"-- 共导入 {len(rows)} 条记录")

os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
with open(OUT_PATH, "w", encoding="utf-8") as f:
    f.write("\n".join(sql_lines))

print(f"生成完成: {OUT_PATH}")
