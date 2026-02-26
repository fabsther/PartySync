import { createClient } from 'npm:@supabase/supabase-js@2';

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

async function sha256hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const { address } = await req.json();
    if (!address?.trim()) return json({ error: 'address required' }, 400);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const hash = await sha256hex(address.toLowerCase().trim());

    // Cache hit?
    const { data: cached } = await supabase
      .from('geocode_cache')
      .select('lat, lng')
      .eq('address_hash', hash)
      .maybeSingle();

    if (cached) return json({ lat: cached.lat, lng: cached.lng });

    // Nominatim call
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`;
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'PartySync/1.0 contact@partysync.app' },
    });
    const results = await resp.json();
    if (!results.length) return json({ error: 'Address not found' }, 404);

    const lat = parseFloat(results[0].lat);
    const lng = parseFloat(results[0].lon);

    await supabase.from('geocode_cache').upsert({ address_hash: hash, address, lat, lng });

    return json({ lat, lng });
  } catch (err: any) {
    return json({ error: err.message }, 500);
  }
});
