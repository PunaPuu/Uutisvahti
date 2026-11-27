// Draw the app icons as PNG with no dependencies: a blue tile with three
// "headline" bars and a dot. Run once: node scripts/make-icons.mjs
import { mkdirSync, writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}

function draw(size) {
  const px = Buffer.alloc(size * (size * 4 + 1))
  const u = size / 100
  const inRect = (x, y, x0, y0, x1, y1, r) => {
    const cx = Math.min(Math.max(x, x0 + r), x1 - r)
    const cy = Math.min(Math.max(y, y0 + r), y1 - r)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r && x >= x0 && x <= x1 && y >= y0 && y <= y1
  }
  for (let y = 0; y < size; y++) {
    px[y * (size * 4 + 1)] = 0
    for (let x = 0; x < size; x++) {
      const X = x / u, Y = y / u
      // background gradient, full bleed (iOS rounds the corners itself)
      const t = (X + Y) / 200
      let r = 11 + t * 20, g = 98 - t * 30, b = 196 - t * 20
      const white = inRect(X, Y, 22, 28, 78, 38, 5) || inRect(X, Y, 22, 46, 66, 54, 4) || inRect(X, Y, 22, 62, 58, 70, 4)
      const dot = (X - 72) ** 2 + (Y - 66) ** 2 <= 7 ** 2
      if (white) { r = g = b = 255 }
      if (dot) { r = 255; g = 196; b = 64 }
      const o = y * (size * 4 + 1) + 1 + x * 4
      px[o] = r; px[o + 1] = g; px[o + 2] = b; px[o + 3] = 255
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8; ihdr[9] = 6
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(px)), chunk('IEND', Buffer.alloc(0))])
}

mkdirSync('public/icons', { recursive: true })
for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  writeFileSync(`public/icons/${name}`, draw(size))
}
console.log('Icons written to public/icons/')
