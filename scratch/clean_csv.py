import csv

file_path = r'c:\Users\MrBin\Desktop\task1\Orders_Log_2026.csv'
output_path = r'c:\Users\MrBin\Desktop\task1\Orders_Log_2026_cleaned.csv'

with open(file_path, mode='r', encoding='utf-8') as f:
    reader = csv.reader(f)
    rows = list(reader)

if not rows:
    print("File is empty")
    exit()

header = rows[0]
print(f"Total columns: {len(header)}")
# AF is column 32 (1-indexed), so index 31
af_index = 31

if len(header) <= af_index:
    print(f"Error: File only has {len(header)} columns, but trying to access index {af_index} (Column AF)")
    exit()

print(f"Column AF header name: {header[af_index]}")

filtered_rows = [header]
removed_count = 0

for i, row in enumerate(rows[1:], start=2):
    if len(row) > af_index and row[af_index].strip():
        removed_count += 1
        # print(f"Removing row {i}: {row[af_index]}")
    else:
        filtered_rows.append(row)

print(f"Removed {removed_count} rows.")
print(f"Remaining {len(filtered_rows) - 1} rows.")

with open(output_path, mode='w', encoding='utf-8', newline='') as f:
    writer = csv.writer(f)
    writer.writerows(filtered_rows)

print(f"Cleaned file saved to: {output_path}")
