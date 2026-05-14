import csv
import sys

# Set encoding for stdout
sys.stdout.reconfigure(encoding='utf-8')

CSV_PATH = r'c:\Users\MrBin\Desktop\task1\Transportation Log 2026 - 2026 log (桶).csv'

def find_duplicates():
    orders = {}
    with open(CSV_PATH, 'r', encoding='utf-8') as f:
        reader = csv.reader(f)
        next(reader)
        next(reader)
        for row in reader:
            if len(row) < 14: continue
            order_num = row[4].strip()
            if not order_num: continue
            if order_num not in orders:
                orders[order_num] = []
            orders[order_num].append(row)
            
    print("Orders with multiple rows on same day:")
    count = 0
    for order_num, rows in orders.items():
        if len(rows) > 1:
            dates = [r[1] for r in rows]
            if len(set(dates)) < len(dates):
                # Same day duplicates
                print(f"Order: {order_num}")
                for r in rows:
                    print(f"  Date: {r[1]}, Type: {r[11]}, Bin: {r[5]}, Note: {r[8]}")
                print("-" * 20)
                count += 1
                if count > 20: break # stop after some samples

if __name__ == "__main__":
    find_duplicates()
