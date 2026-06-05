-- Import outstanding on-site bins from order.csv
-- Rule: for each bin number, only the latest CSV action is considered.
-- Latest action = send/swap => delivery order is done and bin is on_site.
-- Latest action = pickup => skipped because the bin has been returned.
-- Generated rows: 40

WITH import_rows(order_number, bin_number, bin_size, service_date, time_window, time_window_custom, address, customer_phone, customer_notes, bin_type) AS (
  VALUES
    ('SOT12802', '14-17', '14', '2026-05-03', 'AM', '5/4/2026 9-11AM', '1795 Reach St, Port Perry, ON L9L 1P2', '416-587-9396', 'DRIVEWAY | CSV time: 5/4/2026 9-11AM | Imported from order.csv as delivered/on-site outstanding bin', 'soil'),
    ('SOT12754', '14-81', '14', '2026-05-03', '7-9', '5/4/2026 7-9AM', '26 Crimson Millway, North York, ON M2L 1T6', '647-338-6589', 'SAME HINO | CSV time: 5/4/2026 7-9AM | Imported from order.csv as delivered/on-site outstanding bin', 'garbage'),
    ('SOT12809', '40-14', '40', '2026-05-03', 'AM', '5/5/2026 AM', '60 Emblem Ct, Scarborough, ON M1S 1B1', '416-456-4503 / 416-291-4477', 'SAME | CSV time: 5/5/2026 AM | Imported from order.csv as delivered/on-site outstanding bin', 'garbage'),
    ('SOT12854', '20-45', '20', '2026-05-03', 'PM', '5/5/2026 PM', '128 Millcliff Cir, Aurora, ON L4G 7N8', '647-404-8688', 'SAME | CSV time: 5/5/2026 PM | Imported from order.csv as delivered/on-site outstanding bin', 'garbage'),
    ('SOT12815', '20-07', '20', '2026-05-03', 'AM', '5/6/2026 AM', '52 Shady Hollow Dr, Scarborough, ON M1V 2X4', '647-878-8901', 'DRIVEWAY | CSV time: 5/6/2026 AM | Imported from order.csv as delivered/on-site outstanding bin', 'garbage'),
    ('SOT12887', '14-66', '14', '2026-05-03', 'AM', '5/7/2026 AM', '1280 Klondike Dr, Oshawa, ON L1L 0T2', '416-890-8667', 'DRIVEWAY | CSV time: 5/7/2026 AM | Imported from order.csv as delivered/on-site outstanding bin', 'garbage'),
    ('SOT12896', '20-14', '20', '2026-05-03', 'AM', '5/8/2026 9-11AM', '49 Seiffer Crescent, Richmond Hill, ON L4E 0J1', '647-963-6870', 'DRIVEWAY (front door side) | CSV time: 5/8/2026 9-11AM | Imported from order.csv as delivered/on-site outstanding bin', 'garbage'),
    ('SOT12968', '14-78', '14', '2026-05-03', 'PM', '5/8/2025,PM', '2639 Eaglesham Path, Oshawa, ON L1L 0M7', '416-890-8667', 'SAME | CSV time: 5/8/2025,PM | Imported from order.csv as delivered/on-site outstanding bin', 'garbage'),
    ('SOT12984', '20-33', '20', '2026-05-05', 'AM', '5/11/2026 AM', '48 Tufo Ave, Markham, ON L6C 0H8', '647-973-6375', 'DRIVEWAY HINO | CSV time: 5/11/2026 AM | Imported from order.csv as delivered/on-site outstanding bin', 'garbage'),
    ('SOT13023', '20-51', '20', '2026-05-05', 'AM', '5/11/2026 AM', '5 Bradgate Rd, North York, ON M3B 1J6', '647-404-8688', 'DRIVEWAY | CSV time: 5/11/2026 AM | Imported from order.csv as delivered/on-site outstanding bin', 'garbage'),
    ('SOT13028', 'L20-03', '20', '2026-05-05', '7-9', '5/12/2026 7-9AM', '17 Savoy Crescent, Thornhill, ON L4J 7W3', '416-894-1518', 'DRIVEWAY, 358来收 | CSV time: 5/12/2026 7-9AM | Imported from order.csv as delivered/on-site outstanding bin', 'garbage'),
    ('SOT13090', 'L20-01', '20', '2026-05-05', 'PM', '5/13/2026 5-6PM', '91 Hazelnut Crescent, North York, ON M2J 4W4', '416-616-7954', 'DRIVEWAY | CSV time: 5/13/2026 5-6PM | Imported from order.csv as delivered/on-site outstanding bin', 'garbage'),
    ('SOT13043', '40-13', '40', '2026-05-05', 'custom', '5/14/2026', '73 Marsh St, Ridgetown, ON N0P 2C0', '365-338-8686', 'CONSITE ON SITE | CSV time: 5/14/2026 | Imported from order.csv as delivered/on-site outstanding bin', 'garbage'),
    ('SOT13182', '14-49', '14', '2026-05-05', 'PM', '5/15/2026 PM', '12441 Woodbine Ave Stouffville ON L4A 2K5', '416-890-0683', 'SAME | CSV time: 5/15/2026 PM | Imported from order.csv as delivered/on-site outstanding bin', 'garbage'),
    ('SOT13149', 'L20-13', '20', '2026-05-05', 'PM', '5/19/2026 10-12PM', '237 Forest Ridge Rd, Richmond Hill, ON L4E 3L8', '437-288-8886', 'CONFIRM ON SITE, 最早8:50AM | CSV time: 5/19/2026 10-12PM | Imported from order.csv as delivered/on-site outstanding bin', 'garbage'),
    ('SOT13266', '20-01', '20', '2026-05-05', 'custom', '5/20/2026 ASAP', '27 Jinnah Ave, Markham, ON L3S 0G2', '416-890-8667', 'DRIVEWAY | CSV time: 5/20/2026 ASAP | Imported from order.csv as delivered/on-site outstanding bin', 'garbage'),
    ('SOT13272', '20-39', '20', '2026-05-05', 'PM', '5/20/2026 PM', '168 Risebrough Circuit, Markham, ON L3R 3E3', '416-830-0506', 'CONFIRM ON SITE | CSV time: 5/20/2026 PM | Imported from order.csv as delivered/on-site outstanding bin', 'garbage'),
    ('SOT13267', '14-83', '14', '2026-05-05', '7-9', '5/21/2026 7-9AM', '40 Vogell Rd #57, Richmond Hill, ON L4B 3N6', '647-939-7057 / 289-380-7777', 'DRIVEWAY | CSV time: 5/21/2026 7-9AM | Imported from order.csv as delivered/on-site outstanding bin', 'garbage'),
    ('SOT13277', '14-76', '14', '2026-05-05', 'AM', '5/22/2026 AM', '66 Hollylane Dr, Markham, ON L6C 2J9', '647-838-5753', 'DRIVEWAY | CSV time: 5/22/2026 AM | Imported from order.csv as delivered/on-site outstanding bin', 'garbage'),
    ('SOT13360', '40-06', '40', '2026-05-05', 'PM', '5/23/2026 PM', '3880 Edgerton Rd, Blackstock, ON L0B 1B0', '416-859-3328 Alex / 647-502-1107', 'SAME | CSV time: 5/23/2026 PM | Imported from order.csv as delivered/on-site outstanding bin', 'garbage'),
    ('SOT13431', '40-03', '40', '2026-05-05', 'PM', '5/26/2026 PM', '250 Don Hillock Dr, Aurora, ON L4G 0G9', '647-986-1221', 'Unit.3 loading dock | CSV time: 5/26/2026 PM | Imported from order.csv as delivered/on-site outstanding bin', 'garbage'),
    ('SOT13435', 'L20-19', '20', '2026-05-05', 'AM', '5/26/2026 AM', '7 Turnberry Crescent, Unionville, ON L3R 0R7', '647-404-8688', 'DRIVEWAY | CSV time: 5/26/2026 AM | Imported from order.csv as delivered/on-site outstanding bin', 'garbage'),
    ('D09729', '14-82', '14', '2026-05-05', '7-9', '5/27/2026 7-9AM', '42 Madison Heights Blvd, Markham, ON L6C 2E2', '647-868-5615', 'SAME, 收$550 | CSV time: 5/27/2026 7-9AM | Imported from order.csv as delivered/on-site outstanding bin', 'garbage'),
    ('SOT13466', '20-36', '20', '2026-05-05', 'PM', '5/27/2026 PM', '37 Robert Grundy Rd, Markham, ON L6C 3A3', '647-400-6100', 'SAME | CSV time: 5/27/2026 PM | Imported from order.csv as delivered/on-site outstanding bin', 'garbage'),
    ('SOT13473', '14-21', '14', '2026-05-05', 'AM', '5/28/2026 AM ASAP', '52 Harpreet Cir, Etobicoke, ON M9W 0E2', '437-235-7326', 'CONFIRM ON SITE | CSV time: 5/28/2026 AM ASAP | Imported from order.csv as delivered/on-site outstanding bin', 'garbage'),
    ('SOB109825', '14-25', '14', '2026-05-05', 'AM', 'May 28, 2026 7:00 AM', '3500 Steeles Ave E, Markham, ON L3R 1E7', '437-299-3153', 'customer will be there | CSV time: May 28, 2026 7:00 AM | Imported from order.csv as delivered/on-site outstanding bin', 'cement'),
    ('SOT13471', '14-92', '14', '2026-05-05', 'AM', '5/29/2026 9-11AM', '92 Briarwood Rd, Unionville, ON L3R 2X3', '647-885-5930', 'DIRVEWAY, 現場收600 | CSV time: 5/29/2026 9-11AM | Imported from order.csv as delivered/on-site outstanding bin', 'garbage'),
    ('SOT13511', '20-11', '20', '2026-05-05', 'PM', '5/29/2026 PM ASAP', '12624 Kennedy Rd, Whitchurch-Stouffville, ON L4A 7X5', '647-450-6666', 'CONFIRM ON SITE | CSV time: 5/29/2026 PM ASAP | Imported from order.csv as delivered/on-site outstanding bin', 'garbage'),
    ('SOT13539', '14-43', '14', '2026-05-05', '7-9', '5/30/2026 7-9AM', '63 Eastwood Crescent, Markham, ON L3P 6A1', '416-702-5250', 'DRIVEWAY RIGHT | CSV time: 5/30/2026 7-9AM | Imported from order.csv as delivered/on-site outstanding bin', 'garbage'),
    ('SOT13540', '20-31', '20', '2026-05-05', 'PM', '5/30/2026 PM ASAP', '1210 Markham Rd Unit 6, Scarborough, ON M1H 3B3', '416-455-8621', 'loading dock of Unit.6 | CSV time: 5/30/2026 PM ASAP | Imported from order.csv as delivered/on-site outstanding bin', 'garbage'),
    ('SOT13542', '20-46', '20', '2026-05-05', 'PM', '5/30/2026, PM', '47 Dallas Rd, North York, ON M2R 2J3', '647-388-6728', 'CONFIRM ON SITE | CSV time: 5/30/2026, PM | Imported from order.csv as delivered/on-site outstanding bin', 'garbage'),
    ('SOT13534', 'L20-05', '20', '2026-05-05', 'AM', '5/30/2026 AM', '13 Carmel Ct, North York, ON M2M 4B2', '416-700-0666', 'DRIVEWAY LEFT | CSV time: 5/30/2026 AM | Imported from order.csv as delivered/on-site outstanding bin', 'garbage'),
    ('SOT13615', '40-01', '40', '2026-05-05', 'PM', '6/1/2026 PM', '2967 Kennedy Rd, Toronto, ON M1V 1S9', '647-702-8163', 'SAME | CSV time: 6/1/2026 PM | Imported from order.csv as delivered/on-site outstanding bin', 'garbage'),
    ('SOT13543', '14-48', '14', '2026-05-05', 'AM', '6/1/2026 AM', '1 Clark Ave W, Thornhill, ON L4J 7Y6', 'Rooney 647-969-6715', 'SAME | CSV time: 6/1/2026 AM | Imported from order.csv as delivered/on-site outstanding bin', 'garbage'),
    ('SOT13510', '20-49', '20', '2026-05-05', 'PM', '6/1/2026 before 12PM', '18 Timberglade Ct., North York, ON M2L 2Y2', '416-299-0069', 'DRIVEWAY | CSV time: 6/1/2026 before 12PM | Imported from order.csv as delivered/on-site outstanding bin', 'garbage'),
    ('D09758', '14-59', '14', '2026-05-05', 'PM', '6/1/2026 1-3PM', '130 Larratt Ln, Richmond Hill, ON L4C 0E6', '647-977-8888', 'CONFIRM ON SITE | CSV time: 6/1/2026 1-3PM | Imported from order.csv as delivered/on-site outstanding bin', 'garbage'),
    ('SOT13581', '14-85', '14', '2026-05-05', 'PM', '6/1/2026 10-12PM', '6 Tourmaline Dr, Scarborough, ON M1T 1X2', '647-885-5930', 'DIRVEWAY右邊, 現場收$770 | CSV time: 6/1/2026 10-12PM | Imported from order.csv as delivered/on-site outstanding bin', 'garbage'),
    ('SOT13505', '20-27', '20', '2026-05-05', 'AM', '6/1/2026 9:00 AM', '78 Brock Ave, Markham, ON L6C 0V4', '905-260-6888', 'DRIVEWAY | CSV time: 6/1/2026 9:00 AM | Imported from order.csv as delivered/on-site outstanding bin', 'garbage'),
    ('SOT13535', '20-32', '20', '2026-05-06', 'custom', '5/29/2026 ANYTIME', 'Unit 369,200 Silver Star Blvd, Scarborough, ON M1V 5H4', '647-339-1027 / 416-930-3905', 'SAME, 客人要求盡量貼近LOADING DOCK | CSV time: 5/29/2026 ANYTIME | Imported from order.csv as delivered/on-site outstanding bin', 'garbage'),
    ('SOT13512', '20-16', '20', '2026-05-06', 'PM', '5/29/2026 PM ASAP', '1829 Mt Albert Rd, East Gwillimbury, ON L0G 1V0', '647-450-6666', 'CONFIRM ON SITE | CSV time: 5/29/2026 PM ASAP | Imported from order.csv as delivered/on-site outstanding bin', 'garbage')
), latest_rows AS (
  SELECT DISTINCT ON (bin_number) *
  FROM import_rows
  ORDER BY bin_number, service_date::date DESC, order_number DESC
), updated_bins AS (
  UPDATE public.bins b
  SET size = lr.bin_size::public.bin_size,
      status = 'on_site'::public.bin_status,
      current_address = lr.address,
      last_moved_at = lr.service_date::date::timestamptz,
      notes = COALESCE(b.notes, 'Imported from order.csv outstanding bin'),
      is_active = true
  FROM latest_rows lr
  WHERE b.bin_number = lr.bin_number
  RETURNING b.id, b.bin_number
), inserted_bins AS (
  INSERT INTO public.bins (bin_number, size, status, current_address, last_moved_at, notes, is_active)
  SELECT
    lr.bin_number,
    lr.bin_size::public.bin_size,
    'on_site'::public.bin_status,
    lr.address,
    lr.service_date::date::timestamptz,
    'Imported from order.csv outstanding bin',
    true
  FROM latest_rows lr
  WHERE NOT EXISTS (
    SELECT 1 FROM public.bins b WHERE b.bin_number = lr.bin_number
  )
  RETURNING id, bin_number
), inserted_orders AS (
  INSERT INTO public.orders (
    order_number, type, bin_size, service_date, time_window, time_window_custom,
    address, customer_name, customer_phone, customer_notes, status, bin_number, bin_type, business_type, updated_at
  )
  SELECT
    order_number,
    'delivery'::public.order_type,
    bin_size::public.bin_size,
    service_date::date,
    time_window::public.time_window,
    time_window_custom,
    address,
    order_number,
    COALESCE(NULLIF(customer_phone, ''), ''),
    customer_notes,
    'done'::public.order_status,
    bin_number,
    bin_type,
    'garbage'::public.business_type,
    now()
  FROM import_rows
  ON CONFLICT (order_number, type) DO NOTHING
  RETURNING id, order_number, bin_number
), matching_orders AS (
  SELECT o.id, o.order_number, r.bin_number, r.address
  FROM import_rows r
  JOIN public.orders o ON o.order_number = r.order_number AND o.type = 'delivery'::public.order_type
)
UPDATE public.bins b
SET current_order_id = mo.id,
    current_address = mo.address,
    status = 'on_site'::public.bin_status,
    last_moved_at = now()
FROM matching_orders mo
WHERE b.bin_number = mo.bin_number;
