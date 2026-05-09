const SAMSARA_TOKEN = 'samsara_api_xuwBoWcChtpqYPlGqEhhpmXncEhIke';

async function test() {
  console.log('--- DRIVERS ---');
  const dRes = await fetch('https://api.samsara.com/fleet/drivers?limit=5', {
    headers: { 'Authorization': `Bearer ${SAMSARA_TOKEN}`, 'Accept': 'application/json' }
  });
  const drivers = await dRes.json();
  console.log(JSON.stringify(drivers.data, null, 2));

  console.log('\n--- VEHICLE STATS (OBD) ---');
  const sRes = await fetch('https://api.samsara.com/fleet/vehicles/stats?types=obdDriver', {
    headers: { 'Authorization': `Bearer ${SAMSARA_TOKEN}`, 'Accept': 'application/json' }
  });
  const stats = await sRes.json();
  console.log(JSON.stringify(stats.data, null, 2));
}

test();
