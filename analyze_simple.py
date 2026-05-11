import csv
import json
import sys

# Set console encoding to UTF-8 for Windows
if sys.platform == 'win32':
    import codecs
    sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer, 'strict')
    sys.stderr = codecs.getwriter('utf-8')(sys.stderr.buffer, 'strict')

filePath = r'c:\Users\MrBin\Desktop\task1\Transportation Log 2026 - 2026 log (桶).csv'

orders = {}  # order_number -> { count, rows: [] }

with open(filePath, 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    for row in reader:
        orderNumber = row.get('单号', '').strip()
        if not orderNumber:
            continue
        
        if orderNumber not in orders:
            orders[orderNumber] = {
                'count': 0,
                'rows': []
            }
        orders[orderNumber]['count'] += 1
        orders[orderNumber]['rows'].append(row)

print(f'总订单数: {len(orders)}')

# Find orders that appear only once
singleOccurrenceOrders = []
for orderNumber, data in orders.items():
    if data['count'] == 1:
        singleOccurrenceOrders.append({
            'orderNumber': orderNumber,
            'row': data['rows'][0]
        })

print(f'只出现一次的订单数: {len(singleOccurrenceOrders)}')

# Check if these orders contain bucket delivery
# Check if J column (BIN SIZE) contains "桶", "bin", or "BIN"
unreturnedOrders = []
for order in singleOccurrenceOrders:
    row = order['row']
    bucketNumber = row.get('桶号（送）', '').strip()
    binSize = row.get('BIN SIZE ', '').strip()
    type_col = row.get('送 / 收', '').strip()
    
    # Check if it's a delivery order with bucket
    isBucketDelivery = False
    if type_col == '送':
        if '桶' in binSize or 'BIN' in binSize.upper():  # BIN SIZE contains "桶" or "BIN"
            isBucketDelivery = True
    
    if isBucketDelivery:
        unreturnedOrders.append({
            'orderNumber': order['orderNumber'],
            'bucketNumber': bucketNumber,
            'binSize': binSize,
            'address': row.get('Address', '').strip(),
            'phone': row.get('Phone Number ', '').strip(),
            'date': row.get('日期', '').strip(),
            'driver': row.get('司機', '').strip(),
            'note': row.get('Note', '').strip()
        })

print(f'\n=== 没有收桶的订单（只出现一次且送桶） ===')
print(f'数量: {len(unreturnedOrders)}')

print('\n订单详情:')
for order in unreturnedOrders:
    print(f"- 订单号: {order['orderNumber']} | 桶号: {order['bucketNumber']} | 尺寸: {order['binSize']} | 地址: {order['address']}")

# Extract unique bucket numbers
uniqueBuckets = {}
for order in unreturnedOrders:
    bucketNumber = order['bucketNumber'] or 'NO-BUCKET-NUMBER'
    if bucketNumber not in uniqueBuckets:
        uniqueBuckets[bucketNumber] = {
            'bucketNumber': bucketNumber,
            'binSize': order['binSize'],
            'currentAddress': order['address'],
            'orders': []
        }
    uniqueBuckets[bucketNumber]['orders'].append(order['orderNumber'])

print(f'\n=== 需要收回的桶信息 ===')
print(f'桶数量: {len(uniqueBuckets)}')

bucketsArray = list(uniqueBuckets.values())
print('\n桶详情:')
for bucket in bucketsArray:
    print(f"- 桶号: {bucket['bucketNumber']} | 尺寸: {bucket['binSize']} | 订单数: {len(bucket['orders'])} | 地址: {bucket['currentAddress']}")

# Save to JSON files
with open('unreturned_orders.json', 'w', encoding='utf-8') as f:
    json.dump(unreturnedOrders, f, indent=2, ensure_ascii=False)

with open('unique_buckets.json', 'w', encoding='utf-8') as f:
    json.dump(bucketsArray, f, indent=2, ensure_ascii=False)

print('\n=== 已保存到文件 ===')
print('- unreturned_orders.json (没有收桶的订单)')
print('- unique_buckets.json (桶信息)')
