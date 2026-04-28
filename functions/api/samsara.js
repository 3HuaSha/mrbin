// Cloudflare Pages Function
export async function onRequest(context) {
  // 在 Cloudflare Pages 中，环境变量通过 context.env 访问
  const SAMSARA_TOKEN = context.env.SAMSARA_TOKEN || context.env.VITE_SAMSARA_TOKEN || 'samsara_api_xuwBoWcChtpqYPlGqEhhpmXncEhIke';
  
  console.log('🔄 Cloudflare Pages Function: 开始获取 Samsara 数据');
  
  try {
    const response = await fetch('https://api.samsara.com/fleet/vehicles/locations', {
      headers: {
        'Authorization': `Bearer ${SAMSARA_TOKEN}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Samsara API 错误:', response.status, errorText);
      return new Response(JSON.stringify({
        success: false,
        error: `Samsara API Error: ${response.status} - ${errorText}`,
        data: []
      }), {
        status: response.status,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    const data = await response.json();
    console.log('✅ Samsara API 成功，获取到', data.data?.length || 0, '辆车');
    
    return new Response(JSON.stringify({
      success: true,
      data: data.data || [],
      timestamp: new Date().toISOString()
    }), {
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (error) {
    console.error('❌ Samsara API 异常:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message || 'Unknown error',
      data: []
    }), {
      status: 500,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}
