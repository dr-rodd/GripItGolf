// Reading and resizing a club's uploaded image, on the server (D156): sharp,
// a real dependency since stage (e1). Its own file so only the upload route
// loads it.

import sharp from 'sharp'
import { ART_WIDTH, CREST_SIZE } from '@/lib/clubs'
import type { ImageWork } from './club'

/** sharp on the server (D156): turned upright, resized, WebP. */
export const imageWork: ImageWork = {
  async inspect(bytes) {
    try {
      const m = await sharp(bytes).metadata()
      const turned = (m.orientation ?? 1) >= 5
      return { format: m.format ?? null, width: (turned ? m.height : m.width) ?? 0, height: (turned ? m.width : m.height) ?? 0 }
    } catch {
      return null
    }
  },
  async prepare(kind, bytes) {
    const img = sharp(bytes).rotate()
    const out = kind === 'crest'
      ? img.resize(CREST_SIZE, CREST_SIZE, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 90 })
      : img.resize({ width: ART_WIDTH, withoutEnlargement: true }).webp({ quality: 80 })
    return new Uint8Array(await out.toBuffer())
  },
}
