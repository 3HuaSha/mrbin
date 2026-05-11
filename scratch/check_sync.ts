
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://gkirxxwlkimmpukvwvgb.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function checkSync() {
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing SUPABASE_SERVICE_ROLE_KEY');
    return;
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  console.log('--- Active Drivers ---');
  const { data: drivers } = await supabase.from('profiles').select('id, name, is_active').eq('role', 'driver').eq('is_active', true);
  console.log(drivers);

  console.log('\n--- Current Assignments ---');
  const { data: assignments } = await supabase.from('driver_vehicle_assignments').select('*, vehicles(name)');
  console.log(assignments);
  
  console.log('\n--- All Vehicles ---');
  const { data: vehicles } = await supabase.from('vehicles').select('id, name, is_active, samsara_id');
  console.log(vehicles);
}

checkSync();
