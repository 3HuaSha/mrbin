import sys
import os
import re
import csv
from datetime import datetime

# ==========================================
# Config
# ==========================================
OUTPUT_SQL = r'c:\Users\MrBin\Desktop\task1\daily_sync.sql'

def parse_date(date_str):
    if not date_str: return datetime.now().date().isoformat()
    date_str = date_str.strip()
    # Handle JavaScript Date.toString() format:
    # "Wed May 20 2026 03:00:00 GMT-0400 (Eastern Daylight Time)"
    js_match = re.match(r'\w+\s+(\w+\s+\d+\s+\d{4})', date_str)
    if js_match:
        try:
            return datetime.strptime(js_match.group(1), '%b %d %Y').date().isoformat()
        except:
            pass
    for fmt in ('%d-%b-%y', '%d-%b-%Y', '%Y-%m-%d', '%m/%d/%Y', '%Y/%m/%d', '%b %d %Y'):
        try: return datetime.strptime(date_str, fmt).date().isoformat()
        except: continue
    return datetime.now().date().isoformat()

def map_bin_size(text):
    s = str(text).upper()
    # If it's a swap like "拉40, 送20", pick the one after "送" or "換"
    match_after_delivery = re.search(r'(?:送|換|换|DELIVER)\s*(\d+)', s)
    if match_after_delivery:
        size = match_after_delivery.group(1)
        if size in ['14', '20', '30', '40']: return size
    if '40' in s: return '40'
    if '30' in s: return '30'
    if '20' in s: return '20'
    if '14' in s: return '14'
    return '14'

def map_bin_type(text, size_text):
    t = (str(text) + " " + str(size_text)).lower()
    # Support both simplified and traditional Chinese characters
    if '砖' in t or '磚' in t or '埇' in t or 'brick' in t or 'concrete' in t: return 'brick'
    if '土' in t or 'soil' in t: return 'soil'
    if '水泥' in t or 'cement' in t: return 'cement'
    if '沥青' in t or '瀝青' in t or 'asphalt' in t: return 'asphalt'
    return 'garbage'

def map_time_window(time_str):
    t = str(time_str).upper()
    if '7-9' in t: return '7-9'
    if 'AM' in t: return 'AM'
    if 'PM' in t: return 'PM'
    return 'custom'

def escape_sql(val):
    if val is None: return "NULL"
    return "'" + str(val).replace("'", "''") + "'"

def read_rows(filepath):
    """Read rows from CSV or tab-separated file, returning list of string lists."""
    ext = os.path.splitext(filepath)[1].lower()
    with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
        if ext == '.csv':
            reader = csv.reader(f)
            return list(reader)
        else:
            # Tab-separated (legacy .txt format)
            rows = []
            for line in f:
                rows.append(line.rstrip('\n').split('\t'))
            return rows

def get_col_map(row):
    """
    Detect column layout based on whether col[1] looks like a JS timestamp.
    CSV format:  [0]="" [1]=JS_date [2]=JS_date [3]=month_num [4]=order_num ...
    TXT format:  [0]="" [1]=date    [2]=day      [3]=month_str [4]=order_num ...
    Returns a dict mapping field name → column index.
    """
    col1 = row[1].strip() if len(row) > 1 else ""
    is_csv = 'GMT' in col1 or 'Eastern' in col1 or len(col1) > 20
    if is_csv:
        return {
            'date':       1,
            'order_num':  4,
            'bin_num':    5,
            'raw_time':   6,
            'note':       8,
            'size_raw':   9,
            'action':     11,
            'address':    12,
            'phone':      14,
            'done_flag':  19,  # Column T
        }
    else:
        return {
            'date':       1,
            'order_num':  4,
            'bin_num':    5,
            'raw_time':   6,
            'note':       8,
            'size_raw':   9,
            'action':     11,
            'address':    12,
            'phone':      14,
            'done_flag':  None,  # Legacy: no done flag, use bin presence
        }

def process():
    if len(sys.argv) > 1 and os.path.exists(sys.argv[1]):
        filepath = sys.argv[1]
    else:
        print("Usage: python sync_pasted_data.py <input.csv or input.txt>")
        return

    all_rows = read_rows(filepath)
    print(f"Read {len(all_rows)} rows from {os.path.basename(filepath)}")

    # Detect column layout from first non-empty data row
    col_map = None
    for row in all_rows:
        if len(row) > 4 and row[4].strip():
            col_map = get_col_map(row)
            break
    if col_map is None:
        print("Could not detect column layout.")
        return

    raw_orders = []
    counts = {'total': 0, 'skipped_material': 0, 'skipped_machine': 0, 'processed': 0}

    for row in all_rows:
        if len(row) < 12: continue

        order_num = row[col_map['order_num']].strip() if len(row) > col_map['order_num'] else ""
        if not order_num: continue

        counts['total'] += 1

        # --- Check Column T (done flag) if available ---
        done_col = col_map.get('done_flag')
        if done_col is not None:
            done_flag_val = row[done_col].strip().lower() if len(row) > done_col else 'false'
            is_done = (done_flag_val == 'true')
        else:
            # Legacy format: completed if bin_number is filled
            bin_num_check = row[col_map['bin_num']].strip() if len(row) > col_map['bin_num'] else ""
            is_done = True if bin_num_check else False

        # --- Skip machine orders (SOR prefix) ---
        if order_num.startswith('SOR'):
            counts['skipped_machine'] += 1
            continue

        # --- Skip pure material orders (SOA prefix or no bin + material keywords) ---
        bin_num = row[col_map['bin_num']].strip() if len(row) > col_map['bin_num'] else ""
        size_raw = row[col_map['size_raw']].strip() if len(row) > col_map['size_raw'] else ""
        note = row[col_map['note']].strip() if len(row) > col_map['note'] else ""
        desc = (size_raw + " " + note).upper()

        if order_num.startswith('SOA'):
            counts['skipped_material'] += 1
            continue
        material_keywords = ['GRAVEL', 'HPB', 'SCREENING', 'CRUSH', 'SAND', 'STONE', '石', '砂', '料']
        if not bin_num and any(kw in desc for kw in material_keywords):
            counts['skipped_material'] += 1
            continue

        # --- Parse remaining fields ---
        raw_time = row[col_map['raw_time']].strip() if len(row) > col_map['raw_time'] else ""
        action   = row[col_map['action']].strip()   if len(row) > col_map['action']   else ""
        address  = row[col_map['address']].strip()  if len(row) > col_map['address']  else ""
        phone    = row[col_map['phone']].strip()    if len(row) > col_map['phone']    else ""
        date     = parse_date(row[col_map['date']].strip() if len(row) > col_map['date'] else "")

        size     = map_bin_size(size_raw + " " + note)
        bin_type = map_bin_type(note, size_raw)
        time_window = map_time_window(raw_time)

        order_type = 'delivery'
        if '收' in action or 'PICK' in action.upper() or 'RETURN' in action.upper():
            order_type = 'pickup'

        parsed_row = {
            'order_number': order_num,
            'type': order_type,
            'bin_num': bin_num,
            'size': size,
            'bin_type': bin_type,
            'date': date,
            'time_window': time_window,
            'raw_time': raw_time,
            'address': address,
            'phone': phone,
            'note': note,
            'is_done': is_done
        }

        raw_orders.append(parsed_row)
        counts['processed'] += 1

    print(f"  [OK] {counts['processed']} rows eligible to process")
    if done_col is not None:
        done_count = sum(1 for r in raw_orders if r['is_done'])
        pending_count = sum(1 for r in raw_orders if not r['is_done'])
        print(f"  [STATUS] {done_count} completed orders (Column T = true)")
        print(f"  [STATUS] {pending_count} pending orders (Column T = false)")
    print(f"  [SKIP] {counts['skipped_material']} skipped (material-only orders)")
    print(f"  [SKIP] {counts['skipped_machine']} skipped (machine orders, SOR prefix)")

    orders = {}
    orders_to_complete = []
    bins = {}

    # Group raw_orders by (order_number, type)
    orders_by_key = {}
    for r in raw_orders:
        key = (r['order_number'], r['type'])
        if key not in orders_by_key:
            orders_by_key[key] = []
        orders_by_key[key].append(r)

    for (order_num, o_type), rows in orders_by_key.items():
        # Merge rows for the same (order_number, type)
        is_done = any(r['is_done'] for r in rows)
        
        # Find first non-empty bin number
        bin_rows = [r for r in rows if r['bin_num']]
        bin_num = bin_rows[0]['bin_num'] if bin_rows else ""
        
        first_row = rows[0]
        size = bin_rows[0]['size'] if bin_rows else first_row['size']
        bin_type = first_row['bin_type']
        date = first_row['date']
        time_window = first_row['time_window']
        raw_time = first_row['raw_time']
        address = first_row['address']
        phone = first_row['phone']
        note = first_row['note']

        order_status = 'done' if is_done else 'pending'

        # Only update bin table if the task is done (is_done = True) and we have a bin_num
        if is_done and bin_num:
            if o_type == 'delivery':
                bins[bin_num] = {
                    'status': 'on_site',
                    'address': address,
                    'size': size,
                    'note': f'Delivered via {order_num}'
                }
            elif o_type == 'pickup':
                bins[bin_num] = {
                    'status': 'depot',
                    'address': 'Depot',
                    'size': size,
                    'note': f'Picked up via {order_num}'
                }

        # If it's a completed pickup, we also update the corresponding delivery in DB to 'done'
        if o_type == 'pickup' and is_done:
            orders_to_complete.append(order_num)

        orders[(order_num, o_type)] = {
            'order_number': order_num,
            'type': o_type,
            'bin_size': size,
            'bin_type': bin_type,
            'service_date': date,
            'time_window': time_window,
            'time_window_custom': raw_time if time_window == 'custom' else None,
            'address': address,
            'customer_name': address.split(',')[0][:50] if address else 'Customer',
            'customer_phone': phone,
            'customer_notes': note,
            'status': order_status
        }

    with open(OUTPUT_SQL, 'w', encoding='utf-8') as sql:
        sql.write("-- Upsert Sync (Merging with existing data)\n")
        sql.write("ALTER TYPE public.bin_size ADD VALUE IF NOT EXISTS '30';\n")
        sql.write("ALTER TYPE public.time_window ADD VALUE IF NOT EXISTS 'ANYTIME';\n\n")
        sql.write("BEGIN;\n\n")

        if bins:
            sql.write("INSERT INTO public.bins (bin_number, size, status, current_address, notes) VALUES\n")
            b_lines = []
            for b_num, b_data in bins.items():
                line_str = f"  ({escape_sql(b_num)}, {escape_sql(b_data['size'])}::public.bin_size, {escape_sql(b_data['status'])}::public.bin_status, {escape_sql(b_data['address'])}, {escape_sql(b_data['note'])})"
                b_lines.append(line_str)
            sql.write(",\n".join(b_lines))
            sql.write("\nON CONFLICT (bin_number) DO UPDATE SET \n")
            sql.write("  size = EXCLUDED.size, \n")
            sql.write("  status = EXCLUDED.status, \n")
            sql.write("  current_address = EXCLUDED.current_address, \n")
            sql.write("  notes = EXCLUDED.notes,\n")
            sql.write("  current_order_id = CASE WHEN EXCLUDED.status = 'depot' THEN NULL ELSE public.bins.current_order_id END;\n\n")

        if orders:
            for o in orders.values():
                sql.write("INSERT INTO public.orders (order_number, type, bin_size, bin_type, service_date, time_window, time_window_custom, address, customer_name, customer_phone, customer_notes, status) VALUES\n")
                line_str = f"  ({escape_sql(o['order_number'])}, {escape_sql(o['type'])}::public.order_type, {escape_sql(o['bin_size'])}::public.bin_size, {escape_sql(o['bin_type'])}::public.bin_type, {escape_sql(o['service_date'])}::date, {escape_sql(o['time_window'])}::public.time_window, {escape_sql(o['time_window_custom'])}, {escape_sql(o['address'])}, {escape_sql(o['customer_name'])}, {escape_sql(o['customer_phone'])}, {escape_sql(o['customer_notes'])}, {escape_sql(o['status'])}::public.order_status)"
                sql.write(line_str)
                sql.write("\nON CONFLICT (order_number, type) DO UPDATE SET\n")
                sql.write("  bin_size = EXCLUDED.bin_size,\n")
                sql.write("  bin_type = EXCLUDED.bin_type,\n")
                sql.write("  service_date = EXCLUDED.service_date,\n")
                sql.write("  time_window = EXCLUDED.time_window,\n")
                sql.write("  address = EXCLUDED.address,\n")
                sql.write("  status = EXCLUDED.status,\n")
                sql.write("  updated_at = now();\n\n")

        if orders_to_complete:
            sql.write("-- Complete existing delivery orders when a pickup is synced\n")
            for o_num in orders_to_complete:
                sql.write(f"UPDATE public.orders SET status = 'done', updated_at = now() WHERE order_number = {escape_sql(o_num)} AND type = 'delivery';\n")
            sql.write("\n")

        sql.write("COMMIT;\n")

    print(f"\n[OK] SQL generated:")
    print(f"   {len(bins)} bin updates")
    print(f"   {sum(1 for o in orders.values() if o['type'] == 'delivery')} new/updated delivery orders")
    print(f"   {sum(1 for o in orders.values() if o['type'] == 'pickup')} new/updated pickup orders")
    print(f"   {len(orders_to_complete)} delivery orders marked done (pickup completed)")
    print(f"   -> {OUTPUT_SQL}")

if __name__ == "__main__":
    process()
