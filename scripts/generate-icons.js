#!/usr/bin/env node
// Generates app icons for macOS (.icns), Windows (.ico), and Linux (.png)
// from the source PNG logo. Outputs to build/ directory.

const sharp = require('sharp')
const path = require('path')
const fs = require('fs')
const { execSync } = require('child_process')

const LOGO_PATH = path.join(__dirname, '..', 'assets', 'orquestra.logo.png')
const BUILD_DIR = path.join(__dirname, '..', 'build')

// Dark background matching the app theme
const BG_COLOR = { r: 0, g: 0, b: 0, alpha: 1 }

async function createIcon(size) {
  // Logo is 389x204 — scale to fit ~60% of the icon width, centered
  const logoWidth = Math.round(size * 0.86)
  const logo = await sharp(LOGO_PATH)
    .resize(logoWidth, logoWidth, { fit: 'contain' })
    .png()
    .toBuffer()

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: BG_COLOR,
    },
  })
    .composite([
      {
        input: logo,
        gravity: 'centre',
      },
    ])
    .png()
    .toBuffer()
}

async function generatePng() {
  const buf = await createIcon(512)
  const largeBuf = await createIcon(1024)
  fs.writeFileSync(path.join(BUILD_DIR, 'icon.png'), buf)
  fs.writeFileSync(path.join(BUILD_DIR, 'icon-1024.png'), largeBuf)
  console.log('  icon.png (512x512)')
  console.log('  icon-1024.png (1024x1024)')
}

async function generateIco() {
  const pngToIcoMod = require('png-to-ico')
  const pngToIco = pngToIcoMod.default || pngToIcoMod
  const sizes = [16, 32, 48, 64, 128, 256]
  const pngBuffers = await Promise.all(sizes.map((s) => createIcon(s)))
  const ico = await pngToIco(pngBuffers)
  fs.writeFileSync(path.join(BUILD_DIR, 'icon.ico'), ico)
  console.log('  icon.ico (' + sizes.join(', ') + ')')
}

async function generateIcns() {
  const iconsetDir = path.join(BUILD_DIR, 'icon.iconset')
  fs.mkdirSync(iconsetDir, { recursive: true })

  // macOS iconset requires specific named sizes
  const sizes = [16, 32, 128, 256, 512]
  for (const size of sizes) {
    const buf1x = await createIcon(size)
    fs.writeFileSync(path.join(iconsetDir, `icon_${size}x${size}.png`), buf1x)

    const buf2x = await createIcon(size * 2)
    fs.writeFileSync(
      path.join(iconsetDir, `icon_${size}x${size}@2x.png`),
      buf2x,
    )
  }

  const icnsPath = path.join(BUILD_DIR, 'icon.icns')
  if (process.platform === 'darwin') {
    execSync(`iconutil -c icns "${iconsetDir}" -o "${icnsPath}"`)
  } else {
    const chunks = []
    const pngChunkTypes = [
      ['ic04', 16],
      ['ic05', 32],
      ['ic07', 128],
      ['ic08', 256],
      ['ic09', 512],
      ['ic10', 1024],
    ]
    for (const [type, size] of pngChunkTypes) {
      const png = await createIcon(size)
      const header = Buffer.alloc(8)
      header.write(type, 0, 4, 'ascii')
      header.writeUInt32BE(png.length + 8, 4)
      chunks.push(header, png)
    }
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 8)
    const header = Buffer.alloc(8)
    header.write('icns', 0, 4, 'ascii')
    header.writeUInt32BE(totalLength, 4)
    fs.writeFileSync(icnsPath, Buffer.concat([header, ...chunks], totalLength))
  }
  fs.rmSync(iconsetDir, { recursive: true })
  console.log('  icon.icns (16-1024)')
}

async function main() {
  fs.mkdirSync(BUILD_DIR, { recursive: true })
  console.log('Generating icons...')
  await Promise.all([generatePng(), generateIco(), generateIcns()])
  console.log('Done.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
