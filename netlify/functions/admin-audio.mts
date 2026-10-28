import { getStore } from '@netlify/blobs';

export default async (req: Request) => {
  if (req.method !== 'GET') return new Response(null, { status: 405 });
  const id = new URL(req.url).searchParams.get('id') || '';
  if (!/^track_mp3_[a-zA-Z0-9_]+$/.test(id)) return new Response(null, { status: 400 });
  const data = await getStore({ name: 'admin-audio', consistency: 'strong' }).get(id);
  if (!data) return new Response(null, { status: 404 });
  const match = data.match(/^data:(audio\/[^;,]+);base64,(.+)$/);
  if (!match) return new Response(null, { status: 404 });
  return new Response(Buffer.from(match[2], 'base64'), { headers: {
    'Content-Type': match[1], 'Cache-Control': 'no-store',
  } });
};
