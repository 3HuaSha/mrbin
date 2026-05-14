import csv
import sys

sys.stdout.reconfigure(encoding='utf-8')

CSV_PATH = r'c:\Users\MrBin\Desktop\task1\Transportation Log 2026 - 2026 log (桶).csv'

def find_k():
    with open(CSV_PATH, 'r', encoding='utf-8') as f:
        reader = csv.reader(f)
        headers = next(reader)
        print(f"Headers: {headers}")
        for i, row in enumerate(reader):
            if i < 5:
                print(f"Row {i}: {row}")
            if "7" in row and "Jason" in row: # From earlier Row 0 check
                print(f"Found row with '7': {row}")
                for j, col in enumerate(row):
                    print(f"  Index {j}: '{col}'")
                break

if __name__ == "__main__":
    find_k()
