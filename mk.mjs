import { chromium } from 'playwright'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const p = await b.newPage()
// Measure the existing marks and sample their colours.
await p.goto('file:///home/user/GripItGolf/public/title-leaderboard.png')
const info = await p.evaluate(async () => {
  const img = document.querySelector('img')
  await img.decode()
  const c = document.createElement('canvas')
  c.width = img.naturalWidth; c.height = img.naturalHeight
  const ctx = c.getContext('2d')
  ctx.drawImage(img, 0, 0)
  // Sample the letter colour from a dense spot and the dot colour bottom-right.
  const letter = ctx.getImageData(Math.round(img.naturalWidth*0.05), Math.round(img.naturalHeight*0.5), 1, 1).data
  const dot = ctx.getImageData(Math.round(img.naturalWidth*0.975), Math.round(img.naturalHeight*0.8), 1, 1).data
  return { w: img.naturalWidth, h: img.naturalHeight, letter: [...letter], dot: [...dot] }
})
console.log(JSON.stringify(info))
await b.close()
