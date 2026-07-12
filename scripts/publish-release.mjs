// =============================================================================
// publish-release.mjs — upload artifacts to Cloudflare R2
// for electron-updater (generic provider).
//
// Policy (storage cost):
//   - Upload ONLY the current package version (from latest.yml / package.json)
//   - Store under v{version}/ + root latest.yml
//   - After upload, prune the bucket to keep at most 2 version folders
//     (current + previous). Everything else is deleted from R2 (GitHub keeps
//     the long-term history).
//
// Usage:
//   set R2_ACCOUNT_ID=...
//   set R2_ACCESS_KEY_ID=...
//   set R2_SECRET_ACCESS_KEY=...
//   set R2_BUCKET=orquestra-releases
//   set ORQUESTRA_RELEASES_URL=https://pub-xxxx.r2.dev
//   node scripts/publish-release.mjs
//
// Optional:
//   --dir path          default ./release
//   --keep N            version folders to keep (default 2)
//   --prune-only        only prune; do not upload
// =============================================================================

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, relative, dirname, basename } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

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

const keepFlag = process.argv.indexOf('--keep')
const KEEP_VERSIONS = Math.max(
  1,
  keepFlag >= 0 && process.argv[keepFlag + 1]
    ? parseInt(process.argv[keepFlag + 1], 10) || 2
    : 2,
)

const PRUNE_ONLY = process.argv.includes('--prune-only')

const SKIP_NAMES = new Set([
  'win-unpacked',
  'mac-unpacked',
  'linux-unpacked',
  'builder-debug.yml',
  '__MACOSX',
  '.DS_Store',
])

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

function collectFiles(dir) {
  const result = []
  const entries = readdirSync(dir)
  for (const entry of entries) {
    if (SKIP_NAMES.has(entry)) continue
    const fullPath = join(dir, entry)
    const stat = statSync(fullPath)
    if (stat.isDirectory()) {
      result.push(...collectFiles(fullPath))
    } else if (stat.isFile()) {
      result.push(fullPath)
    }
  }
  return result
}

/**
 * Ensure path/url fields under latest.yml point at v{version}/artifact without
 * doubling an existing version prefix.
 * @param {string} content
 * @param {string} version
 */
export function patchLatestYmlArtifactPaths(content, version) {
  const v = String(version || '').replace(/^v/i, '')
  if (!v) return content
  const prefix = `v${v}/`
  const fixRest = (rest) => {
    let r = String(rest || '').trim()
    const re = new RegExp(`^(?:v${v.replace(/\./g, '\\.')}/)+`)
    r = r.replace(re, '')
    if (/^v\d+\.\d+\.\d+\//.test(r)) return r
    return prefix + r
  }
  return content
    .replace(/^(path:\s*)(.+)$/m, (_, p, rest) => `${p}${fixRest(rest)}`)
    .replace(/^(\s+- url:\s*)(.+)$/m, (_, p, rest) => `${p}${fixRest(rest)}`)
}

/** Compare semver a vs b: -1 if a<b, 0 equal, 1 if a>b */
export function cmpSemver(a, b) {
  const pa = String(a).replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0)
  const pb = String(b).replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const da = pa[i] || 0
    const db = pb[i] || 0
    if (da < db) return -1
    if (da > db) return 1
  }
  return 0
}

/** True if this local file belongs to the current release (not leftover older builds). */
export function isCurrentVersionArtifact(relKey, version) {
  const v = String(version || '').replace(/^v/i, '')
  if (!v) return false
  const key = relKey.replace(/\\/g, '/')
  if (key === 'latest.yml') return true
  if (key.startsWith(`v${v}/`)) {
    // Only files whose basename mentions this version (avoid junk in the folder)
    return basename(key).includes(v)
  }
  // Flat root artifact for this version only
  if (!key.includes('/')) {
    return basename(key).includes(v)
  }
  return false
}

/** Also pick previous version artifacts from local release/ for backup re-upload. */
export function isPreviousVersionArtifact(relKey, previousVersion) {
  if (!previousVersion) return false
  return isCurrentVersionArtifact(relKey, previousVersion)
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

async function listAllKeys(client, ListObjectsV2Command) {
  const keys = []
  let ContinuationToken
  do {
    const out = await client.send(
      new ListObjectsV2Command({
        Bucket: BUCKET,
        ContinuationToken,
      }),
    )
    for (const obj of out.Contents || []) {
      if (obj.Key) keys.push(obj.Key)
    }
    ContinuationToken = out.IsTruncated ? out.NextContinuationToken : undefined
  } while (ContinuationToken)
  return keys
}

/**
 * Keep latest.yml + at most KEEP_VERSIONS version folders (current preferred).
 * Delete flat root installers and older v* folders / junk inside folders.
 */
export function planPruneKeys(allKeys, currentVersion, keepCount = 2) {
  const current = String(currentVersion || '').replace(/^v/i, '')
  const versionSet = new Set()
  for (const key of allKeys) {
    const m = key.match(/^v(\d+\.\d+\.\d+)\//)
    if (m) versionSet.add(m[1])
  }
  if (current) versionSet.add(current)

  const sorted = [...versionSet].sort((a, b) => cmpSemver(b, a)) // newest first
  // Ensure current is kept even if sorting quirks
  const keep = []
  if (current) keep.push(current)
  for (const v of sorted) {
    if (keep.length >= keepCount) break
    if (!keep.includes(v)) keep.push(v)
  }
  const keepSet = new Set(keep)

  const toDelete = []
  for (const key of allKeys) {
    if (key === 'latest.yml') continue

    const m = key.match(/^v(\d+\.\d+\.\d+)\/(.+)$/)
    if (m) {
      const ver = m[1]
      const name = m[2]
      // Drop whole older version folders
      if (!keepSet.has(ver)) {
        toDelete.push(key)
        continue
      }
      // Drop junk that doesn't belong in this version folder
      // (e.g. v1.5.5/Orquestra Setup 1.5.3.exe from a bad publish)
      if (!name.includes(ver)) {
        toDelete.push(key)
      }
      continue
    }

    // Flat root installers / zips / anything else → delete (feed uses vX/ paths)
    toDelete.push(key)
  }

  return { keepVersions: keep, toDelete }
}

async function pruneBucket(client, s3, currentVersion, keepCount) {
  const { ListObjectsV2Command, DeleteObjectsCommand } = s3
  console.log('')
  console.log(`\uD83E\uDDF9  Pruning R2 (keep ${keepCount} versions, current=${currentVersion || '?'})…`)

  const allKeys = await listAllKeys(client, ListObjectsV2Command)
  console.log(`   Objects in bucket: ${allKeys.length}`)

  const { keepVersions, toDelete } = planPruneKeys(allKeys, currentVersion, keepCount)
  console.log(`   Keep folders: ${keepVersions.map((v) => `v${v}`).join(', ') || '(none)'}`)
  console.log(`   Delete: ${toDelete.length} objects`)

  if (toDelete.length === 0) {
    console.log('   Nothing to delete.')
    return { keepVersions, deleted: 0 }
  }

  // Delete in batches of 1000 (S3 limit)
  let deleted = 0
  for (let i = 0; i < toDelete.length; i += 1000) {
    const chunk = toDelete.slice(i, i + 1000)
    for (const k of chunk) console.log(`   - ${k}`)
    await client.send(
      new DeleteObjectsCommand({
        Bucket: BUCKET,
        Delete: {
          Objects: chunk.map((Key) => ({ Key })),
          Quiet: true,
        },
      }),
    )
    deleted += chunk.length
  }
  console.log(`   Deleted ${deleted} objects.`)
  return { keepVersions, deleted }
}

async function main() {
  console.log('')
  console.log('=== Publish Release \u2192 Cloudflare R2 ===')
  console.log(`   Bucket:   ${BUCKET}`)
  console.log(`   Endpoint: ${ENDPOINT || '(missing R2_ACCOUNT_ID)'}`)
  console.log(`   Public:   ${PUBLIC_URL || '(set ORQUESTRA_RELEASES_URL)'}`)
  console.log(`   From:     ${RELEASE_DIR}`)
  console.log(`   Keep:     ${KEEP_VERSIONS} version folder(s)`)
  if (PRUNE_ONLY) console.log('   Mode:     prune-only')
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
        '   Example: https://pub-xxxxxxxx.r2.dev\n' +
        '   Enable public access on the bucket (R2 \u2192 Settings \u2192 Public access)\n' +
        '   or attach a custom domain.',
    )
  }

  const s3 = await loadS3()
  const { S3Client, PutObjectCommand, HeadBucketCommand } = s3
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

  // Resolve current version: latest.yml > package.json
  let releaseVersion = null
  const latestPath = join(RELEASE_DIR, 'latest.yml')
  if (existsSync(latestPath)) {
    try {
      const raw = readFileSync(latestPath, 'utf-8')
      releaseVersion = raw.match(/^version:\s*(\S+)/m)?.[1]?.replace(/^v/i, '') || null
    } catch { /* ignore */ }
  }
  if (!releaseVersion) {
    try {
      const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'))
      releaseVersion = String(pkg.version || '').replace(/^v/i, '') || null
    } catch { /* ignore */ }
  }
  if (!releaseVersion) die('Could not determine release version from latest.yml or package.json')

  if (!PRUNE_ONLY) {
    if (!existsSync(RELEASE_DIR)) {
      die(`Release dir not found: ${RELEASE_DIR}\n   Run: npm run package:win`)
    }

    const allPaths = collectFiles(RELEASE_DIR)
    if (allPaths.length === 0) {
      die('No files found in release/. Run npm run package:win first.')
    }

    // Previous version for backup re-upload (if present locally)
    let previousVersion = null
    try {
      const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'))
      // Infer previous from local flat files: highest version < current
      const found = new Set()
      for (const p of allPaths) {
        const name = basename(p)
        const m = name.match(/(\d+\.\d+\.\d+)/)
        if (m && cmpSemver(m[1], releaseVersion) < 0) found.add(m[1])
      }
      const sorted = [...found].sort((a, b) => cmpSemver(b, a))
      previousVersion = sorted[0] || null
      void pkg
    } catch { /* ignore */ }

    const entries = allPaths
      .map((p) => ({
        absPath: p,
        key: relative(RELEASE_DIR, p).replace(/\\/g, '/'),
      }))
      .filter(
        (e) =>
          isCurrentVersionArtifact(e.key, releaseVersion)
          || isPreviousVersionArtifact(e.key, previousVersion),
      )

    if (entries.length === 0) {
      die(
        `No artifacts for version ${releaseVersion} in release/.\n` +
          '   Run: npm run package:win',
      )
    }

    console.log(`\uD83D\uDCE6 Uploading current v${releaseVersion}`
      + (previousVersion ? ` + backup v${previousVersion}` : '')
      + ` (${entries.length} files):`)
    for (const e of entries) {
      const size = statSync(e.absPath).size
      console.log(`   - ${e.key} (${(size / 1024 / 1024).toFixed(1)} MB)`)
    }
    console.log('')
    console.log('\u2B06\uFE0F  Uploading\u2026')

    for (const e of entries) {
      let body = readFileSync(e.absPath)
      let key = e.key

      // Determine which version this file belongs to
      const nameVer = basename(key).match(/(\d+\.\d+\.\d+)/)?.[1]
      const fileVer = nameVer || releaseVersion

      // Flat Setup/zip/blockmap → v{version}/
      if (
        !key.includes('/')
        && (key.endsWith('.exe') || key.endsWith('.zip') || key.endsWith('.blockmap') || key.endsWith('.dmg'))
      ) {
        key = `v${fileVer}/${key}`
      } else if (key.startsWith('v') && key.includes('/')) {
        // already versioned folder
      } else if (key === 'latest.yml') {
        // root feed
      }

      if (key === 'latest.yml' || key.endsWith('/latest.yml')) {
        const content = body.toString('utf-8')
        body = Buffer.from(patchLatestYmlArtifactPaths(content, releaseVersion), 'utf-8')
        key = 'latest.yml'
      }

      console.log(`   ${key} (${(body.length / 1024 / 1024).toFixed(1)} MB)`)
      await client.send(
        new PutObjectCommand({
          Bucket: BUCKET,
          Key: key,
          Body: body,
          ContentType: mimeType(e.absPath),
        }),
      )
    }

    console.log('')
    console.log('\u2705  Upload complete')
  }

  await pruneBucket(client, s3, releaseVersion, KEEP_VERSIONS)

  console.log('')
  console.log(`   Feed URL: ${PUBLIC_URL}/`)
  console.log(`   Check:    ${PUBLIC_URL}/latest.yml`)
  console.log(`   Policy:   only v{current} + v{previous} (max ${KEEP_VERSIONS}); rest deleted from R2`)
  console.log('')
}

// Only run CLI when executed directly (not when imported by unit tests).
const isDirectRun =
  process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href

if (isDirectRun) {
  main().catch((err) => {
    console.error('')
    console.error('\u274C Failed:', err?.message || err)
    process.exit(1)
  })
}
