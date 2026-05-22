-- Upsert Sync (Merging with existing data)
ALTER TYPE public.bin_size ADD VALUE IF NOT EXISTS '30';
ALTER TYPE public.time_window ADD VALUE IF NOT EXISTS 'ANYTIME';

BEGIN;

INSERT INTO public.bins (bin_number, size, status, current_address, notes) VALUES
  ('14-29', '14'::public.bin_size, 'on_site'::public.bin_status, '195 Greenbrooke Dr, Woodbridge, ON L4H 4X4', 'Delivered via D09712'),
  ('14-43', '14'::public.bin_size, 'depot'::public.bin_status, 'Depot', 'Picked up via SOT12823'),
  ('14-15', '14'::public.bin_size, 'depot'::public.bin_status, 'Depot', 'Picked up via SOT13057'),
  ('L20-12', '20'::public.bin_size, 'depot'::public.bin_status, 'Depot', 'Picked up via SOT13144'),
  ('14-87', '14'::public.bin_size, 'on_site'::public.bin_status, '26 The Shire Ln, Markham, ON L6B 0N2', 'Delivered via SOT13258'),
  ('20-01', '20'::public.bin_size, 'on_site'::public.bin_status, '27 Jinnah Ave, Markham, ON L3S 0G2', 'Delivered via SOT13266'),
  ('40-10', '40'::public.bin_size, 'depot'::public.bin_status, 'Depot', 'Picked up via SOT13256'),
  ('20-42', '20'::public.bin_size, 'depot'::public.bin_status, 'Depot', 'Picked up via SOT13156'),
  ('20-39', '20'::public.bin_size, 'on_site'::public.bin_status, '168 Risebrough Circuit, Markham, ON L3R 3E3', 'Delivered via SOT13272'),
  ('L20-17', '20'::public.bin_size, 'depot'::public.bin_status, 'Depot', 'Picked up via SOT13055'),
  ('20-05', '20'::public.bin_size, 'depot'::public.bin_status, 'Depot', 'Picked up via SOT12719'),
  ('20-19', '20'::public.bin_size, 'depot'::public.bin_status, 'Depot', 'Picked up via SOT12543'),
  ('14-56', '14'::public.bin_size, 'depot'::public.bin_status, 'Depot', 'Picked up via SOT13260'),
  ('14-79', '14'::public.bin_size, 'depot'::public.bin_status, 'Depot', 'Picked up via SOT13026'),
  ('20-03', '20'::public.bin_size, 'depot'::public.bin_status, 'Depot', 'Picked up via SOT12899'),
  ('20-38', '20'::public.bin_size, 'depot'::public.bin_status, 'Depot', 'Picked up via SOT12689')
ON CONFLICT (bin_number) DO UPDATE SET 
  size = EXCLUDED.size, 
  status = EXCLUDED.status, 
  current_address = EXCLUDED.current_address, 
  notes = EXCLUDED.notes,
  current_order_id = CASE WHEN EXCLUDED.status = 'depot' THEN NULL ELSE public.bins.current_order_id END;

INSERT INTO public.orders (order_number, type, bin_size, bin_type, service_date, time_window, time_window_custom, address, customer_name, customer_phone, customer_notes, status) VALUES
  ('D09712', 'delivery'::public.order_type, '14'::public.bin_size, 'soil'::public.bin_type, '2026-05-20'::date, '7-9'::public.time_window, NULL, '195 Greenbrooke Dr, Woodbridge, ON L4H 4X4', '195 Greenbrooke Dr', '647-889-9637', '收$1000', 'done'::public.order_status)
ON CONFLICT (order_number, type) DO UPDATE SET
  bin_size = EXCLUDED.bin_size,
  bin_type = EXCLUDED.bin_type,
  service_date = EXCLUDED.service_date,
  time_window = EXCLUDED.time_window,
  address = EXCLUDED.address,
  status = EXCLUDED.status,
  updated_at = now();

INSERT INTO public.orders (order_number, type, bin_size, bin_type, service_date, time_window, time_window_custom, address, customer_name, customer_phone, customer_notes, status) VALUES
  ('SOT13058', 'delivery'::public.order_type, '14'::public.bin_size, 'garbage'::public.bin_type, '2026-05-20'::date, 'AM'::public.time_window, NULL, '32 Lake Shore Dr, Etobicoke, ON M8V 1Z4', '32 Lake Shore Dr', '416-301-9889', 'SAME', 'done'::public.order_status)
ON CONFLICT (order_number, type) DO UPDATE SET
  bin_size = EXCLUDED.bin_size,
  bin_type = EXCLUDED.bin_type,
  service_date = EXCLUDED.service_date,
  time_window = EXCLUDED.time_window,
  address = EXCLUDED.address,
  status = EXCLUDED.status,
  updated_at = now();

INSERT INTO public.orders (order_number, type, bin_size, bin_type, service_date, time_window, time_window_custom, address, customer_name, customer_phone, customer_notes, status) VALUES
  ('SOT13269', 'delivery'::public.order_type, '14'::public.bin_size, 'garbage'::public.bin_type, '2026-05-20'::date, 'PM'::public.time_window, NULL, '148 Southvale Dr, Vaughan, ON L6A 0Y9', '148 Southvale Dr', '416-712-1105', 'DRIVEWAY', 'done'::public.order_status)
ON CONFLICT (order_number, type) DO UPDATE SET
  bin_size = EXCLUDED.bin_size,
  bin_type = EXCLUDED.bin_type,
  service_date = EXCLUDED.service_date,
  time_window = EXCLUDED.time_window,
  address = EXCLUDED.address,
  status = EXCLUDED.status,
  updated_at = now();

INSERT INTO public.orders (order_number, type, bin_size, bin_type, service_date, time_window, time_window_custom, address, customer_name, customer_phone, customer_notes, status) VALUES
  ('SOT13271', 'delivery'::public.order_type, '20'::public.bin_size, 'garbage'::public.bin_type, '2026-05-20'::date, 'PM'::public.time_window, NULL, '17 Ruby Crescent, Richmond Hill, ON L4S 2E8', '17 Ruby Crescent', '437-881-5358', 'DRIVEWAY', 'done'::public.order_status)
ON CONFLICT (order_number, type) DO UPDATE SET
  bin_size = EXCLUDED.bin_size,
  bin_type = EXCLUDED.bin_type,
  service_date = EXCLUDED.service_date,
  time_window = EXCLUDED.time_window,
  address = EXCLUDED.address,
  status = EXCLUDED.status,
  updated_at = now();

INSERT INTO public.orders (order_number, type, bin_size, bin_type, service_date, time_window, time_window_custom, address, customer_name, customer_phone, customer_notes, status) VALUES
  ('D09715', 'delivery'::public.order_type, '14'::public.bin_size, 'soil'::public.bin_type, '2026-05-20'::date, 'PM'::public.time_window, NULL, '9 Freesia Rd, Markham, ON L6C 1J1', '9 Freesia Rd', '647-328-6116', '收$550, 路邊', 'pending'::public.order_status)
ON CONFLICT (order_number, type) DO UPDATE SET
  bin_size = EXCLUDED.bin_size,
  bin_type = EXCLUDED.bin_type,
  service_date = EXCLUDED.service_date,
  time_window = EXCLUDED.time_window,
  address = EXCLUDED.address,
  status = EXCLUDED.status,
  updated_at = now();

INSERT INTO public.orders (order_number, type, bin_size, bin_type, service_date, time_window, time_window_custom, address, customer_name, customer_phone, customer_notes, status) VALUES
  ('SOT13279', 'delivery'::public.order_type, '40'::public.bin_size, 'garbage'::public.bin_type, '2026-05-20'::date, 'PM'::public.time_window, NULL, '3828 Hwy 7, Unionville, ON L3R 0B5', '3828 Hwy 7', '647-997-3777', 'LIVELOAD', 'pending'::public.order_status)
ON CONFLICT (order_number, type) DO UPDATE SET
  bin_size = EXCLUDED.bin_size,
  bin_type = EXCLUDED.bin_type,
  service_date = EXCLUDED.service_date,
  time_window = EXCLUDED.time_window,
  address = EXCLUDED.address,
  status = EXCLUDED.status,
  updated_at = now();

INSERT INTO public.orders (order_number, type, bin_size, bin_type, service_date, time_window, time_window_custom, address, customer_name, customer_phone, customer_notes, status) VALUES
  ('SOT13258', 'delivery'::public.order_type, '14'::public.bin_size, 'garbage'::public.bin_type, '2026-05-20'::date, 'custom'::public.time_window, 'Wed May 20 2026 12:00:00 GMT-0400 (Eastern Daylight Time)', '26 The Shire Ln, Markham, ON L6B 0N2', '26 The Shire Ln', 'Andy 647-469-6887', 'CONFIRM ON SITE', 'done'::public.order_status)
ON CONFLICT (order_number, type) DO UPDATE SET
  bin_size = EXCLUDED.bin_size,
  bin_type = EXCLUDED.bin_type,
  service_date = EXCLUDED.service_date,
  time_window = EXCLUDED.time_window,
  address = EXCLUDED.address,
  status = EXCLUDED.status,
  updated_at = now();

INSERT INTO public.orders (order_number, type, bin_size, bin_type, service_date, time_window, time_window_custom, address, customer_name, customer_phone, customer_notes, status) VALUES
  ('SOT13266', 'delivery'::public.order_type, '20'::public.bin_size, 'garbage'::public.bin_type, '2026-05-20'::date, 'custom'::public.time_window, '5/20/2026 ASAP', '27 Jinnah Ave, Markham, ON L3S 0G2', '27 Jinnah Ave', '416-890-8667', 'DRIVEWAY', 'done'::public.order_status)
ON CONFLICT (order_number, type) DO UPDATE SET
  bin_size = EXCLUDED.bin_size,
  bin_type = EXCLUDED.bin_type,
  service_date = EXCLUDED.service_date,
  time_window = EXCLUDED.time_window,
  address = EXCLUDED.address,
  status = EXCLUDED.status,
  updated_at = now();

INSERT INTO public.orders (order_number, type, bin_size, bin_type, service_date, time_window, time_window_custom, address, customer_name, customer_phone, customer_notes, status) VALUES
  ('SOT13273', 'delivery'::public.order_type, '40'::public.bin_size, 'garbage'::public.bin_type, '2026-05-20'::date, 'custom'::public.time_window, '5/20/2026 NOON', '1550 16th Ave, Richmond Hill, ON L4B 3K9', '1550 16th Ave', '416-887-0018', 'SAME', 'done'::public.order_status)
ON CONFLICT (order_number, type) DO UPDATE SET
  bin_size = EXCLUDED.bin_size,
  bin_type = EXCLUDED.bin_type,
  service_date = EXCLUDED.service_date,
  time_window = EXCLUDED.time_window,
  address = EXCLUDED.address,
  status = EXCLUDED.status,
  updated_at = now();

INSERT INTO public.orders (order_number, type, bin_size, bin_type, service_date, time_window, time_window_custom, address, customer_name, customer_phone, customer_notes, status) VALUES
  ('SOT13262', 'delivery'::public.order_type, '20'::public.bin_size, 'garbage'::public.bin_type, '2026-05-20'::date, 'PM'::public.time_window, NULL, '1443 Denison St, Markham, ON L3R 5V2', '1443 Denison St', '416-939-7882 / 647-963-3999', 'SAME, 注意不要擋消防門', 'done'::public.order_status)
ON CONFLICT (order_number, type) DO UPDATE SET
  bin_size = EXCLUDED.bin_size,
  bin_type = EXCLUDED.bin_type,
  service_date = EXCLUDED.service_date,
  time_window = EXCLUDED.time_window,
  address = EXCLUDED.address,
  status = EXCLUDED.status,
  updated_at = now();

INSERT INTO public.orders (order_number, type, bin_size, bin_type, service_date, time_window, time_window_custom, address, customer_name, customer_phone, customer_notes, status) VALUES
  ('D09709', 'delivery'::public.order_type, '14'::public.bin_size, 'brick'::public.bin_type, '2026-05-20'::date, 'PM'::public.time_window, NULL, '64 Melford Dr, Scarborough, ON M1B 2G1', '64 Melford Dr', '647-267-1828', 'SAME, 收$500', 'pending'::public.order_status)
ON CONFLICT (order_number, type) DO UPDATE SET
  bin_size = EXCLUDED.bin_size,
  bin_type = EXCLUDED.bin_type,
  service_date = EXCLUDED.service_date,
  time_window = EXCLUDED.time_window,
  address = EXCLUDED.address,
  status = EXCLUDED.status,
  updated_at = now();

INSERT INTO public.orders (order_number, type, bin_size, bin_type, service_date, time_window, time_window_custom, address, customer_name, customer_phone, customer_notes, status) VALUES
  ('SOT13272', 'delivery'::public.order_type, '20'::public.bin_size, 'garbage'::public.bin_type, '2026-05-20'::date, 'PM'::public.time_window, NULL, '168 Risebrough Circuit, Markham, ON L3R 3E3', '168 Risebrough Circuit', '416-830-0506', 'CONFIRM ON SITE', 'done'::public.order_status)
ON CONFLICT (order_number, type) DO UPDATE SET
  bin_size = EXCLUDED.bin_size,
  bin_type = EXCLUDED.bin_type,
  service_date = EXCLUDED.service_date,
  time_window = EXCLUDED.time_window,
  address = EXCLUDED.address,
  status = EXCLUDED.status,
  updated_at = now();

INSERT INTO public.orders (order_number, type, bin_size, bin_type, service_date, time_window, time_window_custom, address, customer_name, customer_phone, customer_notes, status) VALUES
  ('SOT13255', 'delivery'::public.order_type, '20'::public.bin_size, 'garbage'::public.bin_type, '2026-05-20'::date, 'AM'::public.time_window, NULL, '26 Orlon Crescent, Richmond Hill, ON L4C 6S5', '26 Orlon Crescent', '647-355-3777', 'SAME', 'done'::public.order_status)
ON CONFLICT (order_number, type) DO UPDATE SET
  bin_size = EXCLUDED.bin_size,
  bin_type = EXCLUDED.bin_type,
  service_date = EXCLUDED.service_date,
  time_window = EXCLUDED.time_window,
  address = EXCLUDED.address,
  status = EXCLUDED.status,
  updated_at = now();

INSERT INTO public.orders (order_number, type, bin_size, bin_type, service_date, time_window, time_window_custom, address, customer_name, customer_phone, customer_notes, status) VALUES
  ('SOT13249', 'delivery'::public.order_type, '20'::public.bin_size, 'garbage'::public.bin_type, '2026-05-20'::date, 'AM'::public.time_window, NULL, '66 Rancliffe Rd, Oakville, ON L6H 1B2', '66 Rancliffe Rd', 'Rooney 647-969-6715', 'SAME', 'done'::public.order_status)
ON CONFLICT (order_number, type) DO UPDATE SET
  bin_size = EXCLUDED.bin_size,
  bin_type = EXCLUDED.bin_type,
  service_date = EXCLUDED.service_date,
  time_window = EXCLUDED.time_window,
  address = EXCLUDED.address,
  status = EXCLUDED.status,
  updated_at = now();

INSERT INTO public.orders (order_number, type, bin_size, bin_type, service_date, time_window, time_window_custom, address, customer_name, customer_phone, customer_notes, status) VALUES
  ('SOT13265', 'delivery'::public.order_type, '20'::public.bin_size, 'garbage'::public.bin_type, '2026-05-20'::date, 'PM'::public.time_window, NULL, '32 Ashwarren Rd, North York, ON M3J 1Z7', '32 Ashwarren Rd', '647-612-0157 / 647-325-7797', 'SAME HINO', 'done'::public.order_status)
ON CONFLICT (order_number, type) DO UPDATE SET
  bin_size = EXCLUDED.bin_size,
  bin_type = EXCLUDED.bin_type,
  service_date = EXCLUDED.service_date,
  time_window = EXCLUDED.time_window,
  address = EXCLUDED.address,
  status = EXCLUDED.status,
  updated_at = now();

INSERT INTO public.orders (order_number, type, bin_size, bin_type, service_date, time_window, time_window_custom, address, customer_name, customer_phone, customer_notes, status) VALUES
  ('SOT13270', 'delivery'::public.order_type, '20'::public.bin_size, 'garbage'::public.bin_type, '2026-05-20'::date, 'PM'::public.time_window, NULL, '17 Silk Ct, Richmond Hill, ON L4B 4A4', '17 Silk Ct', 'Rooney 647-969-6715', 'SAME', 'pending'::public.order_status)
ON CONFLICT (order_number, type) DO UPDATE SET
  bin_size = EXCLUDED.bin_size,
  bin_type = EXCLUDED.bin_type,
  service_date = EXCLUDED.service_date,
  time_window = EXCLUDED.time_window,
  address = EXCLUDED.address,
  status = EXCLUDED.status,
  updated_at = now();

INSERT INTO public.orders (order_number, type, bin_size, bin_type, service_date, time_window, time_window_custom, address, customer_name, customer_phone, customer_notes, status) VALUES
  ('SOT13260', 'delivery'::public.order_type, '14'::public.bin_size, 'garbage'::public.bin_type, '2026-05-20'::date, 'custom'::public.time_window, 'Wed May 20 2026 12:00:00 GMT-0400 (Eastern Daylight Time)', '672 Yonge St, Toronto, ON M4Y 2A6', '672 Yonge St', 'Rooney 647-969-6715', 'LIVELOAD', 'done'::public.order_status)
ON CONFLICT (order_number, type) DO UPDATE SET
  bin_size = EXCLUDED.bin_size,
  bin_type = EXCLUDED.bin_type,
  service_date = EXCLUDED.service_date,
  time_window = EXCLUDED.time_window,
  address = EXCLUDED.address,
  status = EXCLUDED.status,
  updated_at = now();

INSERT INTO public.orders (order_number, type, bin_size, bin_type, service_date, time_window, time_window_custom, address, customer_name, customer_phone, customer_notes, status) VALUES
  ('SOT13259', 'delivery'::public.order_type, '14'::public.bin_size, 'garbage'::public.bin_type, '2026-05-20'::date, 'AM'::public.time_window, NULL, '205 Cranbrooke Ave, Toronto, ON M5M 1M8', '205 Cranbrooke Ave', 'Vincent 647-571-6132', 'SAME HINO', 'done'::public.order_status)
ON CONFLICT (order_number, type) DO UPDATE SET
  bin_size = EXCLUDED.bin_size,
  bin_type = EXCLUDED.bin_type,
  service_date = EXCLUDED.service_date,
  time_window = EXCLUDED.time_window,
  address = EXCLUDED.address,
  status = EXCLUDED.status,
  updated_at = now();

INSERT INTO public.orders (order_number, type, bin_size, bin_type, service_date, time_window, time_window_custom, address, customer_name, customer_phone, customer_notes, status) VALUES
  ('SOT13280', 'delivery'::public.order_type, '20'::public.bin_size, 'garbage'::public.bin_type, '2026-05-20'::date, 'PM'::public.time_window, NULL, '47 Fairmeadow Ave, North York, ON M2P 1W8', '47 Fairmeadow Ave', '647-877-8088', 'CONFIRM ON SITE', 'pending'::public.order_status)
ON CONFLICT (order_number, type) DO UPDATE SET
  bin_size = EXCLUDED.bin_size,
  bin_type = EXCLUDED.bin_type,
  service_date = EXCLUDED.service_date,
  time_window = EXCLUDED.time_window,
  address = EXCLUDED.address,
  status = EXCLUDED.status,
  updated_at = now();

INSERT INTO public.orders (order_number, type, bin_size, bin_type, service_date, time_window, time_window_custom, address, customer_name, customer_phone, customer_notes, status) VALUES
  ('SOT13158', 'delivery'::public.order_type, '20'::public.bin_size, 'garbage'::public.bin_type, '2026-05-20'::date, 'custom'::public.time_window, 'Wed May 20 2026 23:00:00 GMT-0400 (Eastern Daylight Time)', 'Scarborough Town Centre, 300 Borough Dr, Scarborough, ON M1P 4P5', 'Scarborough Town Centre', '416-878-3699', 'CONFIRM ON SITE, 5/21 7AM MUST PICKUP', 'pending'::public.order_status)
ON CONFLICT (order_number, type) DO UPDATE SET
  bin_size = EXCLUDED.bin_size,
  bin_type = EXCLUDED.bin_type,
  service_date = EXCLUDED.service_date,
  time_window = EXCLUDED.time_window,
  address = EXCLUDED.address,
  status = EXCLUDED.status,
  updated_at = now();

INSERT INTO public.orders (order_number, type, bin_size, bin_type, service_date, time_window, time_window_custom, address, customer_name, customer_phone, customer_notes, status) VALUES
  ('SOT12823', 'pickup'::public.order_type, '14'::public.bin_size, 'garbage'::public.bin_type, '2026-05-20'::date, 'AM'::public.time_window, NULL, '62 Buckhorn Ave, Richmond Hill, ON L4C 0G4', '62 Buckhorn Ave', 'Vincent 647-571-6132', '', 'done'::public.order_status)
ON CONFLICT (order_number, type) DO UPDATE SET
  bin_size = EXCLUDED.bin_size,
  bin_type = EXCLUDED.bin_type,
  service_date = EXCLUDED.service_date,
  time_window = EXCLUDED.time_window,
  address = EXCLUDED.address,
  status = EXCLUDED.status,
  updated_at = now();

INSERT INTO public.orders (order_number, type, bin_size, bin_type, service_date, time_window, time_window_custom, address, customer_name, customer_phone, customer_notes, status) VALUES
  ('SOT13144', 'pickup'::public.order_type, '20'::public.bin_size, 'garbage'::public.bin_type, '2026-05-20'::date, 'custom'::public.time_window, '5/20 can', '67 Jacob Keffer Pkwy, Vaughan, ON L4K 5N8', '67 Jacob Keffer Pkwy', '416-878-8877', '', 'done'::public.order_status)
ON CONFLICT (order_number, type) DO UPDATE SET
  bin_size = EXCLUDED.bin_size,
  bin_type = EXCLUDED.bin_type,
  service_date = EXCLUDED.service_date,
  time_window = EXCLUDED.time_window,
  address = EXCLUDED.address,
  status = EXCLUDED.status,
  updated_at = now();

INSERT INTO public.orders (order_number, type, bin_size, bin_type, service_date, time_window, time_window_custom, address, customer_name, customer_phone, customer_notes, status) VALUES
  ('D09712', 'pickup'::public.order_type, '14'::public.bin_size, 'soil'::public.bin_type, '2026-05-20'::date, 'custom'::public.time_window, '5/20 MUST', '195 Greenbrooke Dr, Woodbridge, ON L4H 4X4', '195 Greenbrooke Dr', '647-889-9637', '', 'pending'::public.order_status)
ON CONFLICT (order_number, type) DO UPDATE SET
  bin_size = EXCLUDED.bin_size,
  bin_type = EXCLUDED.bin_type,
  service_date = EXCLUDED.service_date,
  time_window = EXCLUDED.time_window,
  address = EXCLUDED.address,
  status = EXCLUDED.status,
  updated_at = now();

INSERT INTO public.orders (order_number, type, bin_size, bin_type, service_date, time_window, time_window_custom, address, customer_name, customer_phone, customer_notes, status) VALUES
  ('SOT13251', 'pickup'::public.order_type, '14'::public.bin_size, 'garbage'::public.bin_type, '2026-05-20'::date, 'custom'::public.time_window, '5/20 MUST', '108 Owen Blvd, North York, ON M2P 1G5', '108 Owen Blvd', '647-928-6998', '', 'pending'::public.order_status)
ON CONFLICT (order_number, type) DO UPDATE SET
  bin_size = EXCLUDED.bin_size,
  bin_type = EXCLUDED.bin_type,
  service_date = EXCLUDED.service_date,
  time_window = EXCLUDED.time_window,
  address = EXCLUDED.address,
  status = EXCLUDED.status,
  updated_at = now();

INSERT INTO public.orders (order_number, type, bin_size, bin_type, service_date, time_window, time_window_custom, address, customer_name, customer_phone, customer_notes, status) VALUES
  ('SOT13258', 'pickup'::public.order_type, '14'::public.bin_size, 'garbage'::public.bin_type, '2026-05-20'::date, 'PM'::public.time_window, NULL, '26 The Shire Ln, Markham, ON L6B 0N2', '26 The Shire Ln', 'Andy 647-469-6887', '', 'pending'::public.order_status)
ON CONFLICT (order_number, type) DO UPDATE SET
  bin_size = EXCLUDED.bin_size,
  bin_type = EXCLUDED.bin_type,
  service_date = EXCLUDED.service_date,
  time_window = EXCLUDED.time_window,
  address = EXCLUDED.address,
  status = EXCLUDED.status,
  updated_at = now();

INSERT INTO public.orders (order_number, type, bin_size, bin_type, service_date, time_window, time_window_custom, address, customer_name, customer_phone, customer_notes, status) VALUES
  ('SOT13156', 'pickup'::public.order_type, '20'::public.bin_size, 'garbage'::public.bin_type, '2026-05-20'::date, 'PM'::public.time_window, NULL, '74 Montrave Ave, Oshawa, ON L1J 4R7', '74 Montrave Ave', '647-300-2376', '', 'done'::public.order_status)
ON CONFLICT (order_number, type) DO UPDATE SET
  bin_size = EXCLUDED.bin_size,
  bin_type = EXCLUDED.bin_type,
  service_date = EXCLUDED.service_date,
  time_window = EXCLUDED.time_window,
  address = EXCLUDED.address,
  status = EXCLUDED.status,
  updated_at = now();

INSERT INTO public.orders (order_number, type, bin_size, bin_type, service_date, time_window, time_window_custom, address, customer_name, customer_phone, customer_notes, status) VALUES
  ('SOT13055', 'pickup'::public.order_type, '20'::public.bin_size, 'garbage'::public.bin_type, '2026-05-20'::date, 'AM'::public.time_window, NULL, '2 Meyer Cir, Markham, ON L3P 4C2', '2 Meyer Cir', '647-232-5934 / 416-931-8012', 'HINO', 'done'::public.order_status)
ON CONFLICT (order_number, type) DO UPDATE SET
  bin_size = EXCLUDED.bin_size,
  bin_type = EXCLUDED.bin_type,
  service_date = EXCLUDED.service_date,
  time_window = EXCLUDED.time_window,
  address = EXCLUDED.address,
  status = EXCLUDED.status,
  updated_at = now();

INSERT INTO public.orders (order_number, type, bin_size, bin_type, service_date, time_window, time_window_custom, address, customer_name, customer_phone, customer_notes, status) VALUES
  ('SOT12719', 'pickup'::public.order_type, '20'::public.bin_size, 'garbage'::public.bin_type, '2026-05-20'::date, 'custom'::public.time_window, '', '26 Orlon Crescent, Richmond Hill, ON L4C 6S5', '26 Orlon Crescent', '647-355-3777', '', 'done'::public.order_status)
ON CONFLICT (order_number, type) DO UPDATE SET
  bin_size = EXCLUDED.bin_size,
  bin_type = EXCLUDED.bin_type,
  service_date = EXCLUDED.service_date,
  time_window = EXCLUDED.time_window,
  address = EXCLUDED.address,
  status = EXCLUDED.status,
  updated_at = now();

INSERT INTO public.orders (order_number, type, bin_size, bin_type, service_date, time_window, time_window_custom, address, customer_name, customer_phone, customer_notes, status) VALUES
  ('SOT13260', 'pickup'::public.order_type, '14'::public.bin_size, 'garbage'::public.bin_type, '2026-05-20'::date, 'custom'::public.time_window, '', '672 Yonge St, Toronto, ON M4Y 2A6', '672 Yonge St', 'Rooney 647-969-6715', 'LIVELOAD', 'done'::public.order_status)
ON CONFLICT (order_number, type) DO UPDATE SET
  bin_size = EXCLUDED.bin_size,
  bin_type = EXCLUDED.bin_type,
  service_date = EXCLUDED.service_date,
  time_window = EXCLUDED.time_window,
  address = EXCLUDED.address,
  status = EXCLUDED.status,
  updated_at = now();

INSERT INTO public.orders (order_number, type, bin_size, bin_type, service_date, time_window, time_window_custom, address, customer_name, customer_phone, customer_notes, status) VALUES
  ('SOT13026', 'pickup'::public.order_type, '14'::public.bin_size, 'garbage'::public.bin_type, '2026-05-20'::date, 'custom'::public.time_window, '', '205 Cranbrooke Ave, Toronto, ON M5M 1M8', '205 Cranbrooke Ave', 'Vincent 647-571-6132', '', 'done'::public.order_status)
ON CONFLICT (order_number, type) DO UPDATE SET
  bin_size = EXCLUDED.bin_size,
  bin_type = EXCLUDED.bin_type,
  service_date = EXCLUDED.service_date,
  time_window = EXCLUDED.time_window,
  address = EXCLUDED.address,
  status = EXCLUDED.status,
  updated_at = now();

INSERT INTO public.orders (order_number, type, bin_size, bin_type, service_date, time_window, time_window_custom, address, customer_name, customer_phone, customer_notes, status) VALUES
  ('SOT12580', 'pickup'::public.order_type, '20'::public.bin_size, 'garbage'::public.bin_type, '2026-05-20'::date, 'custom'::public.time_window, '5/20 can', '6 Montesano Crescent, Richmond Hill, ON L4B 4M9', '6 Montesano Crescent', '416-722-3812', '', 'pending'::public.order_status)
ON CONFLICT (order_number, type) DO UPDATE SET
  bin_size = EXCLUDED.bin_size,
  bin_type = EXCLUDED.bin_type,
  service_date = EXCLUDED.service_date,
  time_window = EXCLUDED.time_window,
  address = EXCLUDED.address,
  status = EXCLUDED.status,
  updated_at = now();

INSERT INTO public.orders (order_number, type, bin_size, bin_type, service_date, time_window, time_window_custom, address, customer_name, customer_phone, customer_notes, status) VALUES
  ('SOT13083', 'pickup'::public.order_type, '20'::public.bin_size, 'garbage'::public.bin_type, '2026-05-20'::date, 'custom'::public.time_window, '5/20 CAN', '1605 Venetia Dr, Oakville, ON L6L 1K8', '1605 Venetia Dr', '416-835-9696', '', 'pending'::public.order_status)
ON CONFLICT (order_number, type) DO UPDATE SET
  bin_size = EXCLUDED.bin_size,
  bin_type = EXCLUDED.bin_type,
  service_date = EXCLUDED.service_date,
  time_window = EXCLUDED.time_window,
  address = EXCLUDED.address,
  status = EXCLUDED.status,
  updated_at = now();

INSERT INTO public.orders (order_number, type, bin_size, bin_type, service_date, time_window, time_window_custom, address, customer_name, customer_phone, customer_notes, status) VALUES
  ('SOT13057', 'pickup'::public.order_type, '14'::public.bin_size, 'garbage'::public.bin_type, '2026-05-20'::date, 'custom'::public.time_window, '', '32 Lake Shore Dr, Etobicoke, ON M8V 1Z4', '32 Lake Shore Dr', '416-301-9889', '', 'done'::public.order_status)
ON CONFLICT (order_number, type) DO UPDATE SET
  bin_size = EXCLUDED.bin_size,
  bin_type = EXCLUDED.bin_type,
  service_date = EXCLUDED.service_date,
  time_window = EXCLUDED.time_window,
  address = EXCLUDED.address,
  status = EXCLUDED.status,
  updated_at = now();

INSERT INTO public.orders (order_number, type, bin_size, bin_type, service_date, time_window, time_window_custom, address, customer_name, customer_phone, customer_notes, status) VALUES
  ('SOT13256', 'pickup'::public.order_type, '40'::public.bin_size, 'garbage'::public.bin_type, '2026-05-20'::date, 'custom'::public.time_window, '', '1550 16th Ave, Richmond Hill, ON L4B 3K9', '1550 16th Ave', '416-887-0018', '', 'done'::public.order_status)
ON CONFLICT (order_number, type) DO UPDATE SET
  bin_size = EXCLUDED.bin_size,
  bin_type = EXCLUDED.bin_type,
  service_date = EXCLUDED.service_date,
  time_window = EXCLUDED.time_window,
  address = EXCLUDED.address,
  status = EXCLUDED.status,
  updated_at = now();

INSERT INTO public.orders (order_number, type, bin_size, bin_type, service_date, time_window, time_window_custom, address, customer_name, customer_phone, customer_notes, status) VALUES
  ('SOT12899', 'pickup'::public.order_type, '20'::public.bin_size, 'garbage'::public.bin_type, '2026-05-20'::date, 'custom'::public.time_window, '', '1443 Denison St, Markham, ON L3R 5V2', '1443 Denison St', '416-939-7882 / 647-963-3999', '', 'done'::public.order_status)
ON CONFLICT (order_number, type) DO UPDATE SET
  bin_size = EXCLUDED.bin_size,
  bin_type = EXCLUDED.bin_type,
  service_date = EXCLUDED.service_date,
  time_window = EXCLUDED.time_window,
  address = EXCLUDED.address,
  status = EXCLUDED.status,
  updated_at = now();

INSERT INTO public.orders (order_number, type, bin_size, bin_type, service_date, time_window, time_window_custom, address, customer_name, customer_phone, customer_notes, status) VALUES
  ('D09678', 'pickup'::public.order_type, '14'::public.bin_size, 'brick'::public.bin_type, '2026-05-20'::date, 'custom'::public.time_window, '', '64 Melford Dr, Scarborough, ON M1B 2G1', '64 Melford Dr', '647-267-1828', '', 'pending'::public.order_status)
ON CONFLICT (order_number, type) DO UPDATE SET
  bin_size = EXCLUDED.bin_size,
  bin_type = EXCLUDED.bin_type,
  service_date = EXCLUDED.service_date,
  time_window = EXCLUDED.time_window,
  address = EXCLUDED.address,
  status = EXCLUDED.status,
  updated_at = now();

INSERT INTO public.orders (order_number, type, bin_size, bin_type, service_date, time_window, time_window_custom, address, customer_name, customer_phone, customer_notes, status) VALUES
  ('SOT12543', 'pickup'::public.order_type, '20'::public.bin_size, 'garbage'::public.bin_type, '2026-05-20'::date, 'custom'::public.time_window, '', '66 Rancliffe Rd, Oakville, ON L6H 1B2', '66 Rancliffe Rd', 'Rooney 647-969-6715', '', 'done'::public.order_status)
ON CONFLICT (order_number, type) DO UPDATE SET
  bin_size = EXCLUDED.bin_size,
  bin_type = EXCLUDED.bin_type,
  service_date = EXCLUDED.service_date,
  time_window = EXCLUDED.time_window,
  address = EXCLUDED.address,
  status = EXCLUDED.status,
  updated_at = now();

INSERT INTO public.orders (order_number, type, bin_size, bin_type, service_date, time_window, time_window_custom, address, customer_name, customer_phone, customer_notes, status) VALUES
  ('SOT12689', 'pickup'::public.order_type, '20'::public.bin_size, 'garbage'::public.bin_type, '2026-05-20'::date, 'custom'::public.time_window, '', '32 Ashwarren Rd, North York, ON M3J 1Z7', '32 Ashwarren Rd', '647-612-0157 / 647-325-7797', '', 'done'::public.order_status)
ON CONFLICT (order_number, type) DO UPDATE SET
  bin_size = EXCLUDED.bin_size,
  bin_type = EXCLUDED.bin_type,
  service_date = EXCLUDED.service_date,
  time_window = EXCLUDED.time_window,
  address = EXCLUDED.address,
  status = EXCLUDED.status,
  updated_at = now();

INSERT INTO public.orders (order_number, type, bin_size, bin_type, service_date, time_window, time_window_custom, address, customer_name, customer_phone, customer_notes, status) VALUES
  ('SOT12566', 'pickup'::public.order_type, '20'::public.bin_size, 'garbage'::public.bin_type, '2026-05-20'::date, 'custom'::public.time_window, '', '17 Silk Ct, Richmond Hill, ON L4B 4A4', '17 Silk Ct', 'Rooney 647-969-6715', '', 'pending'::public.order_status)
ON CONFLICT (order_number, type) DO UPDATE SET
  bin_size = EXCLUDED.bin_size,
  bin_type = EXCLUDED.bin_type,
  service_date = EXCLUDED.service_date,
  time_window = EXCLUDED.time_window,
  address = EXCLUDED.address,
  status = EXCLUDED.status,
  updated_at = now();

INSERT INTO public.orders (order_number, type, bin_size, bin_type, service_date, time_window, time_window_custom, address, customer_name, customer_phone, customer_notes, status) VALUES
  ('SOT13279', 'pickup'::public.order_type, '40'::public.bin_size, 'garbage'::public.bin_type, '2026-05-20'::date, 'custom'::public.time_window, '', '3828 Hwy 7, Unionville, ON L3R 0B5', '3828 Hwy 7', '647-997-3777', '', 'pending'::public.order_status)
ON CONFLICT (order_number, type) DO UPDATE SET
  bin_size = EXCLUDED.bin_size,
  bin_type = EXCLUDED.bin_type,
  service_date = EXCLUDED.service_date,
  time_window = EXCLUDED.time_window,
  address = EXCLUDED.address,
  status = EXCLUDED.status,
  updated_at = now();

-- Complete existing delivery orders when a pickup is synced
UPDATE public.orders SET status = 'done', updated_at = now() WHERE order_number = 'SOT12823' AND type = 'delivery';
UPDATE public.orders SET status = 'done', updated_at = now() WHERE order_number = 'SOT13144' AND type = 'delivery';
UPDATE public.orders SET status = 'done', updated_at = now() WHERE order_number = 'SOT13156' AND type = 'delivery';
UPDATE public.orders SET status = 'done', updated_at = now() WHERE order_number = 'SOT13055' AND type = 'delivery';
UPDATE public.orders SET status = 'done', updated_at = now() WHERE order_number = 'SOT12719' AND type = 'delivery';
UPDATE public.orders SET status = 'done', updated_at = now() WHERE order_number = 'SOT13260' AND type = 'delivery';
UPDATE public.orders SET status = 'done', updated_at = now() WHERE order_number = 'SOT13026' AND type = 'delivery';
UPDATE public.orders SET status = 'done', updated_at = now() WHERE order_number = 'SOT13057' AND type = 'delivery';
UPDATE public.orders SET status = 'done', updated_at = now() WHERE order_number = 'SOT13256' AND type = 'delivery';
UPDATE public.orders SET status = 'done', updated_at = now() WHERE order_number = 'SOT12899' AND type = 'delivery';
UPDATE public.orders SET status = 'done', updated_at = now() WHERE order_number = 'SOT12543' AND type = 'delivery';
UPDATE public.orders SET status = 'done', updated_at = now() WHERE order_number = 'SOT12689' AND type = 'delivery';

COMMIT;
