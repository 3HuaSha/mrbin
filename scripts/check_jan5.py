import csv
import sys

sys.stdout.reconfigure(encoding='utf-8')

CSV_PATH = r'c:\Users\MrBin\Desktop\task1\Transportation Log 2026 - 2026 log (桶).csv'

def check_jan5():
    with open(CSV_PATH, 'r', encoding='utf-8') as f:
        reader = csv.reader(f)
        for i, row in enumerate(reader):
            if "5-Jan-26" in str(row):
                print(f"Row {i}: Col K (idx 10): '{row[10]}', Type: {row[11]}, Bin: {row[5]}, Order: {row[4]}")

if __name__ == "__main__":
    check_jan5()
