-- Upsert Sync (Merging with existing data)
ALTER TYPE public.bin_size ADD VALUE IF NOT EXISTS '30';
ALTER TYPE public.time_window ADD VALUE IF NOT EXISTS 'ANYTIME';

BEGIN;

INSERT INTO public.bins (bin_number, size, status, current_address, notes) VALUES
  ('L20-12', '20'::public.bin_size, 'on_site'::public.bin_status, '67 Jacob Keffer Pkwy, Vaughan, ON L4K 5N8', 'Delivered via SOT13144'),
  ('40-15', '40'::public.bin_size, 'on_site'::public.bin_status, '2065 Midland Ave, Scarborough, ON M1P 4P8', 'Delivered via SOT13145'),
  ('14-72', '14'::public.bin_size, 'on_site'::public.bin_status, '42 Ulysses Pl, Scarborough, ON M1V 1H9', 'Delivered via SOT13151'),
  ('L20-06', '20'::public.bin_size, 'on_site'::public.bin_status, '67 Princess Ave, North York, ON M2N 3R5', 'Delivered via SOT13143'),
  ('14-87', '14'::public.bin_size, 'on_site'::public.bin_status, '62 Busch Ave, Markham, ON L6C 0R8', 'Delivered via D09697'),
  ('14-90', '14'::public.bin_size, 'on_site'::public.bin_status, '544 Forsyth Farm Dr, Whitchurch-Stouffville, ON L4A 0N3', 'Delivered via D09696'),
  ('14-25', '14'::public.bin_size, 'on_site'::public.bin_status, '241 East St, Holland Landing, ON L9N 1K8', 'Delivered via SOT13098'),
  ('20-44', '20'::public.bin_size, 'depot'::public.bin_status, 'Depot', 'Picked up via SOT12692'),
  ('20-06', '20'::public.bin_size, 'depot'::public.bin_status, 'Depot', 'Picked up via SOT12776'),
  ('14-24', '14'::public.bin_size, 'depot'::public.bin_status, 'Depot', 'Picked up via D09687'),
  ('14-38', '14'::public.bin_size, 'depot'::public.bin_status, 'Depot', 'Picked up via SOT13052'),
  ('14-15', '14'::public.bin_size, 'depot'::public.bin_status, 'Depot', 'Picked up via SOT12551'),
  ('20-53', '20'::public.bin_size, 'depot'::public.bin_status, 'Depot', 'Picked up via SOT13042')
ON CONFLICT (bin_number) DO UPDATE SET 
  size = EXCLUDED.size, 
  status = EXCLUDED.status, 
  current_address = EXCLUDED.current_address, 
  notes = EXCLUDED.notes;

INSERT INTO public.orders (order_number, type, bin_size, bin_type, service_date, time_window, time_window_custom, address, customer_name, customer_phone, customer_notes, status) VALUES
  ('SOT13144', 'delivery'::public.order_type, '20'::public.bin_size, 'garbage'::public.bin_type, '2026-05-15'::date, 'AM'::public.time_window, NULL, '67 Jacob Keffer Pkwy, Vaughan, ON L4K 5N8', '67 Jacob Keffer Pkwy', '416-878-8877', 'SAME', 'done'::public.order_status)
ON CONFLICT (order_number, type) DO UPDATE SET
  bin_size = EXCLUDED.bin_size,
  bin_type = EXCLUDED.bin_type,
  service_date = EXCLUDED.service_date,
  time_window = EXCLUDED.time_window,
  address = EXCLUDED.address,
  status = EXCLUDED.status,
  updated_at = now();

INSERT INTO public.orders (order_number, type, bin_size, bin_type, service_date, time_window, time_window_custom, address, customer_name, customer_phone, customer_notes, status) VALUES
  ('SOT13145', 'delivery'::public.order_type, '40'::public.bin_size, 'garbage'::public.bin_type, '2026-05-15'::date, 'AM'::public.time_window, NULL, '2065 Midland Ave, Scarborough, ON M1P 4P8', '2065 Midland Ave', '437-299-2228', 'SAME', 'done'::public.order_status)
ON CONFLICT (order_number, type) DO UPDATE SET
  bin_size = EXCLUDED.bin_size,
  bin_type = EXCLUDED.bin_type,
  service_date = EXCLUDED.service_date,
  time_window = EXCLUDED.time_window,
  address = EXCLUDED.address,
  status = EXCLUDED.status,
  updated_at = now();

INSERT INTO public.orders (order_number, type, bin_size, bin_type, service_date, time_window, time_window_custom, address, customer_name, customer_phone, customer_notes, status) VALUES
  ('SOT13146', 'delivery'::public.order_type, '40'::public.bin_size, 'garbage'::public.bin_type, '2026-05-15'::date, 'AM'::public.time_window, NULL, '2065 Midland Ave, Scarborough, ON M1P 4P8', '2065 Midland Ave', '437-299-2228', 'SAME', 'pending'::public.order_status)
ON CONFLICT (order_number, type) DO UPDATE SET
  bin_size = EXCLUDED.bin_size,
  bin_type = EXCLUDED.bin_type,
  service_date = EXCLUDED.service_date,
  time_window = EXCLUDED.time_window,
  address = EXCLUDED.address,
  status = EXCLUDED.status,
  updated_at = now();

INSERT INTO public.orders (order_number, type, bin_size, bin_type, service_date, time_window, time_window_custom, address, customer_name, customer_phone, customer_notes, status) VALUES
  ('SOT13150', 'delivery'::public.order_type, '40'::public.bin_size, 'garbage'::public.bin_type, '2026-05-15'::date, 'PM'::public.time_window, NULL, '520 Industrial Pkwy S, Aurora, ON L4G 3W7', '520 Industrial Pkwy S', '416-991-9719', 'CONFIRM ON SITE', 'pending'::public.order_status)
ON CONFLICT (order_number, type) DO UPDATE SET
  bin_size = EXCLUDED.bin_size,
  bin_type = EXCLUDED.bin_type,
  service_date = EXCLUDED.service_date,
  time_window = EXCLUDED.time_window,
  address = EXCLUDED.address,
  status = EXCLUDED.status,
  updated_at = now();

INSERT INTO public.orders (order_number, type, bin_size, bin_type, service_date, time_window, time_window_custom, address, customer_name, customer_phone, customer_notes, status) VALUES
  ('SOA01232', 'material'::public.order_type, '14'::public.bin_size, 'garbage'::public.bin_type, '2026-05-15'::date, 'AM'::public.time_window, NULL, '27 Polarlights Way, Scarborough, ON M1X 1Z4', '27 Polarlights Way', '647-657-2155', 'DRIVEWAY', 'pending'::public.order_status)
ON CONFLICT (order_number, type) DO UPDATE SET
  bin_size = EXCLUDED.bin_size,
  bin_type = EXCLUDED.bin_type,
  service_date = EXCLUDED.service_date,
  time_window = EXCLUDED.time_window,
  address = EXCLUDED.address,
  status = EXCLUDED.status,
  updated_at = now();

INSERT INTO public.orders (order_number, type, bin_size, bin_type, service_date, time_window, time_window_custom, address, customer_name, customer_phone, customer_notes, status) VALUES
  ('SOT13151', 'delivery'::public.order_type, '14'::public.bin_size, 'garbage'::public.bin_type, '2026-05-15'::date, 'AM'::public.time_window, NULL, '42 Ulysses Pl, Scarborough, ON M1V 1H9', '42 Ulysses Pl', '416-890-8667', 'CONFIRM ON SITE', 'done'::public.order_status)
ON CONFLICT (order_number, type) DO UPDATE SET
  bin_size = EXCLUDED.bin_size,
  bin_type = EXCLUDED.bin_type,
  service_date = EXCLUDED.service_date,
  time_window = EXCLUDED.time_window,
  address = EXCLUDED.address,
  status = EXCLUDED.status,
  updated_at = now();

INSERT INTO public.orders (order_number, type, bin_size, bin_type, service_date, time_window, time_window_custom, address, customer_name, customer_phone, customer_notes, status) VALUES
  ('D09698', 'delivery'::public.order_type, '14'::public.bin_size, 'garbage'::public.bin_type, '2026-05-15'::date, 'custom'::public.time_window, '5/15/2026 NOON', '58 Adams Dr, Ajax, ON L1S 5V2', '58 Adams Dr', '416-902-9357', 'receive $815', 'pending'::public.order_status)
ON CONFLICT (order_number, type) DO UPDATE SET
  bin_size = EXCLUDED.bin_size,
  bin_type = EXCLUDED.bin_type,
  service_date = EXCLUDED.service_date,
  time_window = EXCLUDED.time_window,
  address = EXCLUDED.address,
  status = EXCLUDED.status,
  updated_at = now();

INSERT INTO public.orders (order_number, type, bin_size, bin_type, service_date, time_window, time_window_custom, address, customer_name, customer_phone, customer_notes, status) VALUES
  ('SOT13141', 'delivery'::public.order_type, '14'::public.bin_size, 'garbage'::public.bin_type, '2026-05-15'::date, 'AM'::public.time_window, NULL, '21 Sheldon Dr, Ajax, ON L1T 4K7', '21 Sheldon Dr', '647-866-3892', 'DRIVEWAY', 'pending'::public.order_status)
ON CONFLICT (order_number, type) DO UPDATE SET
  bin_size = EXCLUDED.bin_size,
  bin_type = EXCLUDED.bin_type,
  service_date = EXCLUDED.service_date,
  time_window = EXCLUDED.time_window,
  address = EXCLUDED.address,
  status = EXCLUDED.status,
  updated_at = now();

INSERT INTO public.orders (order_number, type, bin_size, bin_type, service_date, time_window, time_window_custom, address, customer_name, customer_phone, customer_notes, status) VALUES
  ('SOR00006', 'delivery'::public.order_type, '20'::public.bin_size, 'garbage'::public.bin_type, '2026-05-15'::date, '7-9'::public.time_window, NULL, '141 Castle Crescent, Oakville, ON L6J 5H3', '141 Castle Crescent', '416-998-2079', 'delivery 現場收押金$1585', 'pending'::public.order_status)
ON CONFLICT (order_number, type) DO UPDATE SET
  bin_size = EXCLUDED.bin_size,
  bin_type = EXCLUDED.bin_type,
  service_date = EXCLUDED.service_date,
  time_window = EXCLUDED.time_window,
  address = EXCLUDED.address,
  status = EXCLUDED.status,
  updated_at = now();

INSERT INTO public.orders (order_number, type, bin_size, bin_type, service_date, time_window, time_window_custom, address, customer_name, customer_phone, customer_notes, status) VALUES
  ('SOT13143', 'delivery'::public.order_type, '20'::public.bin_size, 'garbage'::public.bin_type, '2026-05-15'::date, 'AM'::public.time_window, NULL, '67 Princess Ave, North York, ON M2N 3R5', '67 Princess Ave', '416-436-7299 / 403-853-2586', 'Facing house right side of driveway', 'done'::public.order_status)
ON CONFLICT (order_number, type) DO UPDATE SET
  bin_size = EXCLUDED.bin_size,
  bin_type = EXCLUDED.bin_type,
  service_date = EXCLUDED.service_date,
  time_window = EXCLUDED.time_window,
  address = EXCLUDED.address,
  status = EXCLUDED.status,
  updated_at = now();

INSERT INTO public.orders (order_number, type, bin_size, bin_type, service_date, time_window, time_window_custom, address, customer_name, customer_phone, customer_notes, status) VALUES
  ('SOT13147', 'delivery'::public.order_type, '20'::public.bin_size, 'garbage'::public.bin_type, '2026-05-15'::date, 'PM'::public.time_window, NULL, '41 Galsworthy Dr, Markham, ON L3P 1T2', '41 Galsworthy Dr', '416-931-3898 / 416-505-8837', 'Center of the driveway HINO', 'pending'::public.order_status)
ON CONFLICT (order_number, type) DO UPDATE SET
  bin_size = EXCLUDED.bin_size,
  bin_type = EXCLUDED.bin_type,
  service_date = EXCLUDED.service_date,
  time_window = EXCLUDED.time_window,
  address = EXCLUDED.address,
  status = EXCLUDED.status,
  updated_at = now();

INSERT INTO public.orders (order_number, type, bin_size, bin_type, service_date, time_window, time_window_custom, address, customer_name, customer_phone, customer_notes, status) VALUES
  ('D09697', 'delivery'::public.order_type, '14'::public.bin_size, 'soil'::public.bin_type, '2026-05-15'::date, 'PM'::public.time_window, NULL, '62 Busch Ave, Markham, ON L6C 0R8', '62 Busch Ave', '647-271-7929', '桶放路邊, 收$787', 'done'::public.order_status)
ON CONFLICT (order_number, type) DO UPDATE SET
  bin_size = EXCLUDED.bin_size,
  bin_type = EXCLUDED.bin_type,
  service_date = EXCLUDED.service_date,
  time_window = EXCLUDED.time_window,
  address = EXCLUDED.address,
  status = EXCLUDED.status,
  updated_at = now();

INSERT INTO public.orders (order_number, type, bin_size, bin_type, service_date, time_window, time_window_custom, address, customer_name, customer_phone, customer_notes, status) VALUES
  ('D09696', 'delivery'::public.order_type, '14'::public.bin_size, 'soil'::public.bin_type, '2026-05-15'::date, 'AM'::public.time_window, NULL, '544 Forsyth Farm Dr, Whitchurch-Stouffville, ON L4A 0N3', '544 Forsyth Farm Dr', '437-770-7368', '桶放路邊，料放車道, 收$250 当天拉走', 'done'::public.order_status)
ON CONFLICT (order_number, type) DO UPDATE SET
  bin_size = EXCLUDED.bin_size,
  bin_type = EXCLUDED.bin_type,
  service_date = EXCLUDED.service_date,
  time_window = EXCLUDED.time_window,
  address = EXCLUDED.address,
  status = EXCLUDED.status,
  updated_at = now();

INSERT INTO public.orders (order_number, type, bin_size, bin_type, service_date, time_window, time_window_custom, address, customer_name, customer_phone, customer_notes, status) VALUES
  ('SOB108612', 'delivery'::public.order_type, '14'::public.bin_size, 'garbage'::public.bin_type, '2026-05-15'::date, 'AM'::public.time_window, NULL, '544 Forsyth Farm Dr, Whitchurch-Stouffville, ON L4A 0N3', '544 Forsyth Farm Dr', '416-219-8133', 'Customer will be there', 'pending'::public.order_status)
ON CONFLICT (order_number, type) DO UPDATE SET
  bin_size = EXCLUDED.bin_size,
  bin_type = EXCLUDED.bin_type,
  service_date = EXCLUDED.service_date,
  time_window = EXCLUDED.time_window,
  address = EXCLUDED.address,
  status = EXCLUDED.status,
  updated_at = now();

INSERT INTO public.orders (order_number, type, bin_size, bin_type, service_date, time_window, time_window_custom, address, customer_name, customer_phone, customer_notes, status) VALUES
  ('SOT13098', 'delivery'::public.order_type, '14'::public.bin_size, 'garbage'::public.bin_type, '2026-05-15'::date, 'AM'::public.time_window, NULL, '241 East St, Holland Landing, ON L9N 1K8', '241 East St', '289-500-3373', 'DRIVEWAY, put wood underneath', 'done'::public.order_status)
ON CONFLICT (order_number, type) DO UPDATE SET
  bin_size = EXCLUDED.bin_size,
  bin_type = EXCLUDED.bin_type,
  service_date = EXCLUDED.service_date,
  time_window = EXCLUDED.time_window,
  address = EXCLUDED.address,
  status = EXCLUDED.status,
  updated_at = now();

INSERT INTO public.orders (order_number, type, bin_size, bin_type, service_date, time_window, time_window_custom, address, customer_name, customer_phone, customer_notes, status) VALUES
  ('SOT13153', 'delivery'::public.order_type, '14'::public.bin_size, 'garbage'::public.bin_type, '2026-05-15'::date, 'PM'::public.time_window, NULL, '30 Alanadale Ave, Markham, ON L3P 1S3', '30 Alanadale Ave', '647-972-9866', 'DRIVEWAY', 'pending'::public.order_status)
ON CONFLICT (order_number, type) DO UPDATE SET
  bin_size = EXCLUDED.bin_size,
  bin_type = EXCLUDED.bin_type,
  service_date = EXCLUDED.service_date,
  time_window = EXCLUDED.time_window,
  address = EXCLUDED.address,
  status = EXCLUDED.status,
  updated_at = now();

INSERT INTO public.orders (order_number, type, bin_size, bin_type, service_date, time_window, time_window_custom, address, customer_name, customer_phone, customer_notes, status) VALUES
  ('SOT13157', 'delivery'::public.order_type, '20'::public.bin_size, 'garbage'::public.bin_type, '2026-05-15'::date, 'PM'::public.time_window, NULL, 'Unit 369,200 Silver Star Blvd, Scarborough, ON M1V 5H4', 'Unit 369', '647-339-1027 / 416-930-3905', 'SAME, 客人要求盡量貼近LOADING DOCK', 'pending'::public.order_status)
ON CONFLICT (order_number, type) DO UPDATE SET
  bin_size = EXCLUDED.bin_size,
  bin_type = EXCLUDED.bin_type,
  service_date = EXCLUDED.service_date,
  time_window = EXCLUDED.time_window,
  address = EXCLUDED.address,
  status = EXCLUDED.status,
  updated_at = now();

INSERT INTO public.orders (order_number, type, bin_size, bin_type, service_date, time_window, time_window_custom, address, customer_name, customer_phone, customer_notes, status) VALUES
  ('SOT12692', 'pickup'::public.order_type, '20'::public.bin_size, 'garbage'::public.bin_type, '2026-05-15'::date, 'custom'::public.time_window, '5/14 CAN', '32 Sisina Ave, Markham, ON L6C 0H6', '32 Sisina Ave', '647-204-8324', 'HINO', 'done'::public.order_status)
ON CONFLICT (order_number, type) DO UPDATE SET
  bin_size = EXCLUDED.bin_size,
  bin_type = EXCLUDED.bin_type,
  service_date = EXCLUDED.service_date,
  time_window = EXCLUDED.time_window,
  address = EXCLUDED.address,
  status = EXCLUDED.status,
  updated_at = now();

INSERT INTO public.orders (order_number, type, bin_size, bin_type, service_date, time_window, time_window_custom, address, customer_name, customer_phone, customer_notes, status) VALUES
  ('SOT12776', 'pickup'::public.order_type, '20'::public.bin_size, 'garbage'::public.bin_type, '2026-05-15'::date, 'custom'::public.time_window, '5/15 MUST', '262 Orr Dr, Bradford, ON L3Z 0B9', '262 Orr Dr', '647-388-8089', '', 'done'::public.order_status)
ON CONFLICT (order_number, type) DO UPDATE SET
  bin_size = EXCLUDED.bin_size,
  bin_type = EXCLUDED.bin_type,
  service_date = EXCLUDED.service_date,
  time_window = EXCLUDED.time_window,
  address = EXCLUDED.address,
  status = EXCLUDED.status,
  updated_at = now();

INSERT INTO public.orders (order_number, type, bin_size, bin_type, service_date, time_window, time_window_custom, address, customer_name, customer_phone, customer_notes, status) VALUES
  ('D09687', 'pickup'::public.order_type, '14'::public.bin_size, 'soil'::public.bin_type, '2026-05-15'::date, 'PM'::public.time_window, NULL, '15 Guytoi Ct, North York, ON M3C 1Y1', '15 Guytoi Ct', '647-836-6633', '', 'done'::public.order_status)
ON CONFLICT (order_number, type) DO UPDATE SET
  bin_size = EXCLUDED.bin_size,
  bin_type = EXCLUDED.bin_type,
  service_date = EXCLUDED.service_date,
  time_window = EXCLUDED.time_window,
  address = EXCLUDED.address,
  status = EXCLUDED.status,
  updated_at = now();

INSERT INTO public.orders (order_number, type, bin_size, bin_type, service_date, time_window, time_window_custom, address, customer_name, customer_phone, customer_notes, status) VALUES
  ('SOT13052', 'pickup'::public.order_type, '14'::public.bin_size, 'asphalt'::public.bin_type, '2026-05-15'::date, 'AM'::public.time_window, NULL, '740 York Mills Rd, North York, ON M3B 1W8', '740 York Mills Rd', '416-995-3376', '', 'done'::public.order_status)
ON CONFLICT (order_number, type) DO UPDATE SET
  bin_size = EXCLUDED.bin_size,
  bin_type = EXCLUDED.bin_type,
  service_date = EXCLUDED.service_date,
  time_window = EXCLUDED.time_window,
  address = EXCLUDED.address,
  status = EXCLUDED.status,
  updated_at = now();

INSERT INTO public.orders (order_number, type, bin_size, bin_type, service_date, time_window, time_window_custom, address, customer_name, customer_phone, customer_notes, status) VALUES
  ('SOT12551', 'pickup'::public.order_type, '14'::public.bin_size, 'garbage'::public.bin_type, '2026-05-15'::date, 'custom'::public.time_window, '5/15 OR 5/16 CAN', '92 Granada Crescent, Scarborough, ON M1B 2H5', '92 Granada Crescent', '647-231-3366', 'HINO', 'done'::public.order_status)
ON CONFLICT (order_number, type) DO UPDATE SET
  bin_size = EXCLUDED.bin_size,
  bin_type = EXCLUDED.bin_type,
  service_date = EXCLUDED.service_date,
  time_window = EXCLUDED.time_window,
  address = EXCLUDED.address,
  status = EXCLUDED.status,
  updated_at = now();

INSERT INTO public.orders (order_number, type, bin_size, bin_type, service_date, time_window, time_window_custom, address, customer_name, customer_phone, customer_notes, status) VALUES
  ('SOT13042', 'pickup'::public.order_type, '20'::public.bin_size, 'garbage'::public.bin_type, '2026-05-15'::date, 'custom'::public.time_window, '', 'Unit 369,200 Silver Star Blvd, Scarborough, ON M1V 5H4', 'Unit 369', '647-339-1027 / 416-930-3905', '', 'done'::public.order_status)
ON CONFLICT (order_number, type) DO UPDATE SET
  bin_size = EXCLUDED.bin_size,
  bin_type = EXCLUDED.bin_type,
  service_date = EXCLUDED.service_date,
  time_window = EXCLUDED.time_window,
  address = EXCLUDED.address,
  status = EXCLUDED.status,
  updated_at = now();

COMMIT;
