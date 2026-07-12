// =============================================================================
// afterPack (Windows) — stamp Orquestra product name + icon onto the exe.
//
// electron-builder.yml sets win.signAndEditExecutable: false so local packages
// work without the winCodeSign admin/symlink dance. That also skips rcedit, so
// the binary would keep Electron's FileDescription / default icon and show up
// in Windows Search as "Electron". This hook restores branding with the
// rcedit.exe shipped in electron-winstaller.
// =============================================================================

const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

/**
 * @param {import('electron-builder').AfterPackContext} context
 */
exports.default = async function afterPackWin(context) {
  if (context.electronPlatformName !== 'win32') return

  const appOutDir = context.appOutDir
  const productName = context.packager.appInfo.productFilename || 'Orquestra'
  const version = context.packager.appInfo.version
  const exe = path.join(appOutDir, `${productName}.exe`)
  if (!fs.existsSync(exe)) {
    console.warn(`[afterPack-win] exe not found: ${exe}`)
    return
  }

  const rceditCandidates = [
    path.join(__dirname, '..', 'node_modules', 'electron-winstaller', 'vendor', 'rcedit.exe'),
    path.join(
      __dirname,
      '..',
      'node_modules',
      'app-builder-lib',
      'node_modules',
      'electron-winstaller',
      'vendor',
      'rcedit.exe',
    ),
  ]
  const rcedit = rceditCandidates.find((p) => fs.existsSync(p))
  if (!rcedit) {
    console.warn('[afterPack-win] rcedit.exe not found — Windows branding left as Electron')
    return
  }

  const icon = path.join(__dirname, '..', 'build', 'icon.ico')
  if (!fs.existsSync(icon)) {
    console.warn(`[afterPack-win] icon missing: ${icon}`)
  }

  const args = [
    exe,
    '--set-version-string', 'ProductName', productName,
    '--set-version-string', 'FileDescription', productName,
    '--set-version-string', 'InternalName', productName,
    '--set-version-string', 'OriginalFilename', `${productName}.exe`,
    '--set-version-string', 'CompanyName', 'Orquestra',
    '--set-version-string', 'LegalCopyright', `© ${new Date().getFullYear()} Orquestra`,
    '--set-file-version', version,
    '--set-product-version', version,
  ]
  if (fs.existsSync(icon)) {
    args.push('--set-icon', icon)
  }

  console.log(`[afterPack-win] branding ${path.basename(exe)} as ${productName} v${version}`)
  execFileSync(rcedit, args, { stdio: 'inherit' })
}
