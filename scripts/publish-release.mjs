// =============================================================================
// publish-release.mjs — upload Windows/mac/linux artifacts to Cloudflare R2
// for electron-updater (generic provider).
//
// Organizes files by version into folders (v{version}/) on the bucket, keeping
// latest.yml at the root with its path/url pointing into the version folder.
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
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

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

// Matches version numbers in filenames: Orquestra Setup 1.5.1.exe, Orquestra-1.5.1-win.zip
const VERSION_RE = /Orquestra(?: Setup)?[- ](\d+\.\d+\.\d+)/

function die(msg) {
  console.error(`\u274C ${msg}`)
  process.exit(1)
}

function mimeType(filePath) {
  const name = filePath.toLowerCase()
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
  console.log('=== Publish Release \u2192 Cloudflare R2 ===')
  console.log(`   Bucket:   ${BUCKET}`)
  console.log(`   Endpoint: ${ENDPOINT || '(missing R2_ACCOUNT_ID)'}`)
  console.log(`   Public:   ${PUBLIC_URL || '(set ORQUESTRA_RELEASES_URL)'}`)
  console.log(`   From:     ${RELEASE_DIR}`)
  console.log('')

  if (!ACCOUNT_ID || !ACCESS_KEY || !SECRET_KEY) {
    die(
      'Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY\n' +
        '   Cloudflare Dashboard \u2192 R2 \u2192 Manage R2 API Tokens \u2192 Create API token\n' +
        '   (Object Read & Write on the releases bucket)',
    )
  }
  if (!PUBLIC_URL || PUBLIC_URL.includes('PLACEHOLDER')) {
    die(
      'Set ORQUESTRA_RELEASES_URL to your public R2 URL (no trailing slash).\n' +
        '   Example: https://pub-xxxxxxxx.r2.dev/orquestra-releases\n' +
        '   Enable public access on the bucket (R2 \u2192 Settings \u2192 Public access)\n' +
        '   or attach a custom domain.',
    )
  }
  if (!existsSync(RELEASE_DIR)) {
    die(`Release dir not found: ${RELEASE_DIR}\n   Run: npm run package:win`)
  }

  // Collect all files, grouped by version
  const entries = readdirSync(RELEASE_DIR).filter((f) => {
    if (f === 'builder-debug.yml' || f.endsWith('.json')) return false
    const p = join(RELEASE_DIR, f)
    return statSync(p).isFile()
  })
  if (entries.length === 0) {
    die('No artifacts in release/. Run npm run package:win first.')
  }

  // Group files: latest.yml is special; version files go to folders; others skip.
  const latestEntry = entries.find((f) => f === 'latest.yml')
  const versionFiles = entries.filter((f) => f !== 'latest.yml' && VERSION_RE.test(f))

  console.log(`\uD83D\uDCE6 ${entries.length} entries found:`)
  for (const f of entries) {
    const match = f.match(VERSION_RE)
    const tag = match ? `v${match[1]}/` : f === 'latest.yml' ? '(root)' : '(skip)'
    const size = statSync(join(RELEASE_DIR, f)).size
    console.log(`   - ${tag}${f} (${(size / 1024 / 1024).toFixed(1)} MB)`)
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
    console.log(`\u2139\uFE0F  Bucket "${BUCKET}" reachable`)
  } catch (err) {
    die(
      `Cannot access bucket "${BUCKET}": ${err?.message || err}\n` +
        '   Create it in Cloudflare Dashboard \u2192 R2 \u2192 Create bucket\n' +
        '   Name must match R2_BUCKET (default orquestra-releases)',
    )
  }

  console.log('')
  console.log('\u2B06\uFE0F  Uploading\u2026')

  // Upload version-specific files to v{version}/ folder
  for (const f of versionFiles) {
    const filePath = join(RELEASE_DIR, f)
    const body = readFileSync(filePath)
    const version = f.match(VERSION_RE)[1]
    const key = `v${version}/${f}`
    console.log(`   ${key} (${(body.length / 1024 / 1024).toFixed(1)} MB)`)
    await client.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: body,
        ContentType: mimeType(filePath),
      }),
    )
  }

  // Upload latest.yml to root with updated path/url pointing to version folder
  if (latestEntry) {
    const filePath = join(RELEASE_DIR, latestEntry)
    let content = readFileSync(filePath, 'utf-8')
    const version = content.match(/^version:\s*(\S+)/m)?.[1]
    if (version) {
      content = content
        .replace(/^(path:\s*)(.+)$/m, `$1v${version}/$2`)
        .replace(/^(\s+- url:\s*)(.+)$/m, `$1v${version}/$2`)
    }
    console.log(`   latest.yml (root, version=${version || '?'})`)
    await client.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: 'latest.yml',
        Body: content,
        ContentType: 'text/yaml',
      }),
    )
  }

  console.log('')
  console.log('\u2705  Upload complete')
  console.log(`   Feed URL: ${PUBLIC_URL}/`)
  console.log(`   Check:    ${PUBLIC_URL}/latest.yml`)
  console.log('')
  console.log('Your releases are now organised by version on the bucket:')
  console.log('   v{version}/')
  console.log('     Orquestra Setup {version}.exe')
  console.log('     Orquestra Setup {version}.exe.blockmap')
  console.log('     Orquestra-{version}-win.zip')
  console.log('   latest.yml  (points to the latest version folder)')
  console.log('')
  console.log('\uD83D\uDCCB electron-builder publish.url and ORQUESTRA_RELEASES_URL must match this feed.')
  console.log('')
}

main().catch((err) => {
  console.error('')
  console.error('\u274C Failed:', err?.message || err)
  process.exit(1)
})
