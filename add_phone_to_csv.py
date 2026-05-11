import csv
import json
import sys

# Set console encoding to UTF-8 for Windows
if sys.platform == 'win32':
    import codecs
    sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer, 'strict')
    sys.stderr = codecs.getwriter('utf-8')(sys.stderr.buffer, 'strict')

# Read unreturned_orders.json to get phone mapping
with open('unreturned_orders.json', 'r', encoding='utf-8') as f:
    unreturned_orders = json.load(f)

# Create order number to phone mapping
phone_map = {}
for order in unreturned_orders:
    phone_map[order['orderNumber']] = order['phone']

print(f'Loaded {len(phone_map)} orders with phone numbers')

# Read bin_number.csv
csv_file = 'bin_number.csv'
output_file = 'bin_number_with_phone.csv'

rows = []
with open(csv_file, 'r', encoding='utf-8') as f:
    reader = csv.reader(f)
    for row in reader:
        rows.append(row)

# Add phone column to header
if rows[0][0] == '未收桶订单（含桶号）— 共 134 单':
    rows[0].append('电话')
    rows[1].append('电话')

# Add phone to each data row and filter out rows without phone
matched_count = 0
unmatched_orders = []
filtered_rows = [rows[0], rows[1]]  # Keep header rows
for i in range(2, len(rows)):
    row = rows[i]
    if len(row) >= 2:  # Has order number
        order_number = row[1]
        if order_number in phone_map:
            row.append(phone_map[order_number])
            matched_count += 1
            filtered_rows.append(row)  # Only add rows with phone numbers
        else:
            unmatched_orders.append(order_number)

print(f'Matched {matched_count} orders with phone numbers')
print(f'Unmatched {len(unmatched_orders)} orders (removed):')
for order in unmatched_orders:
    print(f'  - {order}')

# Update header with count
filtered_rows[0][0] = f'未收桶订单（含桶号）— 共 {matched_count} 单'

# Write to new file
with open(output_file, 'w', encoding='utf-8-sig', newline='') as f:
    writer = csv.writer(f)
    writer.writerows(filtered_rows)

print(f'\nSaved to {output_file}')
