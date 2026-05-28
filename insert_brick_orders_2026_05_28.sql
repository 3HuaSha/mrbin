-- Brick dispatch test/import orders for 2026-05-28.
-- Run the whole file in Supabase SQL Editor.

DELETE FROM public.orders
WHERE service_date = DATE '2026-05-28'
  AND business_type = 'brick'
  AND order_number IN (
    'SOB109485',
    'SOA01710',
    'SOB109514',
    'SOB109758',
    'SOB109811',
    'SOA01925',
    'SOA01921+SOA01926',
    'SOB109815',
    'SOB109334+SOB104839',
    'SOA01885',
    'SOA01852+SOA01853',
    'SOB109751',
    'SOM03684',
    'SOM03681+SOM03713',
    'SOM03705',
    'SOM03720+SOM03721',
    'SOB109838',
    'SOB109555',
    'SOB109554',
    'SN1390864',
    '3021890183',
    '3021890121'
  );

INSERT INTO public.company_yards (
  name,
  address,
  latitude,
  longitude,
  max_capacity,
  current_inventory,
  is_active
)
SELECT *
FROM (
  VALUES
    ('12441 Woodbine Yard', '12441 Woodbine Ave, Gormley, ON L4A 2K4', 43.948446::numeric, -79.374072::numeric, 1000, 500, true),
    ('3445 Kennedy Yard', '3445 Kennedy Rd, Scarborough, ON M1V 4Y3', 43.821044::numeric, -79.304742::numeric, 1000, 500, true),
    ('2967 Kennedy Yard', '2967 Kennedy Rd, Scarborough, ON M1V 1S9', 43.775600::numeric, -79.262100::numeric, 1000, 500, true),
    ('150 Clark Yard', '150 Clark Blvd, Brampton, ON L6T 4Y8', 43.701500::numeric, -79.724000::numeric, 1000, 500, true)
) AS seed(name, address, latitude, longitude, max_capacity, current_inventory, is_active)
WHERE NOT EXISTS (
  SELECT 1 FROM public.company_yards cy WHERE cy.name = seed.name
);

INSERT INTO public.brick_factories (
  name,
  address,
  latitude,
  longitude,
  is_active
)
SELECT *
FROM (
  VALUES
    ('UNILOCK GORMLEY', '12350 Woodbine Ave, Gormley, ON L0H 1G0', 43.946900::numeric, -79.374900::numeric, true),
    ('UNILOCK (GORMLEY)', '12350 Woodbine Ave, Gormley, ON L0H 1G0', 43.946900::numeric, -79.374900::numeric, true),
    ('PERMACON (MILTON)', '8375 5 Side Rd, Milton, ON L9T 2X7', 43.531900::numeric, -79.923700::numeric, true)
) AS seed(name, address, latitude, longitude, is_active)
WHERE NOT EXISTS (
  SELECT 1 FROM public.brick_factories bf WHERE bf.name = seed.name
);

WITH raw_orders (
  time_text,
  ref_text,
  schedule_group,
  stop_sequence,
  pallet_count,
  pickup_text,
  direction_text,
  trip_time_text,
  delivery_address,
  brick_order_type,
  origin_yard_name,
  origin_factory_name,
  destination_yard_name,
  priority
) AS (
  VALUES
    ('05/27/2026 9-11AM', 'SOB109485', 1, 1, 7, '12441', 'N', '0', '2129 Gerrard St E, Toronto, ON M4E 2C1', 'delivery_to_customer', '12441 Woodbine Yard', NULL, NULL, 'P2'),
    ('5/27 NOON', 'SOA01710', 1, 2, 6, '12441', 'N', '0', '22 Amberley Dr, Scarborough, ON M1R 4K3', 'delivery_to_customer', '12441 Woodbine Yard', NULL, NULL, 'P2'),
    ('5/27 PM', 'SOB109514', 1, 3, 2, '12441', 'N', '0', '21 Samuel Teitel Ct, Scarborough, ON M1X 1S7', 'delivery_to_customer', '12441 Woodbine Yard', NULL, NULL, 'P3'),
    ('5/27 11-2PM MUST', 'SOB109758 wood', 2, 1, 6, '3445', 'C', '0', '282 Erskine Ave, Toronto, ON M4P 1Z4', 'delivery_to_customer', '3445 Kennedy Yard', NULL, NULL, 'P1'),
    ('5/27 2-6PM', 'SOB109811', 2, 3, 10, '3445', 'C', '0', '609 Carlton Rd, Unionville, ON L3P 7R6', 'delivery_to_customer', '3445 Kennedy Yard', NULL, NULL, 'P2'),
    ('5/27 5-7PM', 'SOA01925', 3, 1, 6, '2967', 'C', '4', '16 Gamble St, Woodbridge, ON L4L 1R3', 'delivery_to_customer', '2967 Kennedy Yard', NULL, NULL, 'P2'),
    ('5/27 5-7PM', 'SOA01921+SOA01926', 3, 2, 7, '12441', 'N', '26', '16 Gamble St, Woodbridge, ON L4L 1R3', 'delivery_to_customer', '12441 Woodbine Yard', NULL, NULL, 'P2'),
    ('5/27 5-7PM', 'SOB109815', 3, 3, 15, '12441', 'N', '26', '35 Brentcliff Dr, Brampton, ON L7A 3E7', 'delivery_to_customer', '12441 Woodbine Yard', NULL, NULL, 'P2'),
    ('5/27 ANYTIME', 'SOB109334+SOB104839', 4, 1, 24, '12441', 'N', '26', '13969 Kennedy Rd, Whitchurch-Stouffville, ON L4A 4B4', 'delivery_to_customer', '12441 Woodbine Yard', NULL, NULL, 'P4'),
    ('05-27 noon-ish', 'SOA01885', 1, 1, 5, '2967', 'C', '30', '31 Clover St, Markham, ON L6E 1L6', 'delivery_to_customer', '2967 Kennedy Yard', NULL, NULL, 'P2'),
    ('5/26 OR 5/27 EARLY AM', 'SOA01852+SOA01853', 1, 2, 9, '12441', 'N', '0', '38 Westwind Cres, Whitchurch-Stouffville, ON L4A 0C3', 'delivery_to_customer', '12441 Woodbine Yard', NULL, NULL, 'P2'),
    ('5/27 AM', 'SOB109751', 1, 3, 7, '12441', 'N', '0', '51 Drury St, Bradford, ON L3Z 1W9', 'delivery_to_customer', '12441 Woodbine Yard', NULL, NULL, 'P3'),
    ('5/27 BEFORE 2', 'SOM03684', 2, 1, 7, '150', 'W', NULL, '46 Camino Real Dr, Caledon, ON L7C 4L9', 'delivery_to_customer', '150 Clark Yard', NULL, NULL, 'P2'),
    ('5/27 ANYTIME', 'SOM03681+SOM03713', 2, 2, 11, '150', 'W', '68', '3394 Fox Run Cir, Oakville, ON L6L 6W4', 'delivery_to_customer', '150 Clark Yard', NULL, NULL, 'P4'),
    ('5/27 ANYTIME', 'SOM03705', 2, 3, 1, '3445', 'C', '0', '3394 Fox Run Cir, Oakville, ON L6L 6W4', 'delivery_to_customer', '3445 Kennedy Yard', NULL, NULL, 'P4'),
    (NULL, 'SOM03720+SOM03721', 2, 4, 6, '150', 'W', '68', '1538 Kovachik Blvd, Milton, ON L9E 1T4', 'delivery_to_customer', '150 Clark Yard', NULL, NULL, 'P4'),
    ('5/27', 'SOB109838', 6, 1, 27, '12441', 'N', '26', '7 Bruce Ave, Keswick, ON L4P 1K4', 'delivery_to_customer', '12441 Woodbine Yard', NULL, NULL, 'P4'),
    ('5/27', 'SOB109555', 1, 1, 12, '12441', 'N', '0', '71 Zokol Crescent, Kanata, ON K2K 2K3', 'delivery_to_customer', '12441 Woodbine Yard', NULL, NULL, 'P4'),
    ('5/27', 'SOB109554', 1, 2, 12, '12441', 'N', '0', '113 Gosling Cres, Ottawa, ON K2W 0K6', 'delivery_to_customer', '12441 Woodbine Yard', NULL, NULL, 'P4'),
    (NULL, 'SN1390864', 2, 1, 26, 'UNILOCK (GORMLEY)', 'N', '20', '12441', 'pickup_from_factory', NULL, 'UNILOCK (GORMLEY)', '12441 Woodbine Yard', 'P4'),
    (NULL, '3021890183', 3, 1, 5, 'PERMACON (MILTON)', 'W', '55', '2967', 'pickup_from_factory', NULL, 'PERMACON (MILTON)', '2967 Kennedy Yard', 'P4'),
    (NULL, '3021890121', 3, 2, 20, 'PERMACON (MILTON)', 'W', '55', '2967', 'pickup_from_factory', NULL, 'PERMACON (MILTON)', '2967 Kennedy Yard', 'P4')
)
INSERT INTO public.orders (
  order_number,
  type,
  bin_size,
  service_date,
  time_window,
  time_window_custom,
  address,
  customer_name,
  customer_phone,
  customer_notes,
  status,
  netsuite_order_id,
  business_type,
  brick_order_type,
  origin_factory_id,
  origin_yard_id,
  destination_yard_id,
  pallet_count,
  can_split,
  priority,
  bin_type
)
SELECT
  regexp_replace(split_part(o.ref_text, ' ', 1), '^#', ''),
  'delivery'::public.order_type,
  NULL,
  DATE '2026-05-28',
  'custom'::public.time_window,
  CASE
    WHEN o.time_text ILIKE '%9-11%' THEN '9-11AM'
    WHEN o.time_text ILIKE '%11-2%' THEN '11-2PM MUST'
    WHEN o.time_text ILIKE '%2-6%' THEN '2-6PM'
    WHEN o.time_text ILIKE '%5-7%' THEN '5-7PM'
    WHEN o.time_text ILIKE '%BEFORE 2%' THEN 'BEFORE 2'
    WHEN o.time_text ILIKE '%NOON%' OR o.time_text ILIKE '%noon-ish%' THEN 'NOON'
    WHEN o.time_text ILIKE '%EARLY AM%' THEN 'EARLY AM'
    WHEN o.time_text ILIKE '%AM%' THEN 'AM'
    WHEN o.time_text ILIKE '%PM%' THEN 'PM'
    WHEN o.time_text IS NULL THEN 'anytime'
    ELSE o.time_text
  END,
  o.delivery_address,
  regexp_replace(split_part(o.ref_text, ' ', 1), '^#', ''),
  '',
  concat_ws(
    ' | ',
    'ref ' || o.ref_text,
    CASE WHEN o.time_text IS NOT NULL THEN 'time ' || o.time_text END,
    'pickup ' || o.pickup_text,
    'dir ' || o.direction_text,
    CASE WHEN o.trip_time_text IS NOT NULL THEN 'trip ' || o.trip_time_text END,
    'group ' || o.schedule_group,
    'seq ' || o.stop_sequence
  ),
  'pending'::public.order_status,
  o.ref_text,
  'brick'::public.business_type,
  o.brick_order_type::public.brick_order_type,
  origin_factory.id,
  origin_yard.id,
  destination_yard.id,
  o.pallet_count,
  false,
  o.priority,
  'brick'
FROM raw_orders o
LEFT JOIN public.company_yards origin_yard ON origin_yard.name = o.origin_yard_name
LEFT JOIN public.company_yards destination_yard ON destination_yard.name = o.destination_yard_name
LEFT JOIN public.brick_factories origin_factory ON origin_factory.name = o.origin_factory_name;
