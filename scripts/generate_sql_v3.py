import csv
from datetime import datetime

# Configuration
CSV_PATH = r'c:\Users\MrBin\Desktop\task1\Orders_Log_2026.csv'
OUTPUT_SQL = r'c:\Users\MrBin\Desktop\task1\import_orders_bins_v3_with_cleanup.sql'

def parse_date(date_str):
    if not date_str: return None
    date_str = date_str.strip()
    # Try different formats
    for fmt in ('%d-%b-%y', '%d-%b-%Y', '%Y-%m-%d', '%m/%d/%Y'):
        try:
            return datetime.strptime(date_str, fmt).date().isoformat()
        except:
            continue
    return None

def map_bin_size(size_str):
    if not size_str: return '14'
    s = str(size_str).upper()
    if '14' in s: return '14'
    if '20' in s: return '20'
    if '30' in s: return '30'
    if '40' in s: return '40'
    return '14'

def map_bin_type(text):
    if not text: return 'garbage'
    t = str(text).lower()
    if '砖' in t or 'brick' in t: return 'brick'
    if '土' in t or 'soil' in t: return 'soil'
    if '水泥' in t or 'cement' in t: return 'cement'
    if '沥青' in t or 'asphalt' in t: return 'asphalt'
    return 'garbage'

def map_time_window(time_str):
    if not time_str: return 'ANYTIME'
    t = str(time_str).upper()
    if 'AM' in t: return 'AM'
    if 'PM' in t: return 'PM'
    return 'ANYTIME'

def escape_sql(val):
    if val is None: return "NULL"
    return "'" + str(val).replace("'", "''") + "'"

def process_data():
    print(f"Processing CSV: {CSV_PATH}")
    
    bins_to_update = {} # bin_number -> {status, address, size, date, note}
    orders_to_insert = []

    with open(CSV_PATH, 'r', encoding='utf-8') as f:
        reader = csv.reader(f)
        header = next(reader)
        
        # 1: 日期, 4: 单号, 5: 桶号（送）, 6: 時間, 8: Note, 9: BIN SIZE, 11: 送 / 收, 12: Address, 14: Phone Number
        idx_date = 1
        idx_order = 4
        idx_bin = 5
        idx_time = 6
        idx_note = 8
        idx_size = 9
        idx_type = 11
        idx_address = 12
        idx_phone = 14
        
        for i, row in enumerate(reader):
            if len(row) < 15: continue
            
            order_num = row[idx_order].strip()
            if not order_num: continue
            
            bin_num = row[idx_bin].strip()
            date = parse_date(row[idx_date])
            address = row[idx_address].strip()
            phone = row[idx_phone].strip()
            note = row[idx_note].strip()
            size = map_bin_size(row[idx_size])
            bin_type = map_bin_type(note + " " + row[idx_size])
            time_window = map_time_window(row[idx_time])
            
            # Logic based on user feedback:
            # If bin_num is present -> Already delivered, bin is on site, order is 'done'
            # If bin_num is empty -> New order, not yet delivered, order is 'pending'
            
            if bin_num:
                order_status = 'done'
                # Track the latest status for each bin
                # (Since we filtered out pickups, all these are '送' or '换')
                bins_to_update[bin_num] = {
                    'bin_number': bin_num,
                    'size': size,
                    'status': 'on_site',
                    'current_address': address,
                    'last_moved_at': date or datetime.now().date().isoformat(),
                    'notes': f"Delivered via order {order_num}"
                }
            else:
                order_status = 'pending'
            
            # Determine order type
            raw_type = row[idx_type].strip()
            order_type = 'delivery' # Default as per user's "加送的订单"
            if '换' in note or 'EXCHANGE' in note.upper() or 'SWAP' in note.upper():
                order_type = 'swap'
            elif raw_type == '收':
                order_type = 'pickup'

            customer_name = address.split(',')[0][:50] if address else 'Customer'
            
            orders_to_insert.append({
                'order_number': order_num,
                'type': order_type,
                'bin_size': size,
                'bin_type': bin_type,
                'service_date': date or datetime.now().date().isoformat(),
                'time_window': time_window,
                'address': address,
                'customer_name': customer_name,
                'customer_phone': phone,
                'customer_notes': note,
                'status': order_status
            })

    # Generate SQL
    with open(OUTPUT_SQL, 'w', encoding='utf-8') as sql:
        sql.write("-- Corrected import script with cleanup and enum fix\n")
        sql.write("-- Add missing enum value for 30YD bins\n")
        sql.write("ALTER TYPE public.bin_size ADD VALUE IF NOT EXISTS '30';\n\n")
        sql.write("BEGIN;\n\n")
        
        # 0. Cleanup existing data
        sql.write("-- 0. Cleanup existing data (Cascades to related tables)\n")
        sql.write("TRUNCATE public.job_steps, public.dispatch_assignments, public.bin_history CASCADE;\n")
        sql.write("DELETE FROM public.orders;\n")
        sql.write("DELETE FROM public.bins;\n\n")
        
        # 1. Bins
        sql.write("-- 1. Update Bins (Active bins on site)\n")
        if bins_to_update:
            sql.write("INSERT INTO public.bins (bin_number, size, status, current_address, last_moved_at, notes, is_active) VALUES\n")
            bin_lines = []
            for b in bins_to_update.values():
                line = f"  ({escape_sql(b['bin_number'])}, {escape_sql(b['size'])}::public.bin_size, {escape_sql(b['status'])}::public.bin_status, {escape_sql(b['current_address'])}, {escape_sql(b['last_moved_at'])}::timestamptz, {escape_sql(b['notes'])}, true)"
                bin_lines.append(line)
            sql.write(",\n".join(bin_lines))
            sql.write("\nON CONFLICT (bin_number) DO UPDATE SET size = EXCLUDED.size, status = EXCLUDED.status, current_address = EXCLUDED.current_address, last_moved_at = EXCLUDED.last_moved_at, notes = EXCLUDED.notes;\n\n")

        # 2. Orders
        sql.write("-- 2. Update Orders (Delivered or Pending)\n")
        if orders_to_insert:
            batch_size = 500
            for i in range(0, len(orders_to_insert), batch_size):
                batch = orders_to_insert[i:i+batch_size]
                sql.write("INSERT INTO public.orders (order_number, type, bin_size, bin_type, service_date, time_window, address, customer_name, customer_phone, customer_notes, status) VALUES\n")
                order_lines = []
                for o in batch:
                    line = f"  ({escape_sql(o['order_number'])}, {escape_sql(o['type'])}::public.order_type, {escape_sql(o['bin_size'])}::public.bin_size, {escape_sql(o['bin_type'])}::public.bin_type, DATE {escape_sql(o['service_date'])}, {escape_sql(o['time_window'])}::public.time_window, {escape_sql(o['address'])}, {escape_sql(o['customer_name'])}, {escape_sql(o['customer_phone'])}, {escape_sql(o['customer_notes'])}, {escape_sql(o['status'])}::public.order_status)"
                    order_lines.append(line)
                sql.write(",\n".join(order_lines))
                sql.write("\nON CONFLICT (order_number, type) DO UPDATE SET bin_size = EXCLUDED.bin_size, bin_type = EXCLUDED.bin_type, service_date = EXCLUDED.service_date, address = EXCLUDED.address, status = EXCLUDED.status, updated_at = now();\n\n")

        sql.write("COMMIT;\n")
    print(f"Final SQL generated at {OUTPUT_SQL}")

if __name__ == "__main__":
    process_data()
