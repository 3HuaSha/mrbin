import csv
import sys

sys.stdout.reconfigure(encoding='utf-8')

CSV_PATH = r'c:\Users\MrBin\Desktop\task1\Transportation Log 2026 - 2026 log (桶).csv'

def check_col_k():
    with open(CSV_PATH, 'r', encoding='utf-8') as f:
        reader = csv.reader(f)
        next(reader)
        next(reader)
        for i, row in enumerate(reader):
            if len(row) > 10:
                print(f"Row {i}: Col K (idx 10): '{row[10]}', Type: {row[11]}, Bin: {row[5]}")
            if i > 20: break

if __name__ == "__main__":
    check_col_k()
