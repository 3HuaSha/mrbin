# -*- coding: utf-8 -*-
"""
从 bin_number_with_phone.csv (130 单) 生成 Supabase migration SQL
- 将 130 条送桶记录导入 orders 表 (type=delivery, status=done, time_window=AM)
- 将涉及的不同桶号导入 bins 表 (status=on_site, 地址取最新日期那条记录)
- ALTER bin_size 枚举加入 '30'
"""

from __future__ import annotations
import csv
import os
import re
from datetime import datetime

CSV_PATH = os.path.join(os.path.dirname(__file__), '..', 'bin_number_with_phone.csv')
MIGRATIONS_DIR = os.path.join(os.path.dirname(__file__), '..', 'supabase', 'migrations')
DATA_PATH = os.path.join(MIGRATIONS_DIR, '20260511000001_import_outstanding_orders.sql')

MONTH_MAP = {
    'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04',
    'May': '05', 'Jun': '06', 'Jul': '07', 'Aug': '08',
    'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12',
}

def parse_date(raw: str) -> str:
    """'1-May-26' -> '2026-05-01'"""
    raw = raw.strip()
    m = re.match(r'^(\d{1,2})-([A-Za-z]{3})-(\d{2})$', raw)
    if not m:
        raise ValueError(f'cannot parse date {raw!r}')
    day, mon, yr = m.groups()
    return f'20{yr}-{MONTH_MAP[mon]}-{int(day):02d}'

def infer_size(bin_number: str) -> str | None:
    """返回 '14' / '20' / '40'; 30YD 返回 None 表示先跳过"""
    bn = bin_number.strip()
    if bn.upper().startswith('L20'):
        return '20'
    m = re.match(r'^(\d{2})', bn)
    if m:
        s = m.group(1)
        if s in ('14', '20', '40'):
            return s
        if s == '30':
            return None  # 30YD 先跳过
    raise ValueError(f'cannot infer size from bin_number {bin_number!r}')

def infer_bin_type(bin_type_raw: str) -> str:
    t = bin_type_raw or ''
    tu = t.upper()
    if '砖' in t or '磚' in t or 'BRICK' in tu:
        return 'brick'
    if '土' in t or 'SOIL' in tu:
        return 'soil'
    if '水泥' in t or 'CEMENT' in tu:
        return 'cement'
    if '沥青' in t or '瀝青' in t or 'ASPHALT' in tu:
        return 'asphalt'
    return 'garbage'

PHONE_RE = re.compile(r'(\(?\d{3}\)?[\s\-.]?\d{3}[\s\-.]?\d{4})')

def split_name_phone(raw: str) -> tuple[str, str]:
    """'Vincent 647-571-6132' -> ('Vincent', '647-571-6132')
    '416-878-8877' -> ('', '416-878-8877')
    '416-890-8667 / 905-341-7277' -> 姓名空, 取第一个电话
    '(647) 627-7983' -> ('', '647-627-7983')
    """
    raw = (raw or '').strip()
    if not raw:
        return '', ''
    m = PHONE_RE.search(raw)
    if not m:
        return raw, ''  # 全是文字, 当姓名
    phone_raw = m.group(1)
    # 规范化电话: 只留数字再格式化 xxx-xxx-xxxx
    digits = re.sub(r'\D', '', phone_raw)[:10]
    phone = f'{digits[0:3]}-{digits[3:6]}-{digits[6:10]}' if len(digits) == 10 else phone_raw
    # 去掉电话和斜杠之后剩的是姓名
    name = PHONE_RE.sub('', raw)
    name = re.sub(r'[/,，]+', ' ', name)
    name = re.sub(r'\s+', ' ', name).strip()
    return name, phone

def sql_quote(s: str | None) -> str:
    if s is None or s == '':
        return 'NULL'
    return "'" + s.replace("'", "''") + "'"

def main():
    rows: list[dict] = []
    with open(CSV_PATH, 'r', encoding='utf-8-sig') as f:
        # 第一行是标题说明，跳过
        first = f.readline()
        reader = csv.DictReader(f)
        for r in reader:
            order_number = (r.get('单号') or '').strip()
            bin_number = (r.get('桶号') or '').strip()
            if not order_number or not bin_number:
                continue
            rows.append({
                'order_number': order_number,
                'bin_number': bin_number,
                'service_date': parse_date(r.get('送出日期') or ''),
                'address': (r.get('地址') or '').strip(),
                'bin_type_raw': (r.get('桶型') or '').strip(),
                'driver': (r.get('司机') or '').strip(),
                'phone_raw': (r.get('电话') or '').strip(),
            })

    print(f'解析到 {len(rows)} 条订单记录')

    # ---- 过滤 30YD (暂不导入) ----
    before = len(rows)
    skipped_30 = [r for r in rows if infer_size(r['bin_number']) is None]
    rows = [r for r in rows if infer_size(r['bin_number']) is not None]
    print(f'跳过 30YD 桶 {len(skipped_30)} 条: ' + ', '.join(r['order_number'] for r in skipped_30))
    print(f'剩余 {len(rows)} 条待导入')

    # ---- 桶去重 (相同 bin_number 只保留最新 service_date 的那条) ----
    latest_by_bin: dict[str, dict] = {}
    for r in rows:
        key = r['bin_number']
        prev = latest_by_bin.get(key)
        if prev is None or r['service_date'] > prev['service_date']:
            latest_by_bin[key] = r
    print(f'去重后桶号数量: {len(latest_by_bin)}')

    # ---- 生成 SQL ----
    out = []
    out.append('-- ============================================================')
    out.append('-- 导入在外未收桶的送桶订单 + 对应桶库存 (暂跳过 30YD)')
    out.append('-- 数据源: bin_number_with_phone.csv')
    out.append(f'-- 生成时间: {datetime.now().isoformat(timespec="seconds")}')
    out.append('-- ============================================================')
    out.append('')
    out.append('-- 1. 导入桶库存 (status=on_site 在场使用中)')
    out.append('--    桶号冲突时更新地址、状态、最后移动时间为最新记录')
    out.append('INSERT INTO public.bins (bin_number, size, status, current_address, last_moved_at, notes, is_active) VALUES')

    bin_values = []
    for bn, r in sorted(latest_by_bin.items()):
        size = infer_size(bn)
        bin_values.append(
            f"  ({sql_quote(bn)}, '{size}'::public.bin_size, 'on_site'::public.bin_status, "
            f"{sql_quote(r['address'])}, (DATE {sql_quote(r['service_date'])})::timestamptz, "
            f"{sql_quote('从 bin_number_with_phone.csv 导入, 送单 ' + r['order_number'])}, true)"
        )
    out.append(',\n'.join(bin_values))
    out.append('ON CONFLICT (bin_number) DO UPDATE SET')
    out.append('  size            = EXCLUDED.size,')
    out.append('  status          = EXCLUDED.status,')
    out.append('  current_address = EXCLUDED.current_address,')
    out.append('  last_moved_at   = EXCLUDED.last_moved_at,')
    out.append('  notes           = EXCLUDED.notes,')
    out.append('  is_active       = true;')
    out.append('')

    out.append('-- 2. 导入 130 条送桶订单 (type=delivery, time_window=AM, status=done 表示已送达, 桶在场)')
    out.append('--    order_number+type 冲突时更新地址等字段')
    out.append('INSERT INTO public.orders (')
    out.append('  order_number, type, bin_size, bin_type, service_date, time_window,')
    out.append('  address, customer_name, customer_phone, customer_notes, status')
    out.append(') VALUES')

    order_values = []
    for r in rows:
        size = infer_size(r['bin_number'])
        btype = infer_bin_type(r['bin_type_raw'])
        name, phone = split_name_phone(r['phone_raw'])
        # customer_name NOT NULL: 没有姓名时用地址简写占位
        if not name:
            name = r['address'].split(',')[0][:60] or '未知客户'
        # customer_phone NOT NULL, 没电话占位
        if not phone:
            phone = '000-000-0000'
        notes = f"桶号 {r['bin_number']} · {r['bin_type_raw']} · 司机 {r['driver']}"
        order_values.append(
            f"  ({sql_quote(r['order_number'])}, 'delivery'::public.order_type, "
            f"'{size}'::public.bin_size, '{btype}'::public.bin_type, "
            f"DATE {sql_quote(r['service_date'])}, 'AM'::public.time_window, "
            f"{sql_quote(r['address'])}, {sql_quote(name)}, {sql_quote(phone)}, "
            f"{sql_quote(notes)}, 'done'::public.order_status)"
        )
    out.append(',\n'.join(order_values))
    out.append('ON CONFLICT (order_number, type) DO UPDATE SET')
    out.append('  bin_size         = EXCLUDED.bin_size,')
    out.append('  bin_type         = EXCLUDED.bin_type,')
    out.append('  service_date     = EXCLUDED.service_date,')
    out.append('  time_window      = EXCLUDED.time_window,')
    out.append('  address          = EXCLUDED.address,')
    out.append('  customer_name    = EXCLUDED.customer_name,')
    out.append('  customer_phone   = EXCLUDED.customer_phone,')
    out.append('  customer_notes   = EXCLUDED.customer_notes,')
    out.append('  status           = EXCLUDED.status,')
    out.append('  updated_at       = now();')
    out.append('')
    out.append(f'-- 共导入 {len(rows)} 条订单, {len(latest_by_bin)} 个桶 (去重后, 30YD 暂未导入)')
    out.append('')

    os.makedirs(MIGRATIONS_DIR, exist_ok=True)
    with open(DATA_PATH, 'w', encoding='utf-8') as f:
        f.write('\n'.join(out))
    print(f'已生成: {DATA_PATH}')

if __name__ == '__main__':
    main()
