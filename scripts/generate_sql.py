import csv
import os
from datetime import datetime

# Configuration
CSV_PATH = r'c:\Users\MrBin\Desktop\task1\Transportation Log 2026 - 2026 log (桶).csv'
OUTPUT_SQL = r'c:\Users\MrBin\Desktop\task1\import_data.sql'

def parse_date(date_str):
    if not date_str: return None
    try:
        return datetime.strptime(date_str.strip(), '%d-%b-%y').date().isoformat()
    except:
        try:
             return datetime.strptime(date_str.strip(), '%d-%b-%Y').date().isoformat()
        except:
            return None

def map_bin_size(size_str):
    if not size_str: return '14'
    s = size_str.upper()
    if '14' in s: return '14'
    if '20' in s: return '20'
    if '40' in s: return '40'
    return '14'

def map_bin_type(text):
    if not text: return 'garbage'
    t = text.lower()
    if '砖' in t or 'brick' in t: return 'brick'
    if '土' in t or 'soil' in t: return 'soil'
    if '水泥' in t or 'cement' in t: return 'cement'
    if '沥青' in t or 'asphalt' in t: return 'asphalt'
    return 'garbage'

def escape_sql(val):
    if val is None: return "NULL"
    return "'" + str(val).replace("'", "''") + "'"

def process_data():
    orders_map = {}
    bins_map = {}

    print("Processing CSV with Swap detection...")
    with open(CSV_PATH, 'r', encoding='utf-8') as f:
        reader = csv.reader(f)
        next(reader) # skip headers
        next(reader)
        
        idx_date = 1
        idx_order = 4
        idx_bin = 5
        idx_driver = 7
        idx_note = 8
        idx_size = 9
        idx_type = 11
        idx_address = 12
        idx_phone = 13
        
        for row in reader:
            if len(row) < 14: continue
            order_num = row[idx_order].strip()
            if not order_num or len(order_num) < 3: continue
            if not (order_num.startswith('SOT') or order_num.startswith('D') or order_num.startswith('SOB')):
                continue
            
            # Detect Swap/Exchange
            raw_type = row[idx_type].strip()
            raw_size_note = row[idx_size] + " " + row[idx_note]
            is_swap = '换' in raw_size_note or 'EXCHANGE' in raw_size_note.upper()
            
            row_data = {
                'order_number': order_num,
                'date': row[idx_date],
                'bin_number': row[idx_bin].strip(),
                'bin_size': map_bin_size(row[idx_size]),
                'bin_type': map_bin_type(raw_size_note),
                'type': 'swap' if is_swap else ('delivery' if raw_type == '送' else 'pickup'),
                'address': row[idx_address].strip(),
                'phone': row[idx_phone].strip(),
                'note': row[idx_note].strip(),
                'driver': row[idx_driver].strip()
            }
            
            if order_num not in orders_map:
                orders_map[order_num] = []
            orders_map[order_num].append(row_data)
            
            bin_num = row_data['bin_number']
            if bin_num and bin_num != '':
                bins_map[bin_num] = {
                    'bin_number': bin_num,
                    'size': row_data['bin_size'],
                    'last_raw_type': raw_type,
                    'last_address': row_data['address'],
                    'last_date': row_data['date'],
                    'last_note': row_data['note'],
                    'last_order': order_num
                }

    with open(OUTPUT_SQL, 'w', encoding='utf-8') as sql:
        sql.write("-- Generated import script with Swap support\n")
        sql.write("BEGIN;\n\n")
        
        # 1. Bins
        sql.write("-- 1. Import Bins\n")
        sql.write("INSERT INTO public.bins (bin_number, size, status, current_address, last_moved_at, notes, is_active)\nVALUES\n")
        bin_lines = []
        for bin_num, info in bins_map.items():
            status = 'on_site' if info['last_raw_type'] == '送' else 'depot'
            addr = info['last_address'] if status == 'on_site' else None
            s_date = parse_date(info['last_date']) or datetime.now().date().isoformat()
            note = f"Last order {info['last_order']}. {info['last_note']}"
            bin_lines.append(f"  ({escape_sql(bin_num)}, {escape_sql(info['size'])}::public.bin_size, {escape_sql(status)}::public.bin_status, {escape_sql(addr)}, {escape_sql(s_date)}::timestamptz, {escape_sql(note)}, true)")
        
        sql.write(",\n".join(bin_lines))
        sql.write("\nON CONFLICT (bin_number) DO UPDATE SET size = EXCLUDED.size, status = EXCLUDED.status, current_address = EXCLUDED.current_address, last_moved_at = EXCLUDED.last_moved_at, notes = EXCLUDED.notes;\n\n")

        # 2. Orders
        sql.write("-- 2. Import Orders\n")
        order_lines = []
        for order_num, rows in orders_map.items():
            # If any row is 'swap', the whole order is 'swap'
            # If rows >= 2, status is 'done'
            # If row is '送' only, in_progress
            # If row is '收' only, done
            has_swap = any(r['type'] == 'swap' for r in rows)
            status = 'done' if len(rows) >= 2 else 'pending'
            
            final_type = 'delivery'
            if has_swap:
                final_type = 'swap'
            elif any(r['type'] == 'delivery' for r in rows):
                final_type = 'delivery'
                if len(rows) == 1: status = 'in_progress'
                else: status = 'done'
            else:
                final_type = 'pickup'
                status = 'done'

            base = rows[0]
            s_date = parse_date(base['date']) or datetime.now().date().isoformat()
            name = base['address'].split(',')[0][:50]
            
            order_lines.append(f"  ({escape_sql(order_num)}, {escape_sql(final_type)}::public.order_type, {escape_sql(base['bin_size'])}::public.bin_size, {escape_sql(base['bin_type'])}::public.bin_type, DATE {escape_sql(s_date)}, 'AM'::public.time_window, {escape_sql(base['address'])}, {escape_sql(name)}, {escape_sql(base['phone'])}, {escape_sql(base['note'])}, {escape_sql(status)}::public.order_status)")

        batch_size = 500
        for i in range(0, len(order_lines), batch_size):
            sql.write("INSERT INTO public.orders (order_number, type, bin_size, bin_type, service_date, time_window, address, customer_name, customer_phone, customer_notes, status)\nVALUES\n")
            batch = order_lines[i:i+batch_size]
            sql.write(",\n".join(batch))
            sql.write("\nON CONFLICT (order_number, type) DO UPDATE SET bin_size = EXCLUDED.bin_size, bin_type = EXCLUDED.bin_type, service_date = EXCLUDED.service_date, address = EXCLUDED.address, status = EXCLUDED.status, updated_at = now();\n\n")

        sql.write("COMMIT;\n")

    print(f"SQL script with SWAP support generated at {OUTPUT_SQL}")

if __name__ == "__main__":
    process_data()
