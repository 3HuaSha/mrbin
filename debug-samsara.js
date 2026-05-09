const SAMSARA_TOKEN = 'samsara_api_xuwBoWcChtpqYPlGqEhhpmXncEhIke';

async function debug() {
  const endpoints = [
    'https://api.samsara.com/fleet/drivers?limit=10',
    'https://api.samsara.com/fleet/driver-vehicle-assignments?filterBy=drivers',
    'https://api.samsara.com/fleet/vehicles/stats?types=obdDriver'
  ];

  for (const url of endpoints) {
    console.log(`\n--- Testing: ${url} ---`);
    try {
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${SAMSARA_TOKEN}`, 'Accept': 'application/json' }
      });
      console.log('Status:', res.status);
      const data = await res.json();
      console.log('Data sample:', JSON.stringify(data.data?.[0] || data, null, 2).substring(0, 500));
      if (data.data) console.log('Total items in this page:', data.data.length);
    } catch (e) {
      console.error('Error:', e.message);
    }
  }
}

debug();
