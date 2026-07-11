// =============================================================================
// publish-release.mjs — upload Windows/mac/linux artifacts to Cloudflare R2
// for electron-updater (generic provider).
//
// Usage:
//   # Required env (R2 API token with Object Read & Write on the bucket):
//   set R2_ACCOUNT_ID=...
//   set R2_ACCESS_KEY_ID=...
//   set R2_SECRET_ACCESS_KEY=...
//   set R2_BUCKET=orquestra-releases
//   set ORQUESTRA_RELEASES_URL=https://pub-xxxx.r2.dev/orquestra-releases
//
//   node scripts/publish-release.mjs
//
// Optional:
//   R2_ENDPOINT  — default https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com
//   --dir path   — default ./release
//
// Public URL (ORQUESTRA_RELEASES_URL) must match electron-builder.yml publish.url
// and src/shared/releasesFeed.ts so auto-update can read latest.yml.
// =============================================================================

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, basename, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const ACCOUNT_ID = process.env.R2_ACCOUNT_ID || ''
const ACCESS_KEY = process.env.R2_ACCESS_KEY_ID || ''
const SECRET_KEY = process.env.R2_SECRET_ACCESS_KEY || ''
const BUCKET = process.env.R2_BUCKET || 'orquestra-releases'
const ENDPOINT =
  process.env.R2_ENDPOINT ||
  (ACCOUNT_ID ? `https://${ACCOUNT_ID}.r2.cloudflarestorage.com` : '')
const PUBLIC_URL = (process.env.ORQUESTRA_RELEASES_URL || '').replace(/\/+$/, '')

const dirFlag = process.argv.indexOf('--dir')
const RELEASE_DIR =
  dirFlag >= 0 && process.argv[dirFlag + 1]
    ? process.argv[dirFlag + 1]
    : join(ROOT, 'release')

function die(msg) {
  console.error(`❌ ${msg}`)
  process.exit(1)
}

function mimeType(filePath) {
  const name = basename(filePath).toLowerCase()
  if (name.endsWith('.yml') || name.endsWith('.yaml')) return 'text/yaml'
  if (name.endsWith('.exe')) return 'application/x-msdownload'
  if (name.endsWith('.zip')) return 'application/zip'
  if (name.endsWith('.blockmap')) return 'application/octet-stream'
  if (name.endsWith('.dmg')) return 'application/x-apple-diskimage'
  if (name.endsWith('.appimage')) return 'application/octet-stream'
  if (name.endsWith('.deb')) return 'application/vnd.debian.binary-package'
  if (name.endsWith('.tar.gz') || name.endsWith('.tgz')) return 'application/gzip'
  return 'application/octet-stream'
}

async function loadS3() {
  try {
    // Prefer installed package; works when listed in package.json devDependencies
    return await import('@aws-sdk/client-s3')
  } catch {
    die(
      'Missing @aws-sdk/client-s3. Install with:\n' +
        '   npm install -D @aws-sdk/client-s3\n',
    )
  }
}

async function main() {
  console.log('')
  console.log('=== Publish Release → Cloudflare R2 ===')
  console.log(`   Bucket:   ${BUCKET}`)
  console.log(`   Endpoint: ${ENDPOINT || '(missing R2_ACCOUNT_ID)'}`)
  console.log(`   Public:   ${PUBLIC_URL || '(set ORQUESTRA_RELEASES_URL)'}`)
  console.log(`   From:     ${RELEASE_DIR}`)
  console.log('')

  if (!ACCOUNT_ID || !ACCESS_KEY || !SECRET_KEY) {
    die(
      'Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY\n' +
        '   Cloudflare Dashboard → R2 → Manage R2 API Tokens → Create API token\n' +
        '   (Object Read & Write on the releases bucket)',
    )
  }
  if (!PUBLIC_URL || PUBLIC_URL.includes('PLACEHOLDER')) {
    die(
      'Set ORQUESTRA_RELEASES_URL to your public R2 URL (no trailing slash).\n' +
        '   Example: https://pub-xxxxxxxx.r2.dev/orquestra-releases\n' +
        '   Enable public access on the bucket (R2 → Settings → Public access)\n' +
        '   or attach a custom domain.',
    )
  }
  if (!existsSync(RELEASE_DIR)) {
    die(`Release dir not found: ${RELEASE_DIR}\n   Run: npm run package:win`)
  }

  const files = readdirSync(RELEASE_DIR).filter((f) => {
    if (f === 'builder-debug.yml' || f.endsWith('.json')) return false
    const p = join(RELEASE_DIR, f)
    return statSync(p).isFile()
  })
  if (files.length === 0) {
    die('No artifacts in release/. Run npm run package:win first.')
  }

  console.log(`📦 ${files.length} artifacts:`)
  for (const f of files) {
    const size = statSync(join(RELEASE_DIR, f)).size
    console.log(`   - ${f} (${(size / 1024 / 1024).toFixed(1)} MB)`)
  }
  console.log('')

  const { S3Client, PutObjectCommand, HeadBucketCommand } = await loadS3()
  const client = new S3Client({
    region: 'auto',
    endpoint: ENDPOINT,
    credentials: {
      accessKeyId: ACCESS_KEY,
      secretAccessKey: SECRET_KEY,
    },
  })

  try {
    await client.send(new HeadBucketCommand({ Bucket: BUCKET }))
    console.log(`ℹ️  Bucket "${BUCKET}" reachable`)
  } catch (err) {
    die(
      `Cannot access bucket "${BUCKET}": ${err?.message || err}\n` +
        '   Create it in Cloudflare Dashboard → R2 → Create bucket\n' +
        '   Name must match R2_BUCKET (default orquestra-releases)',
    )
  }

  console.log('')
  console.log('⬆️  Uploading…')
  for (const f of files) {
    const filePath = join(RELEASE_DIR, f)
    const body = readFileSync(filePath)
    const key = f // root of bucket (or prefix if PUBLIC_URL has a path)
    // If public URL is .../orquestra-releases, objects live at bucket root when
    // the bucket IS orquestra-releases. If using a path prefix on a larger bucket,
    // set R2_KEY_PREFIX=orquestra-releases/
    const prefix = (process.env.R2_KEY_PREFIX || '').replace(/^\/+|\/+$/g, '')
    const objectKey = prefix ? `${prefix}/${key}` : key
    console.log(`   ${f} → s3://${BUCKET}/${objectKey} (${(body.length / 1024 / 1024).toFixed(1)} MB)`)
    await client.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: objectKey,
        Body: body,
        ContentType: mimeType(filePath),
        // Public read is controlled by bucket settings / custom domain, not ACL
        // (R2 ignores many AWS ACL fields).
      }),
    )
  }

  console.log('')
  console.log('✅  Upload complete')
  console.log(`   Feed URL: ${PUBLIC_URL}/`)
  console.log(`   Check:    ${PUBLIC_URL}/latest.yml`)
  console.log('')
  console.log('📋 electron-builder publish.url and ORQUESTRA_RELEASES_URL must match this feed.')
  console.log('')
}

main().catch((err) => {
  console.error('')
  console.error('❌ Failed:', err?.message || err)
  process.exit(1)
})
