import csv
import json
import os
import requests
from datetime import datetime

# Configuration
CSV_PATH = r'c:\Users\MrBin\Desktop\task1\Transportation Log 2026 - 2026 log (桶).csv'
ENV_PATH = r'c:\Users\MrBin\Desktop\task1\.env'

def parse_date(date_str):
    if not date_str: return None
    try:
        # Example: 9-Feb-26 or 1-Jan-26
        # Handle cases like 2-Jan-25
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
    if '30' in s: return '20' # Map 30 to 20 if needed, or 40
    return '14'

def process_data():
    orders_map = {} # order_number -> list of rows
    bins_map = {}   # bin_number -> latest_info

    print("Reading CSV with csv.reader...")
    with open(CSV_PATH, 'r', encoding='utf-8') as f:
        reader = csv.reader(f)
        # Skip headers (Row 1 and 2)
        next(reader)
        next(reader)
        
        # Indices based on analysis:
        # 1: 日期, 4: 单号, 5: 桶号, 7: 司機, 8: Note, 9: BIN SIZE, 11: 送/收, 12: Address, 13: Phone
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
            # Basic validation for order number
            if not order_num or len(order_num) < 3: continue
            if not (order_num.startswith('SOT') or order_num.startswith('D') or order_num.startswith('SOB')):
                continue
            
            row_data = {
                'order_number': order_num,
                'date': row[idx_date],
                'bin_number': row[idx_bin].strip(),
                'bin_size': map_bin_size(row[idx_size]),
                'type': row[idx_type].strip(), # 送 or 收
                'address': row[idx_address].strip(),
                'phone': row[idx_phone].strip(),
                'note': row[idx_note].strip(),
                'driver': row[idx_driver].strip()
            }
            
            if order_num not in orders_map:
                orders_map[order_num] = []
            orders_map[order_num].append(row_data)
            
            # Bin tracking
            bin_num = row_data['bin_number']
            if bin_num and bin_num != '':
                # Update bin info with the latest occurrence (assuming CSV is chronological)
                bins_map[bin_num] = {
                    'bin_number': bin_num,
                    'size': row_data['bin_size'],
                    'last_type': row_data['type'],
                    'last_address': row_data['address'],
                    'last_date': row_data['date']
                }

    print(f"Total Valid Orders: {len(orders_map)}")
    print(f"Total Valid Bins: {len(bins_map)}")

    # Prepare for Supabase
    final_orders = []
    for order_num, rows in orders_map.items():
        # Logic: Twice = done, Once "送" = in_progress
        status = 'done' if len(rows) >= 2 else 'pending'
        if len(rows) == 1:
            if rows[0]['type'] == '送':
                status = 'in_progress'
            else:
                status = 'done'
        
        # Use first row for order details
        base = rows[0]
        s_date = parse_date(base['date'])
        if not s_date: s_date = datetime.now().date().isoformat()
        
        final_orders.append({
            'order_number': order_num,
            'type': 'delivery' if base['type'] == '送' else 'pickup',
            'bin_size': base['bin_size'],
            'service_date': s_date,
            'time_window': 'AM',
            'address': base['address'],
            'customer_name': base['address'].split(',')[0][:50], # Rough estimate for name
            'customer_phone': base['phone'],
            'customer_notes': base['note'],
            'status': status
        })

    final_bins = []
    for bin_num, info in bins_map.items():
        # status mapping: if last was '送', it's on site. If '收', it's in depot.
        status = 'on_site' if info['last_type'] == '送' else 'depot'
        final_bins.append({
            'bin_number': bin_num,
            'size': info['size'],
            'status': status,
            'current_address': info['last_address'] if status == 'on_site' else None,
            'is_active': True
        })

    return final_orders, final_bins

if __name__ == "__main__":
    orders, bins = process_data()
    
    # Save a sample to verify
    with open('import_preview.json', 'w', encoding='utf-8') as f:
        json.dump({'orders': orders[:20], 'bins': bins[:20]}, f, indent=2, ensure_ascii=False)
    
    print("\nProcessed Data Summary:")
    print(f"Orders to import: {len(orders)}")
    print(f"Bins to import: {len(bins)}")
    print("\nPreview saved to import_preview.json. Please review carefully.")
