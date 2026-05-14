import csv
import json
import os
import requests
import time
from datetime import datetime

# Configuration
CSV_PATH = r'c:\Users\MrBin\Desktop\task1\Transportation Log 2026 - 2026 log (桶).csv'
ENV_PATH = r'c:\Users\MrBin\Desktop\task1\.env'

def load_env(path):
    env = {}
    if not os.path.exists(path):
        print(f"Error: .env file not found at {path}")
        return None
    with open(path, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                key, value = line.split('=', 1)
                env[key.strip()] = value.strip('"').strip("'").strip()
    return env

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

def process_data():
    orders_map = {}
    bins_map = {}

    print("Reading CSV...")
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
            
            row_data = {
                'order_number': order_num,
                'date': row[idx_date],
                'bin_number': row[idx_bin].strip(),
                'bin_size': map_bin_size(row[idx_size]),
                'type': row[idx_type].strip(),
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
                    'last_type': row_data['type'],
                    'last_address': row_data['address'],
                    'last_date': row_data['date']
                }

    final_orders = []
    for order_num, rows in orders_map.items():
        # Twice = done, Once 送 = in_progress
        status = 'done' if len(rows) >= 2 else 'pending'
        if len(rows) == 1:
            if rows[0]['type'] == '送':
                status = 'in_progress'
            else:
                status = 'done'
        
        base = rows[0]
        s_date = parse_date(base['date']) or datetime.now().date().isoformat()
        
        final_orders.append({
            'order_number': order_num,
            'type': 'delivery' if base['type'] == '送' else 'pickup',
            'bin_size': base['bin_size'],
            'service_date': s_date,
            'time_window': 'AM',
            'address': base['address'],
            'customer_name': base['address'].split(',')[0][:50],
            'customer_phone': base['phone'],
            'customer_notes': base['note'],
            'status': status
        })

    final_bins = []
    for bin_num, info in bins_map.items():
        status = 'on_site' if info['last_type'] == '送' else 'depot'
        final_bins.append({
            'bin_number': bin_num,
            'size': info['size'],
            'status': status,
            'current_address': info['last_address'] if status == 'on_site' else None,
            'is_active': True
        })

    return final_orders, final_bins

def upload_to_supabase(table, data, env):
    url = f"{env['SUPABASE_URL']}/rest/v1/{table}"
    headers = {
        "apikey": env['SUPABASE_SERVICE_ROLE_KEY'],
        "Authorization": f"Bearer {env['SUPABASE_SERVICE_ROLE_KEY']}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates" # Upsert logic
    }
    
    print(f"Uploading {len(data)} records to {table}...")
    # Batch in 100s
    batch_size = 100
    for i in range(0, len(data), batch_size):
        batch = data[i:i+batch_size]
        response = requests.post(url, headers=headers, data=json.dumps(batch))
        if response.status_code not in [200, 201]:
            print(f"Error uploading batch {i//batch_size + 1}: {response.text}")
        else:
            print(f"Batch {i//batch_size + 1} uploaded.")
        time.sleep(0.5) # Slight delay to avoid rate limits

if __name__ == "__main__":
    env = load_env(ENV_PATH)
    if not env: exit(1)
    
    orders, bins = process_data()
    
    print(f"\nReady to upload {len(orders)} orders and {len(bins)} bins.")
    confirm = input("Proceed with upload to cloud Supabase? (y/n): ")
    if confirm.lower() == 'y':
        upload_to_supabase('bins', bins, env)
        upload_to_supabase('orders', orders, env)
        print("\nUpload complete!")
    else:
        print("\nUpload cancelled.")
