// =============================================================================
// publish-release.mjs — upload build artifacts to Supabase Storage
// for the auto-updater (generic provider).
//
// Usage:
//   node scripts/publish-release.mjs [--bucket orquestra-releases]
//
// Environment:
//   SUPABASE_URL       — Supabase project URL (default: from electron-builder.yml)
//   SUPABASE_SERVICE_KEY — service_role key for bucket management + upload
//
// Bucket must be set to public (Downloads) in Supabase Dashboard > Storage.
// The service key is only used for uploads — the public URL serves downloads.
// =============================================================================

import { execSync } from 'child_process'
import { createReadStream } from 'fs'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join, basename } from 'path'
import { Readable } from 'stream'

const ROOT = new URL('..', import.meta.url).pathname

// ── Config ──────────────────────────────────────────────────────────────────
const SUPABASE_URL =
  process.env.SUPABASE_URL || 'https://yktidzsrldsksvaubagt.supabase.co'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
const BUCKET = process.argv.includes('--bucket')
  ? process.argv[process.argv.indexOf('--bucket') + 1]
  : 'orquestra-releases'

const RELEASE_DIR = join(ROOT, 'release')

if (!SERVICE_KEY) {
  console.error('❌ SUPABASE_SERVICE_KEY env var is required')
  console.error('   Get it from Supabase Dashboard > Project Settings > API > service_role key')
  process.exit(1)
}

// ── Helpers ─────────────────────────────────────────────────────────────────

async function supFetch(path, options = {}) {
  const url = `${SUPABASE_URL}/storage/v1${path}`
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SERVICE_KEY}`,
      ...options.headers,
    },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Supabase API error ${res.status}: ${body}`)
  }
  return res
}

async function ensureBucket(name) {
  // Check if it exists
  const res = await supFetch('/buckets')
  const buckets = await res.json()
  if (buckets.some((b) => b.id === name)) {
    console.log(`ℹ️  Bucket "${name}" already exists`)
    return
  }
  // Create it as public
  await supFetch('/buckets', {
    method: 'POST',
    body: JSON.stringify({
      id: name,
      name,
      public: true,
      file_size_limit: 1048576000, // 1 GB
      allowed_mime_types: [
        'application/x-yaml',
        'application/octet-stream',
        'application/json',
        'application/x-msdownload',
        'application/x-msdos-program',
        'application/x-zip-compressed',
        'application/zip',
        'application/x-rar-compressed',
        'application/gzip',
      ],
    }),
  })
  // Set public RLS policy
  await supFetch(`/buckets/${name}/public`, { method: 'PUT' })
  console.log(`✅  Created bucket "${name}" (public)`)
}

async function uploadFile(filePath, destPath) {
  const content = readFileSync(filePath)
  const mime = mimeType(filePath)
  console.log(`   Uploading ${basename(filePath)} → ${destPath} (${(content.length / 1024 / 1024).toFixed(1)} MB)`)

  const res = await fetch(
    `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${destPath}`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'Content-Type': mime,
        'x-upsert': 'true',
      },
      body: content,
    }
  )
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Upload failed for ${destPath}: ${res.status} ${body}`)
  }
}

function mimeType(filePath) {
  const ext = filePath.split('.').pop().toLowerCase()
  const map = {
    yml: 'application/x-yaml',
    yaml: 'application/x-yaml',
    exe: 'application/x-msdownload',
    zip: 'application/zip',
    blockmap: 'application/octet-stream',
    dmg: 'application/x-apple-diskimage',
    'tar.gz': 'application/gzip',
    AppImage: 'application/octet-stream',
    deb: 'application/vnd.debian.binary-package',
  }
  return map[ext] || 'application/octet-stream'
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('')
  console.log('=== Publish Release to Supabase Storage ===')
  console.log(`   Bucket: ${BUCKET}`)
  console.log(`   From:   ${RELEASE_DIR}`)
  console.log('')

  // Check the release directory
  const files = readdirSync(RELEASE_DIR).filter((f) => {
    if (f.endsWith('.json') || f === 'builder-debug.yml') return false
    if (statSync(join(RELEASE_DIR, f)).isDirectory()) return false
    return true
  })

  if (files.length === 0) {
    console.error('❌ No release files found in release/')
    console.error('   Run "npm run package:win" first')
    process.exit(1)
  }

  console.log(`📦 Found ${files.length} artifacts:`)
  for (const f of files) {
    const size = statSync(join(RELEASE_DIR, f)).size
    console.log(`   - ${f} (${(size / 1024 / 1024).toFixed(1)} MB)`)
  }
  console.log('')

  // Ensure bucket exists
  console.log('🔧 Ensuring bucket exists...')
  await ensureBucket(BUCKET)

  // Upload each file to the bucket root
  console.log('')
  console.log('⬆️  Uploading artifacts...')
  for (const f of files) {
    const filePath = join(RELEASE_DIR, f)
    await uploadFile(filePath, f)
  }

  console.log('')
  console.log('✅  All artifacts uploaded!')
  console.log(`   Public URL: ${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/`)
  console.log('')
  console.log('📋 The auto-updater will check this URL for the latest.yml')
  console.log('')
}

main().catch((err) => {
  console.error('')
  console.error('❌ Failed:', err.message)
  process.exit(1)
})
