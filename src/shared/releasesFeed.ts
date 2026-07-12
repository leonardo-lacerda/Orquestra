// =============================================================================
// Public releases feed — Cloudflare R2 (electron-updater generic provider).
//
// Upload artifacts with: node scripts/publish-release.mjs
// Build publish URL must match this constant (see electron-builder.yml).
//
// Override at process start with env ORQUESTRA_RELEASES_URL (no trailing slash).
// Example public R2 URL:
//   https://pub-xxxxxxxxxxxxxxxx.r2.dev/orquestra-releases
// Example custom domain:
//   https://releases.yourdomain.com
// =============================================================================

function normalizeFeedBase(url: string): string {
  return String(url || '').trim().replace(/\/+$/, '')
}

/**
 * Public HTTPS base for latest.yml + installers.
 * MUST be publicly readable (R2 public bucket or custom domain).
 */
export const ORQUESTRA_RELEASES_FEED_URL = normalizeFeedBase(
  (typeof process !== 'undefined' && process.env.ORQUESTRA_RELEASES_URL) ||
    // Cloudflare R2 public development URL (bucket: orquestra-releases).
    // Override with ORQUESTRA_RELEASES_URL if you switch to a custom domain.
    'https://pub-1fcb183da34e46ba9cbbfa5cda797554.r2.dev',
)

/** true when the feed URL still has the setup placeholder. */
export function isReleasesFeedConfigured(): boolean {
  return !ORQUESTRA_RELEASES_FEED_URL.includes('PLACEHOLDER')
}
