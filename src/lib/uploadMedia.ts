import { supabase } from './supabase';

export type MediaType = 'banner' | 'icon';

export async function uploadPartyMedia(
  file: File,
  userId: string,
  type: MediaType
): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const path = `${type}s/${userId}/${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from('party-media')
    .upload(path, file, { upsert: true, contentType: file.type });

  if (error) throw error;

  const { data } = supabase.storage.from('party-media').getPublicUrl(path);
  return data.publicUrl;
}

export async function deletePartyMedia(url: string): Promise<void> {
  // Extract path from public URL: .../party-media/banners/...
  const marker = '/party-media/';
  const idx = url.indexOf(marker);
  if (idx === -1) return;
  const path = url.slice(idx + marker.length);
  await supabase.storage.from('party-media').remove([path]);
}

/** Detect chat platform from URL for icon display */
export function detectChatPlatform(url: string): 'whatsapp' | 'telegram' | 'signal' | 'discord' | 'other' {
  try {
    const host = new URL(url).hostname;
    if (host.includes('whatsapp') || host === 'wa.me') return 'whatsapp';
    if (host.includes('telegram') || host === 't.me') return 'telegram';
    if (host.includes('signal')) return 'signal';
    if (host.includes('discord')) return 'discord';
  } catch {}
  return 'other';
}
