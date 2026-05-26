-- Test brick orders for dispatch assistant.
-- Run this in Supabase SQL Editor. Orders are created for 2026-05-26.
-- They are intentionally left unassigned so they appear in the dispatch backlog.
-- This script deletes and recreates only the test order numbers below, so it
-- does not depend on a unique constraint for ON CONFLICT.

DELETE FROM public.orders
WHERE type = 'delivery'::public.order_type
  AND order_number IN (
    'SOB107955',
    'SOB107760',
    'SOV02039',
    'SOB108013',
    'SOA00921+SOB00924',
    'SOA00919+SOA00920',
    'SOB107970',
    'SOM03360',
    'SOB107875 (取送)'
  );

WITH default_yard AS (
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
    '12441 Woodbine Yard',
    '12441 Woodbine Ave, Gormley, ON L4A 2K4',
    43.948446,
    -79.374072,
    1000,
    500,
    true
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.company_yards
    WHERE name = '12441 Woodbine Yard'
  )
  RETURNING id
),
yard AS (
  SELECT id FROM default_yard
  UNION ALL
  SELECT id
  FROM public.company_yards
  WHERE name = '12441 Woodbine Yard'
  LIMIT 1
),
test_orders (
  order_number,
  schedule_group,
  stop_sequence,
  pallet_count,
  priority,
  time_window_custom,
  address
) AS (
  VALUES
    ('SOB107955', 1, 1, 9,  'P2', 'AM', '1402 Abbeywood Dr, Oakville, ON L6M 2W4'),
    ('SOB107760', 1, 2, 2,  'P3', 'AM', '340 Dalgleish Garden, Milton, ON L9T 6Z6'),
    ('SOV02039',  1, 3, 1,  'P3', 'AM', '115 Niagara Trail, Georgetown, ON L7G 0A8'),
    ('SOB108013', 3, 1, 11, 'P3', 'PM', '1138 Glen Eden Ct, Pickering, ON L1V 6N8'),
    ('SOA00921+SOB00924', 1, 1, 16, 'P2', 'AM', '213 Campbell Ave, Thornhill, ON L4J 5B1'),
    ('SOA00919+SOA00920', 1, 2, 6,  'P3', 'AM', '194 Ross Vennare Cres, Vaughan, ON L0J 1C0'),
    ('SOB107970', 1, 1, 9,  'P2', 'AM', '176 Staines Rd, Scarborough, ON M1X 1V3'),
    ('SOM03360',  1, 2, 13, 'P3', 'AM', '207 Sylvan Ave, Scarborough, ON M1E 1A4'),
    ('SOB107875 (取送)', 2, 1, 17, 'P2', 'AM', '207 Sylvan Ave, Scarborough, ON M1E 1A4')
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
  origin_yard_id,
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
  t.time_window_custom,
  t.address,
  t.order_number,
  '',
  '测试砖单 | 排班序号 ' || t.schedule_group || ' | 送货顺序 ' || t.stop_sequence,
  'pending'::public.order_status,
  t.order_number,
  'brick'::public.business_type,
  'delivery_to_customer'::public.brick_order_type,
  yard.id,
  t.pallet_count,
  true,
  t.priority,
  'brick'
FROM test_orders t
CROSS JOIN yard;
