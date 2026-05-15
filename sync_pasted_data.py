import sys
import os
import re
from datetime import datetime

# ==========================================
# Config
# ==========================================
OUTPUT_SQL = r'c:\Users\MrBin\Desktop\task1\daily_sync.sql'

def parse_date(date_str):
    if not date_str: return datetime.now().date().isoformat()
    date_str = date_str.strip()
    for fmt in ('%d-%b-%y', '%d-%b-%Y', '%Y-%m-%d', '%m/%d/%Y', '%Y/%m/%d'):
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
    
    # Otherwise just find any size
    if '40' in s: return '40'
    if '30' in s: return '30'
    if '20' in s: return '20'
    if '14' in s: return '14'
    return '14'

def map_bin_type(text, size_text):
    t = (str(text) + " " + str(size_text)).lower()
    if '砖' in t or 'brick' in t: return 'brick'
    if '土' in t or 'soil' in t: return 'soil'
    if '水泥' in t or 'cement' in t: return 'cement'
    if '沥青' in t or 'asphalt' in t: return 'asphalt'
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

def process():
    # If a filename is provided as an argument, read from it. Otherwise use stdin.
    if len(sys.argv) > 1 and os.path.exists(sys.argv[1]):
        with open(sys.argv[1], 'r', encoding='utf-8', errors='ignore') as f:
            raw_input = f.read()
    else:
        # Ensure we handle UTF-8 correctly for stdin on Windows
        import io
        try:
            sys.stdin = io.TextIOWrapper(sys.stdin.detach(), encoding='utf-8', errors='ignore')
        except:
            pass # Already wrapped or not possible
        raw_input = sys.stdin.read()
    
    if not raw_input.strip():
        print("No input data found.")
        return

    lines = raw_input.strip().split('\n')
    print(f"Processing {len(lines)} lines...")
    orders = {}
    bins = {}

    for i, line in enumerate(lines):
        line = line.strip()
        if not line: continue
        row = line.split('\t')
        if len(row) < 11: continue
        
        # Skip if column 31 (usually internal flags) is set
        if len(row) > 31 and row[31].strip():
            continue

        order_num = row[3].strip()
        if not order_num: continue

        bin_num = row[4].strip()
        raw_time = row[5].strip()
        note = row[7].strip()
        size_raw = row[8].strip()
        action = row[10].strip() # 送 / 收
        address = row[11].strip()
        phone = row[13].strip() if len(row) > 13 else ""
        date = parse_date(row[0])

        # Smart size extraction
        size = map_bin_size(size_raw + " " + note)
        bin_type = map_bin_type(note, size_raw)
        time_window = map_time_window(raw_time)
        
        # Action based order type
        order_type = 'delivery'
        if '收' in action or 'PICK' in action.upper() or 'RETURN' in action.upper():
            order_type = 'pickup'
        elif order_num.startswith('SOA'):
            order_type = 'material'

        if order_type == 'pickup':
            order_status = 'done'
            if bin_num:
                bins[bin_num] = {
                    'status': 'depot',
                    'address': 'Depot',
                    'size': size,
                    'note': f'Picked up via {order_num}'
                }
        else: # delivery / material
            if bin_num:
                order_status = 'done'
                bins[bin_num] = {
                    'status': 'on_site',
                    'address': address,
                    'size': size,
                    'note': f'Delivered via {order_num}'
                }
            else:
                order_status = 'pending'

        orders[order_num] = {
            'order_number': order_num,
            'type': order_type,
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
                line = f"  ({escape_sql(b_num)}, {escape_sql(b_data['size'])}::public.bin_size, {escape_sql(b_data['status'])}::public.bin_status, {escape_sql(b_data['address'])}, {escape_sql(b_data['note'])})"
                b_lines.append(line)
            sql.write(",\n".join(b_lines))
            sql.write("\nON CONFLICT (bin_number) DO UPDATE SET \n")
            sql.write("  size = EXCLUDED.size, \n")
            sql.write("  status = EXCLUDED.status, \n")
            sql.write("  current_address = EXCLUDED.current_address, \n")
            sql.write("  notes = EXCLUDED.notes;\n\n")

        if orders:
            order_list = list(orders.values())
            for o in order_list:
                sql.write("INSERT INTO public.orders (order_number, type, bin_size, bin_type, service_date, time_window, time_window_custom, address, customer_name, customer_phone, customer_notes, status) VALUES\n")
                line = f"  ({escape_sql(o['order_number'])}, {escape_sql(o['type'])}::public.order_type, {escape_sql(o['bin_size'])}::public.bin_size, {escape_sql(o['bin_type'])}::public.bin_type, {escape_sql(o['service_date'])}::date, {escape_sql(o['time_window'])}::public.time_window, {escape_sql(o['time_window_custom'])}, {escape_sql(o['address'])}, {escape_sql(o['customer_name'])}, {escape_sql(o['customer_phone'])}, {escape_sql(o['customer_notes'])}, {escape_sql(o['status'])}::public.order_status)"
                sql.write(line)
                sql.write("\nON CONFLICT (order_number, type) DO UPDATE SET\n")
                sql.write("  bin_size = EXCLUDED.bin_size,\n")
                sql.write("  bin_type = EXCLUDED.bin_type,\n")
                sql.write("  service_date = EXCLUDED.service_date,\n")
                sql.write("  time_window = EXCLUDED.time_window,\n")
                sql.write("  address = EXCLUDED.address,\n")
                sql.write("  status = EXCLUDED.status,\n")
                sql.write("  updated_at = now();\n\n")
        sql.write("COMMIT;\n")

if __name__ == "__main__":
    process()
