const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

async function getUberToken(): Promise<string> {
  const resp = await fetch('https://login.uber.com/oauth/v2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: Deno.env.get('UBER_CLIENT_ID')!,
      client_secret: Deno.env.get('UBER_CLIENT_SECRET')!,
      grant_type: 'client_credentials',
      scope: 'ride_widgets',
    }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(`Uber auth: ${JSON.stringify(data)}`);
  return data.access_token;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const { from_lat, from_lng, to_lat, to_lng } = await req.json();
    if (!from_lat || !from_lng || !to_lat || !to_lng) {
      return json({ error: 'from_lat, from_lng, to_lat, to_lng required' }, 400);
    }

    const token = await getUberToken();

    const url = new URL('https://api.uber.com/v1.2/estimates/price');
    url.searchParams.set('start_latitude', String(from_lat));
    url.searchParams.set('start_longitude', String(from_lng));
    url.searchParams.set('end_latitude', String(to_lat));
    url.searchParams.set('end_longitude', String(to_lng));

    const resp = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}`, 'Accept-Language': 'fr_FR' },
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(JSON.stringify(data));

    const prices: any[] = data.prices || [];
    // Prefer UberX / uberx
    const pick = prices.find(p =>
      p.display_name?.toLowerCase().startsWith('uberx')
    ) || prices[0];

    if (!pick) return json({ error: 'No prices available' }, 404);

    return json({
      low_estimate: pick.low_estimate,
      high_estimate: pick.high_estimate,
      currency_code: pick.currency_code,
      display_name: pick.display_name,
      surge_multiplier: pick.surge_multiplier,
    });
  } catch (err: any) {
    return json({ error: err.message }, 500);
  }
});
