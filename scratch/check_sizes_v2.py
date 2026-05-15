import csv
s = set()
with open(r'c:\Users\MrBin\Desktop\task1\Orders_Log_2026.csv', 'r', encoding='utf-8') as f:
    r = csv.reader(f)
    next(r)
    for row in r:
        if len(row) > 9:
            s.add(row[9])
with open(r'c:\Users\MrBin\Desktop\task1\scratch\sizes_out.txt', 'w', encoding='utf-8') as out:
    out.write(str(s))
