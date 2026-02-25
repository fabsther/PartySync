import { supabase } from './supabase';

export type MediaType = 'banner' | 'icon';

/**
 * Resize an image file using a canvas until it fits under maxBytes.
 * Returns the original file unchanged if already small enough.
 * Always outputs JPEG for compressed files.
 */
export function resizeImageFile(
  file: File,
  maxBytes = 2 * 1024 * 1024,
  maxDimension = 1920
): Promise<File> {
  if (file.size <= maxBytes) return Promise.resolve(file);

  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      let w = img.naturalWidth;
      let h = img.naturalHeight;

      // Cap initial dimensions
      if (w > maxDimension || h > maxDimension) {
        const ratio = Math.min(maxDimension / w, maxDimension / h);
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
      }

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;

      const tryEncode = (width: number, height: number, quality: number): void => {
        canvas.width = width;
        canvas.height = height;
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (!blob) { reject(new Error('Échec de la compression')); return; }

            if (blob.size <= maxBytes) {
              const outName = file.name.replace(/\.[^.]+$/, '.jpg');
              resolve(new File([blob], outName, { type: 'image/jpeg' }));
            } else if (quality > 0.5) {
              tryEncode(width, height, Math.round((quality - 0.1) * 10) / 10);
            } else {
              const newW = Math.round(width * 0.75);
              const newH = Math.round(height * 0.75);
              if (newW < 100) { reject(new Error('Image impossible à compresser suffisamment')); return; }
              tryEncode(newW, newH, 0.9);
            }
          },
          'image/jpeg',
          quality
        );
      };

      tryEncode(w, h, 0.9);
    };

    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('Impossible de lire l\'image')); };
    img.src = objectUrl;
  });
}

export async function uploadPartyMedia(
  file: File,
  userId: string,
  type: MediaType
): Promise<string> {
  const maxDim = type === 'banner' ? 1920 : 512;
  const resized = await resizeImageFile(file, 2 * 1024 * 1024, maxDim);
  const ext = resized.name.split('.').pop()?.toLowerCase() || 'jpg';
  const path = `${type}s/${userId}/${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from('party-media')
    .upload(path, resized, { upsert: true, contentType: resized.type });

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

export async function uploadAvatarMedia(file: File, userId: string): Promise<string> {
  const resized = await resizeImageFile(file, 1 * 1024 * 1024, 400);
  const ext = resized.name.split('.').pop()?.toLowerCase() || 'jpg';
  const path = `avatars/${userId}/${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from('party-media')
    .upload(path, resized, { upsert: false, contentType: resized.type });

  if (error) throw error;

  const { data } = supabase.storage.from('party-media').getPublicUrl(path);
  return data.publicUrl;
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
