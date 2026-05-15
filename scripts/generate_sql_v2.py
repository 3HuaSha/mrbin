import csv
import os
from datetime import datetime

# Configuration
CSV_PATH = r'c:\Users\MrBin\Desktop\task1\Orders_Log_2026.csv'
OUTPUT_SQL = r'c:\Users\MrBin\Desktop\task1\import_orders_bins.sql'

def parse_date(date_str):
    if not date_str: return None
    try:
        # Expected format: 6-Jan-26 or 10-Jan-26
        return datetime.strptime(date_str.strip(), '%d-%b-%y').date().isoformat()
    except:
        try:
             return datetime.strptime(date_str.strip(), '%d-%b-%Y').date().isoformat()
        except:
            return None

def get_sequence(val):
    try:
        s = "".join(filter(str.isdigit, str(val)))
        return int(s) if s else 0
    except:
        return 0

def map_bin_size(size_str):
    if not size_str: return '14'
    s = size_str.upper()
    if '14' in s: return '14'
    if '20' in s: return '20'
    if '30' in s: return '30'
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
    bins_history = {}

    print(f"Processing CSV: {CSV_PATH}")
    with open(CSV_PATH, 'r', encoding='utf-8') as f:
        reader = csv.reader(f)
        header = next(reader)
        
        # Column Indices (based on visual inspection of the file)
        # 0: , 1: 日期, 2: Weekday, 3: 月, 4: 单号, 5: 桶号（送）, 6: 時間, 7: 司機, 8: Note, 9: BIN SIZE, 10: 排班序号, 11: 送 / 收, 12: Address, 13: Unnamed: 13, 14: Phone Number
        idx_date = 1
        idx_order = 4
        idx_bin = 5
        idx_note = 8
        idx_size = 9
        idx_seq = 10
        idx_type = 11 # 送 / 收
        idx_address = 12
        idx_phone = 14 # Corrected to 14
        
        for i, row in enumerate(reader):
            if len(row) < 15: continue
            order_num = row[idx_order].strip()
            if not order_num or len(order_num) < 3: continue
            # Only process standard order prefixes
            if not (order_num.startswith('SOT') or order_num.startswith('D') or order_num.startswith('SOB') or order_num.startswith('S0T')):
                continue
            
            raw_type = row[idx_type].strip()
            note = row[idx_note].strip()
            size_text = row[idx_size].strip()
            combined_text = (note + " " + size_text).upper()
            
            is_swap_text = '换' in combined_text or 'EXCHANGE' in combined_text or 'SWAP' in combined_text
            
            row_data = {
                'order_number': order_num,
                'date': row[idx_date],
                'bin_number': row[idx_bin].strip(),
                'bin_size': map_bin_size(size_text),
                'bin_type': map_bin_type(combined_text),
                'raw_type': raw_type, 
                'seq_num': get_sequence(row[idx_seq]),
                'is_swap_text': is_swap_text,
                'address': row[idx_address].strip(),
                'phone': row[idx_phone].strip(),
                'note': note,
                'row_idx': i 
            }
            
            if order_num not in orders_map:
                orders_map[order_num] = []
            orders_map[order_num].append(row_data)
            
            bin_num = row_data['bin_number']
            if bin_num:
                if bin_num not in bins_history:
                    bins_history[bin_num] = []
                bins_history[bin_num].append(row_data)

    # Final Bin Status Determination
    final_bins = []
    for bin_num, rows in bins_history.items():
        # Sort chronologically
        sorted_rows = sorted(rows, key=lambda r: (
            parse_date(r['date']) or '0000-00-00',
            r['seq_num'],
            r['row_idx']
        ))
        
        last_row = sorted_rows[-1]
        # status: on_site if last action was '送' or it's a swap, else depot
        status = 'on_site' if last_row['raw_type'] == '送' or last_row['is_swap_text'] else 'depot'
        
        addr = last_row['address'] if status == 'on_site' else None
        s_date = parse_date(last_row['date']) or datetime.now().date().isoformat()
        
        final_bins.append({
            'bin_number': bin_num,
            'size': last_row['bin_size'],
            'status': status,
            'current_address': addr,
            'last_moved_at': s_date,
            'notes': f"Last action: {last_row['raw_type']} (Seq {last_row['seq_num']}) for Order {last_row['order_number']}"
        })

    # Generate SQL
    with open(OUTPUT_SQL, 'w', encoding='utf-8') as sql:
        sql.write("-- Generated import script for Bins and Orders\nBEGIN;\n\n")
        
        # 1. Bins
        sql.write("-- 1. Update Bins Status\n")
        if final_bins:
            sql.write("INSERT INTO public.bins (bin_number, size, status, current_address, last_moved_at, notes, is_active) VALUES\n")
            bin_lines = [f"  ({escape_sql(b['bin_number'])}, {escape_sql(b['size'])}::public.bin_size, {escape_sql(b['status'])}::public.bin_status, {escape_sql(b['current_address'])}, {escape_sql(b['last_moved_at'])}::timestamptz, {escape_sql(b['notes'])}, true)" for b in final_bins]
            sql.write(",\n".join(bin_lines))
            sql.write("\nON CONFLICT (bin_number) DO UPDATE SET size = EXCLUDED.size, status = EXCLUDED.status, current_address = EXCLUDED.current_address, last_moved_at = EXCLUDED.last_moved_at, notes = EXCLUDED.notes;\n\n")

        # 2. Orders
        sql.write("-- 2. Update Orders\n")
        order_lines = []
        for order_num, rows in orders_map.items():
            has_swap = any(r['is_swap_text'] for r in rows)
            has_delivery = any(r['raw_type'] == '送' for r in rows)
            has_pickup = any(r['raw_type'] == '收' for r in rows)
            
            final_type = 'delivery'
            if has_swap: final_type = 'swap'
            elif has_delivery and has_pickup: final_type = 'delivery' 
            elif has_pickup: final_type = 'pickup'
            
            # Simple status logic
            status = 'done' if len(rows) >= 2 else ('in_progress' if has_delivery else 'done')

            base = rows[0]
            s_date = parse_date(base['date']) or datetime.now().date().isoformat()
            name = base['address'].split(',')[0][:50]
            order_lines.append(f"  ({escape_sql(order_num)}, {escape_sql(final_type)}::public.order_type, {escape_sql(base['bin_size'])}::public.bin_size, {escape_sql(base['bin_type'])}::public.bin_type, DATE {escape_sql(s_date)}, 'AM'::public.time_window, {escape_sql(base['address'])}, {escape_sql(name)}, {escape_sql(base['phone'])}, {escape_sql(base['note'])}, {escape_sql(status)}::public.order_status)")

        batch_size = 500
        for i in range(0, len(order_lines), batch_size):
            sql.write("INSERT INTO public.orders (order_number, type, bin_size, bin_type, service_date, time_window, address, customer_name, customer_phone, customer_notes, status) VALUES\n")
            sql.write(",\n".join(order_lines[i:i+batch_size]))
            sql.write("\nON CONFLICT (order_number, type) DO UPDATE SET bin_size = EXCLUDED.bin_size, bin_type = EXCLUDED.bin_type, service_date = EXCLUDED.service_date, address = EXCLUDED.address, status = EXCLUDED.status, updated_at = now();\n\n")

        sql.write("COMMIT;\n")
    print(f"SQL file generated at {OUTPUT_SQL}")

if __name__ == "__main__":
    process_data()
