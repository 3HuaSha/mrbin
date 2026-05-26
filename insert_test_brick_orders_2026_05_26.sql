-- Test brick orders for dispatch assistant.
-- Run this in Supabase SQL Editor.
--
-- Important:
-- - The real order number is the first column, e.g. SOT12970.
-- - Middle values such as SOB107955, POB03197, SN1389607 are saved as notes/refs.
-- - Orders are inserted for 2026-05-26 so they show on today's dispatch page.
-- - This script deletes and recreates only these SOT test orders.

DELETE FROM public.orders
WHERE order_number IN (
  'SOT12970',
  'SOT12971',
  'SOT12972',
  'SOT12973',
  'SOT12974',
  'SOT12975',
  'SOT12976',
  'SOT12977',
  'SOT12978',
  'SOT12980',
  'SOT12993',
  'SOT12994',
  'SOT12995',
  'SOT12996',
  'SOT12997',
  'SOT12998'
);

WITH yards(seed_name, seed_address, seed_lat, seed_lng) AS (
  VALUES
    ('3445 Kennedy Yard', '3445 Kennedy Rd, Scarborough, ON M1V 4Y3', 43.821044, -79.304742),
    ('12441 Woodbine Yard', '12441 Woodbine Ave, Gormley, ON L4A 2K4', 43.948446, -79.374072),
    ('2967 Kennedy Yard', '2967 Kennedy Rd, Scarborough, ON M1V 1S9', 43.775600, -79.262100),
    ('150 Clark Yard', '150 Clark Blvd, Brampton, ON L6T 4Y8', 43.701500, -79.724000),
    ('189 Yard', '189 Select Ave, Scarborough, ON M1V 5J3', 43.819900, -79.293500)
),
factories(seed_name, seed_address, seed_lat, seed_lng) AS (
  VALUES
    ('TRIPLE H (PUTNAM)', '596728 Highway 59, Putnam, ON N0L 2B0', 42.987900, -80.998600),
    ('UNILOCK (PICKERING)', '1019 Toy Ave, Pickering, ON L1W 3N9', 43.831900, -79.066800),
    ('BW (WOODBRIDGE)', '75 Haist Ave, Woodbridge, ON L4L 5V5', 43.789300, -79.604900),
    ('UNILOCK (GEORGETOWN)', '287 Armstrong Ave, Georgetown, ON L7G 4X6', 43.645800, -79.906200)
),
insert_yards AS (
  INSERT INTO public.company_yards (
    name,
    address,
    latitude,
    longitude,
    max_capacity,
    current_inventory,
    is_active
  )
  SELECT
    seed_name,
    seed_address,
    seed_lat,
    seed_lng,
    1000,
    500,
    true
  FROM yards
  WHERE NOT EXISTS (
    SELECT 1 FROM public.company_yards cy WHERE cy.name = yards.seed_name
  )
  RETURNING id, name
),
yard_lookup AS (
  SELECT id, name FROM insert_yards
  UNION ALL
  SELECT id, name
  FROM public.company_yards
  WHERE name IN (
    '3445 Kennedy Yard',
    '12441 Woodbine Yard',
    '2967 Kennedy Yard',
    '150 Clark Yard',
    '189 Yard'
  )
),
insert_factories AS (
  INSERT INTO public.brick_factories (
    name,
    address,
    latitude,
    longitude,
    is_active
  )
  SELECT
    seed_name,
    seed_address,
    seed_lat,
    seed_lng,
    true
  FROM factories
  WHERE NOT EXISTS (
    SELECT 1 FROM public.brick_factories bf WHERE bf.name = factories.seed_name
  )
  RETURNING id, name
),
factory_lookup AS (
  SELECT id, name FROM insert_factories
  UNION ALL
  SELECT id, name
  FROM public.brick_factories
  WHERE name IN (
    'TRIPLE H (PUTNAM)',
    'UNILOCK (PICKERING)',
    'BW (WOODBRIDGE)',
    'UNILOCK (GEORGETOWN)'
  )
),
test_orders (
  order_number,
  freight,
  driver_name,
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
  origin_factory_name,
  origin_yard_name,
  destination_yard_name,
  priority
) AS (
  VALUES
    ('SOT12970', '$235.00', 'Nick', '5/8 AM', 'SOB107955', 1, 1, 9, '12441', 'N', '-', '55 Gailcrest Cir, Thornhill, ON L4J 5V5', 'delivery_to_customer', NULL, '12441 Woodbine Yard', NULL, 'P3'),
    ('SOT12971', '$335.00', 'Nick', '5/8 AM', 'SOB107760', 1, 2, 2, '12441', 'N', '-', '507 Stone St, Oshawa, ON L1J 1A4', 'delivery_to_customer', NULL, '12441 Woodbine Yard', NULL, 'P3'),
    ('SOT12972', '$385.00', 'Nick', '5/8 AM', 'SOV02039', 1, 3, 1, '189', 'C', '29 min', '344 Gothic Ct, Oshawa, ON L1G 7J2', 'delivery_to_customer', NULL, '189 Yard', NULL, 'P3'),
    ('SOT12973', '$335.00', 'Nick', '5/8 PM', 'SOB108013', 3, 1, 11, '2967', 'C', '4 min', '19 Hawkstone Crescent, Whitby, ON L1N 6N2', 'delivery_to_customer', NULL, '2967 Kennedy Yard', NULL, 'P3'),
    ('SOT12974', '$235.00', '刀', '5/8 BEFORE NOON', 'SOA00921+SOB00924', 1, 1, 16, '12441', 'N', '-', '24 Mocha Crescent, Richmond Hill, ON L4S2R1', 'delivery_to_customer', NULL, '12441 Woodbine Yard', NULL, 'P2'),
    ('SOT12975', '$235.00', '刀', '5/8 BEFORE NOON', 'SOA00919+SOA00920', 1, 2, 6, '12441', 'N', '-', '112 Barberry Crescent, Richmond Hill, ON L4E4S5', 'delivery_to_customer', NULL, '12441 Woodbine Yard', NULL, 'P2'),
    ('SOT12976', '$335.00', '老李', '5/8 12-2PM', 'SOB107970', 1, 1, 9, '3445', 'C', '26 min', '3967 Nightshade Lane, Mississauga, ON, Canada', 'delivery_to_customer', NULL, '3445 Kennedy Yard', NULL, 'P2'),
    ('SOT12977', '$285.00', '老李', '5/8 AM', 'SOM03360', 1, 2, 13, '150', 'W', '80 min', '3623 E Park Ct, Mississauga, ON L5L 4V5', 'delivery_to_customer', NULL, '150 Clark Yard', NULL, 'P3'),
    ('SOT12978', '$285.00', '老李', '5/8 AM', 'SOB107875 (取送)', 2, 1, 17, '3445+GEORGETOWN', 'W', '90 min', '153 Kenollie Avenue, Mississauga, ON, Canada', 'delivery_to_customer', NULL, '3445 Kennedy Yard', NULL, 'P3'),

    ('SOT12980', '$1,090.00', 'MOHAMAD', NULL, 'POB03197 51plt Mixed (Highthorn)', 1, 1, 51, 'TRIPLE H (PUTNAM)', 'W', '190 min', '2967', 'pickup_from_factory', 'TRIPLE H (PUTNAM)', NULL, '2967 Kennedy Yard', 'P4'),
    ('SOT12993', '$1,190.00', 'MOHAMAD', NULL, 'POB03196 37plt Mixed (Covington&Highthorn)', 2, 1, 37, 'TRIPLE H (PUTNAM)', 'W', '146 min', '12441', 'pickup_from_factory', 'TRIPLE H (PUTNAM)', NULL, '12441 Woodbine Yard', 'P4'),
    ('SOT12994', '$100.00', 'Nick', NULL, 'SN1389607 2 bottles Binding Agent', 2, 1, NULL, 'UNILOCK (PICKERING)', 'E', '30 min', '3445', 'pickup_from_factory', 'UNILOCK (PICKERING)', NULL, '3445 Kennedy Yard', 'P4'),
    ('SOT12995', '$200.00', 'Nick', NULL, 'SN1389610 19plt UmbCop+UrbanCopIB', 2, 2, 19, 'UNILOCK (PICKERING)', 'E', '30 min', '3445', 'pickup_from_factory', 'UNILOCK (PICKERING)', NULL, '3445 Kennedy Yard', 'P4'),
    ('SOT12996', '$350.00', '刀', NULL, 'OR00799970 30plt Mixed-AR/GL/CAM/PW', 2, 1, 30, 'BW (WOODBRIDGE)', 'W', '34 min', '3445', 'pickup_from_factory', 'BW (WOODBRIDGE)', NULL, '3445 Kennedy Yard', 'P4'),
    ('SOT12997', '$300.00', '老李', NULL, 'SN1389842 3plt Skyline24x24-Light Grey', 2, 2, 3, 'UNILOCK (GEORGETOWN)', 'W', '53 min', '153 Kenollie Avenue, Mississauga, ON, Canada', 'factory_to_customer', 'UNILOCK (GEORGETOWN)', NULL, NULL, 'P4'),
    ('SOT12998', '$150.00', '老李', NULL, 'SN1389904 1plt Skyline24x24-Light Grey', 2, 3, 1, 'UNILOCK (GEORGETOWN)', 'W', '53 min', '3445', 'pickup_from_factory', 'UNILOCK (GEORGETOWN)', NULL, '3445 Kennedy Yard', 'P4')
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
  t.order_number,
  'delivery'::public.order_type,
  NULL,
  DATE '2026-05-26',
  'custom'::public.time_window,
  CASE
    WHEN t.time_text ILIKE '%12-2PM%' THEN '12-2PM'
    WHEN t.time_text ILIKE '%BEFORE NOON%' THEN 'BEFORE NOON'
    WHEN t.time_text ILIKE '%PM%' THEN '12-5PM'
    WHEN t.time_text ILIKE '%AM%' THEN '8-12'
    ELSE 'anytime'
  END,
  t.delivery_address,
  t.order_number,
  '',
  concat_ws(
    ' | ',
    'ref ' || t.ref_text,
    'freight ' || t.freight,
    'driver ' || t.driver_name,
    'pickup ' || t.pickup_text,
    'dir ' || t.direction_text,
    'trip ' || t.trip_time_text,
    'group ' || t.schedule_group,
    'seq ' || t.stop_sequence
  ),
  'pending'::public.order_status,
  t.ref_text,
  'brick'::public.business_type,
  t.brick_order_type::public.brick_order_type,
  origin_factory.id,
  origin_yard.id,
  destination_yard.id,
  t.pallet_count,
  true,
  t.priority,
  'brick'
FROM test_orders t
LEFT JOIN factory_lookup origin_factory ON origin_factory.name = t.origin_factory_name
LEFT JOIN yard_lookup origin_yard ON origin_yard.name = t.origin_yard_name
LEFT JOIN yard_lookup destination_yard ON destination_yard.name = t.destination_yard_name;
