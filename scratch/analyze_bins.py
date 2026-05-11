import csv
import os
from collections import defaultdict
from datetime import datetime

# 文件路径
input_file = r'Transportation Log 2026 - 2026 log (桶).csv'
out_bins_file = r'scratch/out_bins_report.csv'
inventory_file = r'scratch/bin_inventory_report.csv'

def parse_date(date_str):
    if not date_str or not isinstance(date_str, str):
        return datetime.min
    try:
        # 尝试解析格式如 9-Feb-26
        return datetime.strptime(date_str.strip(), '%d-%b-%y')
    except:
        return datetime.min

def analyze():
    # 桶的最后状态追踪
    # key: 桶号, value: 最后一条记录的信息
    bin_status = {}
    # 所有桶的集合（用于库存）
    all_bins = {} # key: 桶号, value: 尺寸

    if not os.path.exists(input_file):
        print(f"错误: 找不到文件 {input_file}")
        return

    with open(input_file, mode='r', encoding='utf-8') as f:
        # 跳过第一行的超长空格，找到真正的表头（第二行）
        # 注意：您的CSV前两行比较特殊
        lines = f.readlines()
        
    # 找到表头行
    header = None
    data_start_idx = 0
    for i, line in enumerate(lines):
        if '单号' in line and 'Address' in line:
            header = line.strip().split(',')
            data_start_idx = i + 1
            break
    
    if not header:
        print("错误: 无法解析CSV表头")
        return

    # 索引映射
    idx = {
        'date': header.index('日期'),
        'order_no': header.index('单号'),
        'bin_no': header.index('桶号（送）'),
        'type': header.index('送 / 收'),
        'address': header.index('Address'),
        'size': header.index('BIN SIZE '),
        'done': header.index('完成') if '完成' in header else -1
    }

    reader = csv.reader(lines[data_start_idx:])
    
    for row in reader:
        if len(row) <= max(idx.values()):
            continue
            
        date_str = row[idx['date']]
        date_obj = parse_date(date_str)
        order_no = row[idx['order_no']].strip()
        bin_no = row[idx['bin_no']].strip()
        action = row[idx['type']].strip()
        address = row[idx['address']].strip()
        size = row[idx['size']].strip()
        
        if not bin_no or bin_no == '0':
            continue

        # 更新库存信息
        if bin_no not in all_bins:
            all_bins[bin_no] = size

        # 追踪最后状态
        # 我们需要比较日期，确保记录是最新的
        if bin_no not in bin_status or date_obj >= bin_status[bin_no]['date']:
            bin_status[bin_no] = {
                'date': date_obj,
                'date_str': date_str,
                'order_no': order_no,
                'action': action,
                'address': address,
                'size': size
            }

    # 找出所有“在外”的桶（最后一次动作是“送”）
    out_bins = []
    for b_no, status in bin_status.items():
        if status['action'] == '送':
            out_bins.append({
                'bin_no': b_no,
                'size': status['size'],
                'address': status['address'],
                'order_no': status['order_no'],
                'last_date': status['date_str']
            })

    # 写入结果：在外桶报告
    with open(out_bins_file, 'w', encoding='utf-8-sig', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=['bin_no', 'size', 'address', 'order_no', 'last_date'])
        writer.writeheader()
        writer.writerows(out_bins)

    # 写入结果：库存报告
    with open(inventory_file, 'w', encoding='utf-8-sig', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(['bin_no', 'size'])
        for b_no, b_size in sorted(all_bins.items()):
            writer.writerow([b_no, b_size])

    print(f"分析完成！")
    print(f"1. 在外的桶清单已生成: {out_bins_file} (共 {len(out_bins)} 个)")
    print(f"2. 完整库存清单已生成: {inventory_file} (共 {len(all_bins)} 个)")

if __name__ == "__main__":
    analyze()
