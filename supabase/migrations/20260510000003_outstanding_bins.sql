-- ============================================================
-- 在外未收桶记录 (outstanding_bins)
-- 数据源: bin_number.csv (共 134 单)
-- 生成时间: 2026-05-10 18:59:49
-- 
-- 用途: 存档目前还没回收的桶，按地址/桶号/送出日期查看
-- 可以在 Supabase SQL Editor 整段粘贴运行
-- ============================================================

-- 1. 建表
CREATE TABLE IF NOT EXISTS public.outstanding_bins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number TEXT NOT NULL,
  bin_number TEXT NOT NULL,
  service_date DATE,
  month_label TEXT,
  address TEXT,
  bin_type_raw TEXT,
  driver TEXT,
  notes TEXT,
  is_returned BOOLEAN DEFAULT FALSE,
  returned_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(order_number, bin_number)
);

-- 2. 索引
CREATE INDEX IF NOT EXISTS idx_outstanding_bins_order_number ON public.outstanding_bins(order_number);
CREATE INDEX IF NOT EXISTS idx_outstanding_bins_bin_number ON public.outstanding_bins(bin_number);
CREATE INDEX IF NOT EXISTS idx_outstanding_bins_service_date ON public.outstanding_bins(service_date);
CREATE INDEX IF NOT EXISTS idx_outstanding_bins_driver ON public.outstanding_bins(driver);
CREATE INDEX IF NOT EXISTS idx_outstanding_bins_is_returned ON public.outstanding_bins(is_returned);

-- 3. RLS (跟项目其他表一致先全开, 上线前再收紧)
ALTER TABLE public.outstanding_bins ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS open_all ON public.outstanding_bins;
CREATE POLICY open_all ON public.outstanding_bins FOR ALL USING (true) WITH CHECK (true);

-- 4. 更新时间戳触发器
CREATE OR REPLACE FUNCTION public.set_outstanding_bins_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_outstanding_bins_updated_at ON public.outstanding_bins;
CREATE TRIGGER trg_outstanding_bins_updated_at
BEFORE UPDATE ON public.outstanding_bins
FOR EACH ROW EXECUTE FUNCTION public.set_outstanding_bins_updated_at();

-- 5. 导入数据 (UPSERT, 可重复运行)
INSERT INTO public.outstanding_bins (order_number, bin_number, service_date, month_label, address, bin_type_raw, driver) VALUES
  ('SOT12718', '14-18', DATE '2026-05-01', '5 月', '3025 Kennedy Rd, Scarborough, ON M1V 1S3', '換14YD磚埇', '成'),
  ('SOT12761', '14-84', DATE '2026-05-01', '5 月', '76 Woodward Ave, Thornhill, ON L3T 1E7', '換14YD垃圾桶', '坤'),
  ('SOT12719', '20-05', DATE '2026-05-01', '5 月', '26 Orlon Crescent, Richmond Hill, ON L4C 6S5', '換20YD垃圾桶', '坤'),
  ('SOT12733', 'L20-20', DATE '2026-05-01', '5 月', '17 Leno Mills Ave, Richmond Hill, ON L4S 1J3', '20YD 垃圾桶', '坤'),
  ('SOT12706', '14-41', DATE '2026-05-01', '5 月', '70 Copperwood Square, Scarborough, ON M1V 2C1', '14YD垃圾桶', '坤'),
  ('SOT12735', '40-15', DATE '2026-05-01', '5 月', '67 Jacob Keffer Pkwy, Vaughan, ON L4K 5N8', '換40YD 垃圾桶', 'Jason'),
  ('SOT12717', '20-41', DATE '2026-05-01', '5 月', '371 Woodsworth Rd, North York, ON M2L 2T8', '換20YD垃圾桶', 'Jason'),
  ('SOT12712', '40-24', DATE '2026-05-01', '5 月', '55 Milne Ave, Toronto, ON M1L 1K1', '換40YD 垃圾桶', 'Jason'),
  ('SOT12364', '20-24', DATE '2026-04-10', '4 月', '111 Manitoba St, Whitchurch-Stouffville, ON L4A 4Y2', '換20YD垃圾桶', '成'),
  ('SOT12352', 'L20-04', DATE '2026-04-10', '4 月', '87 Steelcase Rd W, Markham, ON L3R 2S5', '換20YD垃圾桶', '坤'),
  ('S0T10343', '20-52', DATE '2026-01-10', '1 月', '1423 Rougemount Dr, Pickering, ON L1V 1N2', '拉40YD, 送20YD垃圾桶', '坤'),
  ('D09680', '14-24', DATE '2026-05-10', '5 月', '102 Fenelon Dr, North York, ON M3A 3K6', 'EXCHANGE 14YD SOIL BIN', 'Mike'),
  ('SOT12992', '14-35', DATE '2026-05-10', '5 月', '10050 Warden Ave., Markham, ON L6C 1Y8', '14YD 垃圾桶', 'Mike'),
  ('S0T10668', '14-25', DATE '2026-02-11', '2 月', '11 Shadbolt Ct, Unionville, ON L3R 1W3', '14YD 垃圾桶', '坤'),
  ('S0T10287', '20-22', DATE '2026-01-12', '1 月', '58 Scarboro Ave, Scarborough, ON M1C 1M3', '20YD垃圾桶  (換)', '坤'),
  ('D09619', '14-55', DATE '2026-04-13', '4 月', 'Unit 4, 560 Denison St, Markham, ON L3R 1B8', '14YD 磚埇', '刀'),
  ('D09621', '14-20', DATE '2026-04-14', '4 月', 'Unit 2, 560 Denison St, Markham, ON L3R 2M8', '换14YD磚桶', 'Jason'),
  ('SOT12405', '40-05', DATE '2026-04-14', '4 月', '1 Ahorn Grove, Markham, ON L6C 1C8', '換40YD垃圾桶', '成'),
  ('SOT10246', 'L20-17', DATE '2026-01-14', '1 月', '9 Boynton Cir, Markham, ON L6C 1A8', '20YD 垃圾桶', '成'),
  ('D09626', '14-03', DATE '2026-04-15', '4 月', 'Unit 26, 80 Bass Pro Mills Dr, Concord, ON L4K 5W9', '換14YD磚桶', 'Nick'),
  ('SOT12453', '20-50', DATE '2026-04-16', '4 月', '20 Mcindoos Cemetery Rd, Woodville, ON K0M 2T0', '換20YD垃圾桶', 'Mike'),
  ('SOT12450', '20-02', DATE '2026-04-16', '4 月', '21 Clarkhill St, North York, ON M2R 2G6', '20YD 垃圾桶', 'Jason'),
  ('SOT12469', '14-65', DATE '2026-04-17', '4 月', '34 Priory Dr, Whitby, ON L1P 2A9', '換14YD垃圾桶', '坤'),
  ('SOT12003', '30-01', DATE '2026-03-18', '3 月', 'Unit 11, 45A West Wilmot St, Richmond Hill, ON L4B 2P3', '30YD垃圾桶  (換)', '成'),
  ('SOT12082', '14-63', DATE '2026-03-19', '3 月', '120 Van Kirk Drive Brampton', '14YD 磚桶', '成'),
  ('SOT12083', '14-63', DATE '2026-03-19', '3 月', '120 Van Kirk Drive Brampton', '14YD 磚桶', '成'),
  ('SOT12084', '14-63', DATE '2026-03-19', '3 月', '120 Van Kirk Drive Brampton', '14YD 磚桶', '成'),
  ('SOT12774', '40-10', DATE '2026-05-02', '5 月', '67 Jacob Keffer Pkwy, Vaughan, ON L4K 5N8', '換40YD垃圾桶', '刀'),
  ('SOT12760', '20-06', DATE '2026-05-02', '5 月', '23 Boynton Cir, Markham, ON L6C 1A8', '換20YD垃圾桶', '刀'),
  ('SOT12740', '20-32', DATE '2026-05-02', '5 月', '48 Homestead Rd, Scarborough, ON M1E 3R9', '20YD垃圾桶', 'Jason'),
  ('SOT12755', '40-12', DATE '2026-05-02', '5 月', '2967 Kennedy Rd, Toronto, ON M1V 1S9', '換40YD垃圾桶', '成'),
  ('SOT12511', '20-30', DATE '2026-04-20', '4 月', '1123 Leslie St, North York, ON M3C 2K5', '換20YD垃圾桶', '坤'),
  ('SOT12510', '14-59', DATE '2026-04-20', '4 月', '92 Arran Crescent, Woodbridge, ON L4L 1G6', '14YD垃圾桶', 'Nick'),
  ('SOT12500', '40-07', DATE '2026-04-20', '4 月', '29 Donna Ct, North York, ON M2M 2C9', '40YD 垃圾桶', 'Nick'),
  ('SOT12055', '20-26', DATE '2026-03-20', '3 月', '189 Milner Ave, Toronto, ON M1S 4N4', '20YD垃圾桶  (換)', '坤'),
  ('D09635', '14-85', DATE '2026-04-21', '4 月', '59 Granger Ave, Scarborough, ON M1K 3K9', '換14YD 磚桶', 'Nick'),
  ('SOT12498', '14-68', DATE '2026-04-21', '4 月', '30 Alanadale Ave, Markham, ON L3P 1S3', '14YD 垃圾桶', 'Jason'),
  ('SOT12053', '40-16', DATE '2026-03-21', '3 月', '73 Marsh St, Ridgetown, ON N0P 2C0', '换40YD垃圾桶', '成'),
  ('SOT12543', '20-19', DATE '2026-04-22', '4 月', '66 Rancliffe Rd, Oakville, ON L6H 1B2', '換20YD垃圾桶', '坤'),
  ('SOT12537', '20-12', DATE '2026-04-23', '4 月', '61 Willett Crescent, Richmond Hill, ON L4C 7W2', '20YD GARBAGE BIN', 'Jason'),
  ('SOT12559', '14-08', DATE '2026-04-23', '4 月', '27 Hartwell Pl, Markham, ON L6C 2K3', '14YD GARBAGE BIN', '坤'),
  ('SOT12571', '40-19', DATE '2026-04-23', '4 月', '74 Miles St, Milton, ON L9T 1E6', '40YD垃圾桶', 'Nick'),
  ('SOT12566', '20-47', DATE '2026-04-23', '4 月', '17 Silk Ct, Richmond Hill, ON L4B 4A4', '換20YD垃圾桶', 'Jason'),
  ('SOT12595', '20-09', DATE '2026-04-24', '4 月', '229 Mavrinac Blvd, Aurora, ON L4G 7T6', '換20YD垃圾桶', 'Jason'),
  ('SOT12580', '20-28', DATE '2026-04-24', '4 月', '6 Montesano Crescent, Richmond Hill, ON L4B 4M9', '20YD 垃圾桶', '成'),
  ('SOT12616', '40-01', DATE '2026-04-25', '4 月', '465 Milner Ave #5 Scarborough, ON M1B 2K4', '40YD垃圾桶', 'Jason'),
  ('SOT12623', '14-07', DATE '2026-04-25', '4 月', '51 Milky Way Dr, Richmond Hill, ON L4C 4M9', '14YD垃圾桶', 'Jason'),
  ('SOT12620', '20-29', DATE '2026-04-25', '4 月', '32 Donna Ct, North York, ON M2M 2C8', '20YD垃圾桶', '坤'),
  ('SOT12649', 'L20-02', DATE '2026-04-27', '4 月', '1123 Leslie St, North York, ON M3C 2K5', '換20YD垃圾桶(鐵)', 'Jason'),
  ('SOT12628', '20-20', DATE '2026-04-27', '4 月', '851 Woodland Acres Crescent, Maple, ON L6A 1G2', '換20YD垃圾桶', '坤'),
  ('SOT12627', '20-27', DATE '2026-04-27', '4 月', '21 Wozniak Cres, Markham, ON L6E 0L4', '20YD垃圾桶', '坤'),
  ('SOT12662', '14-82', DATE '2026-04-27', '4 月', 'Unit 21, 1655 Sismet Rd, Mississauga, ON L4W 1Z4', '換14YD垃圾桶', '坤'),
  ('SOT12655', '14-45', DATE '2026-04-27', '4 月', '3477 Kennedy Rd, Scarborough, ON M1V 4Y3', '14YD 垃圾桶', '成'),
  ('SOT12629', '14-26', DATE '2026-04-27', '4 月', '50 Tiffield Rd, Toronto, ON M1V 5B7', '換14YD垃圾桶', '清'),
  ('SOT12146', 'L20-16', DATE '2026-03-27', '3 月', '2559 Islington Ave, Etobicoke, ON M9V 2X2', '20YD垃圾桶  (換)', '坤'),
  ('SOT12667', '20-48', DATE '2026-04-28', '4 月', '5467 19th Ave, Markham, ON L3P 3J3', 'EXCHANGE 20YD GARBAGE BIN', '成'),
  ('SOT12689', '20-38', DATE '2026-04-28', '4 月', '32 Ashwarren Rd, North York, ON M3J 1Z7', '换20YD垃圾桶', '坤'),
  ('SOT12663', 'L20-19', DATE '2026-04-28', '4 月', '199 Ridgewood Rd, Scarborough, ON M1C 2X3', '20YD 垃圾桶', 'Mike'),
  ('SOT12668', '40-20', DATE '2026-04-28', '4 月', '336 8TH LINE Rd S DUMMER, Douro-Dummer, ON K0L 2V0', '換40YD垃圾桶', 'Jason'),
  ('SOT12664', '40-13', DATE '2026-04-28', '4 月', '3880 Edgerton Rd, Blackstock, ON L0B 1B0', '換40YD垃圾桶', 'Jason'),
  ('SOT12665', '20-43', DATE '2026-04-28', '4 月', '16 Wimpole Dr, North York, ON M2L 2K9', '20YD垃圾桶', '成'),
  ('SOT12673', '14-58', DATE '2026-04-28', '4 月', '195 Milner Ave., Scarborough, ON M1S 3R1', '換14YD垃圾桶', '坤'),
  ('SOT12625', '40-08', DATE '2026-04-28', '4 月', '578 Woodland Acres Crescent, Vaughan, ON L6A 1G2', '換40YD垃圾桶', '刀'),
  ('SOT12175', '20-18', DATE '2026-03-28', '3 月', '59 Granger Ave, Scarborough, ON M1K 3K9', '換20YD垃圾桶', '坤'),
  ('SOT12692', '20-44', DATE '2026-04-29', '4 月', '32 Sisina Ave, Markham, ON L6C 0H6', '換20YD垃圾桶', '坤'),
  ('SOT12694', 'L20-07', DATE '2026-04-29', '4 月', '2 Forson Ct, Markham, ON L6C 1A9', '換20YD垃圾桶', '刀'),
  ('SOT12672', '14-69', DATE '2026-04-29', '4 月', '58 Scarboro Ave, Scarborough, ON M1C 1M3', '14YD垃圾桶', '成'),
  ('SOT12780', '14-29', DATE '2026-05-03', '5 月', '67 Jacob Keffer Pkwy, Vaughan, ON L4K 5N8', '換14YD 磚桶', 'Jason'),
  ('SOT12770', '20-15', DATE '2026-05-03', '5 月', '242 Lawrence Ave, Richmond Hill, ON L4C 1Z6', '換20YD垃圾桶', 'Jason'),
  ('SOT12708', '20-08', DATE '2026-04-30', '4 月', 'UNIT2, 3 Keensford Ct, Ajax, ON L1Z 0K4', '換20YD垃圾桶', '坤'),
  ('SOT12707', '20-39', DATE '2026-04-30', '4 月', '3905 Keele St, North York, ON M3J 1N6', '換20YD垃圾桶', '坤'),
  ('SOT12702', '14-25', DATE '2026-04-30', '4 月', '191 Finch Ave E, North York, ON M2N 4S1', '14YD GARBAGE BIN', '坤'),
  ('D09651', '14-04', DATE '2026-04-30', '4 月', '74 Montrave Ave, Oshawa, ON L1J 4R7', '14YD SOIL BIN', 'Jason'),
  ('SOT12711', '20-01', DATE '2026-04-30', '4 月', '2 Doulton Ct, Markham, ON L3R 8N8', '換20YD垃圾桶', '坤'),
  ('SOT12199', '20-16', DATE '2026-03-30', '3 月', '567 Davis Dr, Newmarket, ON L3Y 2P5', '換20YD垃圾桶', '坤'),
  ('D09607', '14-54', DATE '2026-03-31', '3 月', '77 Nash Dr, North York, ON M3M 2L6', '拉14YD水泥桶，送14YD土桶+2YD GRAVEL', '成'),
  ('SOT12219', 'L20-14', DATE '2026-03-31', '3 月', '1 Heritage Woods Manor, Markham, ON L6C 3H1', '換20YD垃圾桶', '坤'),
  ('SOT12802', '14-17', DATE '2026-05-04', '5 月', '1795 Reach St, Port Perry, ON L9L 1P2', '14YD SOIL BIN', 'Jason'),
  ('SOT12779', '30-10（旧）', DATE '2026-05-04', '5 月', 'Unit 3, 560 Denison St, Markham, ON L3R 2M8', '换30YD垃圾桶', 'Jason'),
  ('SOT12782', '40-21', DATE '2026-05-04', '5 月', '3550 Sideline 24, Pickering, ON L0H 1J0', '換40YD垃圾桶', 'Mike'),
  ('SOT12804', '20-25', DATE '2026-05-04', '5 月', '85 Citizen Ct, Markham, ON L6G 1A8', '換20YD垃圾桶', '坤'),
  ('SOT12803', '20-23', DATE '2026-05-04', '5 月', '3 Towne Ct, Unionville, ON L3R 1X4', '換20YD垃圾桶', '坤'),
  ('SOT12812', '20-37', DATE '2026-05-04', '5 月', '263 Glebemount Ave, East York, ON M4C 3T7', '20YD垃圾桶', '坤'),
  ('SOT12754', '14-81', DATE '2026-05-04', '5 月', '26 Crimson Millway, North York, ON M2L 1T6', '換14YD垃圾桶', '成'),
  ('SOT12763', '14-76', DATE '2026-05-04', '5 月', '46 Apollo Dr, North York, ON M3B 1T9', '換14YD垃圾桶', '成'),
  ('SOT10916', '40-11', DATE '2026-03-05', '3 月', '33 Jeremy Dr, Unionville, ON L3R 2K7', '40YD垃圾桶  (換)', '成'),
  ('SOT12824', '14-30', DATE '2026-05-05', '5 月', '2119 Pineview Dr, Oakville, ON L6H 5M5', '14YD垃圾桶', '成'),
  ('SOT12776', '20-06', DATE '2026-05-05', '5 月', '262 Orr Dr, Bradford, ON L3Z 0B9', '20YD垃圾桶', '成'),
  ('SOT12854', '20-45', DATE '2026-05-05', '5 月', '128 Millcliff Cir, Aurora, ON L4G 7N8', '換20YD垃圾桶', 'Mike'),
  ('SOT12814', '14-63', DATE '2026-05-05', '5 月', '277 Fifth Ave, Woodbridge, ON L4L 7A7', '14YD垃圾桶', 'Jason'),
  ('SOT12809', '40-14', DATE '2026-05-05', '5 月', '60 Emblem Ct, Scarborough, ON M1S 1B1', '換40YD垃圾桶', 'Mike'),
  ('SOT12846', '30-02', DATE '2026-05-05', '5 月', '226 Steelcase Rd W, Markham, ON L3R 1B3', '换30YD垃圾桶', 'Jason'),
  ('SOT12823', '14-43', DATE '2026-05-05', '5 月', '62 Buckhorn Ave, Richmond Hill, ON L4C 0G4', '14YD垃圾桶', 'Jason'),
  ('SOT12807', '20-42', DATE '2026-05-05', '5 月', '49 Eastwood Crescent, Markham, ON L3P 6A1', '20YD垃圾桶', 'Jason'),
  ('SOT12722', '14-54', DATE '2026-05-05', '5 月', '38 Beacham Crescent, Scarborough, ON M1T 1N1', '14YD垃圾桶', 'Mike'),
  ('SOT12200', '14-64', DATE '2026-04-06', '4 月', '192 Glendora Ave, North York, ON M2N 2W5', '14YD垃圾桶', '坤'),
  ('SOT10215', '20-17', DATE '2026-01-06', '1 月', 'Unit 2, 560 Denison St, Markham, ON L3R 2M8', '20YD 垃圾桶(换）', '坤'),
  ('SOT12884', '14-92', DATE '2026-05-06', '5 月', '241 East St, Holland Landing, ON L9N 1K8', '14YD GARBAGE BIN', '成'),
  ('SOT12815', '20-07', DATE '2026-05-06', '5 月', '52 Shady Hollow Dr, Scarborough, ON M1V 2X4', '20YD 垃圾桶', '坤'),
  ('SOT12860', 'L20-21', DATE '2026-05-06', '5 月', '1386 Tottenham Rd, Tottenham, ON L0G 1W0', '換20YD垃圾桶', '坤'),
  ('SOT12756', 'L20-06', DATE '2026-05-06', '5 月', '37 Meadow Ridge Ct, Maple, ON L6A 0C3', '20YD垃圾桶', 'Jason'),
  ('SOT12885', '14-62', DATE '2026-05-06', '5 月', '16 Wheaton Grove, Scarborough, ON M1J 3L5', '14YD GARBAGE BIN', '成'),
  ('D09664', '14-72', DATE '2026-05-06', '5 月', '1221 Grandview St N, Oshawa, ON L1K 2S9', '14YD土桶', '成'),
  ('SOT10627', '14-83', DATE '2026-02-07', '2 月', '12441 Woodbine Ave Stouffville ON L4A 2K5', '拉20YD垃圾桶，送14YD垃圾桶', '成'),
  ('SOT12893', '40-25', DATE '2026-05-07', '5 月', '574 Green Ln E, East Gwillimbury, ON L9N 0E1', '換40YD垃圾桶', '成'),
  ('SOT12890', '40-26', DATE '2026-05-07', '5 月', '200 Romina Dr., Concord, ON L4K 4Z7', '換40YD垃圾桶', '成'),
  ('SOT12887', '14-66', DATE '2026-05-07', '5 月', '1280 Klondike Dr, Oshawa, ON L1L 0T2', '14YD垃圾桶', '成'),
  ('SOT12859', '20-11', DATE '2026-05-07', '5 月', '337 Greenfield Ave, North York, ON M2N 3E7', '20YD垃圾桶', '坤'),
  ('SOT12892', '20-53', DATE '2026-05-07', '5 月', 'Unit 369,200 Silver Star Blvd, Scarborough, ON M1V 5H4', '換20YD垃圾桶', '坤'),
  ('SOT12899', '20-49', DATE '2026-05-07', '5 月', '1443 Denison St, Markham, ON L3R 5V2', '換20YD垃圾桶', '坤'),
  ('SOT12888', '20-04', DATE '2026-05-07', '5 月', 'Unit 6, 560 Denison St, Markham, ON L3R 1B8', '換20YD垃圾桶', '坤'),
  ('SOT12895', '20-03', DATE '2026-05-07', '5 月', '138 Olive Ave, North York, ON M2N 4P1', '換20YD垃圾桶', '坤'),
  ('SOT12891', '40-02', DATE '2026-05-07', '5 月', '250 Don Hillock Dr, Aurora, ON L4G 0G9', '40YD 垃圾桶', '成'),
  ('SOT12330', 'L20-05', DATE '2026-04-08', '4 月', '26 Irving Dr, Pefferlaw, ON L0E 1N0', 'EXCHANGE 20YD GARBAGE BIN', '坤'),
  ('SOT12896', '20-14', DATE '2026-05-08', '5 月', '49 Seiffer Crescent, Richmond Hill, ON L4E 0J1', '20YD垃圾桶', '刀'),
  ('SOT12968', '14-78', DATE '2026-05-08', '5 月', '2639 Eaglesham Path, Oshawa, ON L1L 0M7', '換14YD垃圾桶', '坤'),
  ('SOT12901', '20-22', DATE '2026-05-08', '5 月', '40 Forest Grove Dr, North York, ON M2K 1Z3', 'EXCHANGE 20YD GARBAGE BIN', '坤'),
  ('SOT12906', '20-34', DATE '2026-05-08', '5 月', '9 Mosedale Crescent, North York, ON M2J 3A3', '20YD垃圾桶', '坤'),
  ('SOT12903', '14-52', DATE '2026-05-08', '5 月', '740 York Mills Rd, North York, ON M3B 1W8', 'EXCHANGE 14YD ASPHALT BIN', '刀'),
  ('SOT12897', '20-10', DATE '2026-05-08', '5 月', '1532 Glenhill Crescent, Mississauga, ON L5H 3C5', '20YD垃圾桶', 'Jason'),
  ('SOT12905', '14-37', DATE '2026-05-08', '5 月', '607 Mississauga Crescent, Mississauga, ON L5H 1Z9', '送14YD垃圾桶, 拉14YD磚桶', 'Gurdeep'),
  ('SOT12898', '40-22', DATE '2026-05-08', '5 月', '860 Denison St Unit 3, Markham, ON L3R 4H1', '換40YD垃圾桶', 'Gurdeep'),
  ('SOT12551', '14-15', DATE '2026-02-09', '2 月', '92 Granada Crescent, Scarborough, ON M1B 2H5', '14YD垃圾桶', '坤'),
  ('SOT12988', '14-75', DATE '2026-05-09', '5 月', 'Unit 17, 270 West Beaver Creek Rd, Richmond Hill, ON L4B 3Z1', '換14YD垃圾桶', '坤'),
  ('SOT12966', '14-70', DATE '2026-05-09', '5 月', '205 Cranbrooke Ave, Toronto, ON M5M 1M8', '換14YD垃圾桶', '坤'),
  ('SOT12969', '20-36', DATE '2026-05-09', '5 月', '34 Odessa Crescent, Markham, ON L6C 2T3', '拉14YD垃圾桶，送20YD垃圾桶', '坤'),
  ('D09678', '14-93', DATE '2026-05-09', '5 月', '64 Melford Dr, Scarborough, ON M1B 2G1', '換14YD磚埇', 'Nick'),
  ('SOT12982', '14-14', DATE '2026-05-09', '5 月', '24 Bunty Ln, North York, ON M2K 1W6', '14YD垃圾桶', 'Nick'),
  ('SOT12981', '40-03', DATE '2026-05-09', '5 月', '2065 Midland Ave, Scarborough, ON M1P 4P8', '換40YD垃圾桶', 'Nick'),
  ('SOT12986', '20-35', DATE '2026-05-09', '5 月', '38 Pebblehill Square, Scarborough, ON M1S 2P7', '20YD垃圾桶', 'Mike'),
  ('SOT12983', '30-02（旧）', DATE '2026-05-09', '5 月', '150 Clark Blvd, Brampton, ON L6T 4Y8', '換20YD垃圾桶', 'Jason'),
  ('D09681', '14-06', DATE '2026-05-09', '5 月', '41 Parkhill Dr, Gormley, ON L4A 2G1', '4YD GRAVEL + 14YD 土桶', '成'),
  ('SOT12979', '40-23', DATE '2026-05-09', '5 月', '2065 Midland Ave, Scarborough, ON M1P 4P8', '換40YD垃圾桶', 'Nick')
ON CONFLICT (order_number, bin_number) DO UPDATE SET
  service_date = EXCLUDED.service_date,
  month_label  = EXCLUDED.month_label,
  address      = EXCLUDED.address,
  bin_type_raw = EXCLUDED.bin_type_raw,
  driver       = EXCLUDED.driver,
  updated_at   = now();

-- 共导入 133 条记录