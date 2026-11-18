#!/usr/bin/env node
/**
 * CI helper: guarantee llama.rn's Android native libs are installed, with retries.
 *
 * Why this exists: llama.rn's postinstall (install/download-native-artifacts.js)
 * downloads every artifact in its manifest — Android jniLibs AND the iOS
 * xcframework, in parallel — straight from GitHub Releases, and a single 5xx
 * response aborts the whole `npm install`. During the v0.19.0 builds the
 * upstream endpoint sustained 5xx for every GitHub repository, so this script
 * tries upstream first, then falls back to the vendored, hash-verified copy
 * checked in at vendor/llama-rn/ (no network needed).
 *
 * CI builds arm64-v8a only; the manifest is stripped to the Android artifact
 * and the upstream SHA-256 check stays fully in charge wherever it applies.
 *
 * Usage: node scripts/ci-install-llama-android.js   (run after `npm ci --ignore-scripts`)
 */
const { execFileSync } = require('child_process')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const UPSTREAM_SHA256 = 'cda945a7c0ed075a0b028c1c3c6f5b668532eb18b069ecc4793ed7ca6cdb65ac'
const VENDORED_TARBALL = path.resolve('vendor', 'llama-rn', 'llama-rn-android-jni-libs.tar.gz')

const llamaRoot = path.resolve('node_modules', 'llama.rn')
const manifestPath = path.join(llamaRoot, 'install', 'native-artifacts.json')
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))

const before = (manifest.artifacts || []).length
manifest.artifacts = (manifest.artifacts || []).filter((artifact) =>
  /android/i.test(artifact.assetName),
)
if (manifest.artifacts.length === 0) {
  console.error(
    `llama.rn android-only install: no Android artifacts found in ${manifestPath}`,
  )
  process.exit(1)
}
console.log(
  `llama.rn android-only install: keeping ${manifest.artifacts.length}/${before} manifest artifacts`,
)
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))

function tryUpstream(attempts) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      execFileSync(
        process.execPath,
        [path.join(llamaRoot, 'install', 'download-native-artifacts.js')],
        { stdio: 'inherit' },
      )
      console.log('llama.rn: android native libs installed from upstream')
      return true
    } catch (_err) {
      console.error(
        `llama.rn upstream download: attempt ${attempt}/${attempts} failed`,
      )
      if (attempt < attempts) {
        execFileSync('sleep', ['30'])
      }
    }
  }
  return false
}

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}

function installFromVendor() {
  if (!fs.existsSync(VENDORED_TARBALL)) {
    console.error(`llama.rn vendored fallback missing: ${VENDORED_TARBALL}`)
    return false
  }
  try {
    const hash = sha256File(VENDORED_TARBALL)
    if (hash !== UPSTREAM_SHA256) {
      throw new Error(`vendored tarball hash mismatch: ${hash}`)
    }
    console.log('llama.rn: upstream endpoint down — installing the vendored, hash-verified copy')
    execFileSync('tar', ['-xzf', VENDORED_TARBALL, '-C', llamaRoot])
    fs.writeFileSync(
      path.join(llamaRoot, manifest.artifacts[0].markerPath),
      `${hash}\n`,
    )
    console.log(`llama.rn: android native libs installed from vendor (sha256 ${hash.slice(0, 12)}… verified)`)
    return true
  } catch (err) {
    console.error(`llama.rn vendor install failed (${err.message})`)
    return false
  }
}

if (!tryUpstream(2) && !installFromVendor()) {
  console.error('llama.rn android download: both upstream and the vendored copy failed')
  process.exit(1)
}

const librnllama = path.join(
  llamaRoot,
  'android',
  'src',
  'main',
  'jniLibs',
  'arm64-v8a',
  'librnllama.so',
)
if (!fs.existsSync(librnllama)) {
  console.error(`llama.rn android install: ${librnllama} missing after install`)
  process.exit(1)
}
console.log('llama.rn: android native libs ready')
