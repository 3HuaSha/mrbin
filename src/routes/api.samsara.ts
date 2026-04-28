import { json } from '@tanstack/start';

export async function GET() {
  const SAMSARA_TOKEN = process.env.VITE_SAMSARA_TOKEN || 'samsara_api_xuwBoWcChtpqYPlGqEhhpmXncEhIke';
  
  try {
    const response = await fetch('https://api.samsara.com/fleet/vehicles/locations', {
      headers: {
        'Authorization': `Bearer ${SAMSARA_TOKEN}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Samsara API Error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    
    return json({
      success: true,
      data: data.data || [],
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Samsara API Error:', error);
    return json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      data: []
    }, { status: 500 });
  }
}
