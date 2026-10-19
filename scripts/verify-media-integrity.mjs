#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import https from 'node:https'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CATALOGUE_MEDIA = path.join(ROOT, 'catalogue/media')
const ANDROID_STAGED = path.join(ROOT, 'frontend/android/app/src/main/assets/public/exercise-media')
const IOS_STAGED = path.join(ROOT, 'frontend/ios/App/App/public/exercise-media')
const APK_PATH = path.join(ROOT, 'release/APEX-Fitness-Android.apk')
const CDN_BASE = 'https://duartesantos8.github.io/openGym/exercise-media/'

const SAMPLES = [
  'still/0001.webp', 'clip/0001.mp4',
  'still/0002.webp', 'clip/0002.mp4',
  'still/0007.webp', 'clip/0007.mp4',
  'still/4209.webp', 'clip/4209.mp4',
  'still/6554.webp', 'clip/6554.mp4'
]

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex')
}

function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'APEX-Integrity-Audit/1.0' } }, res => {
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`))
      }
      const chunks = []
      res.on('data', d => chunks.push(d))
      res.on('end', () => resolve(Buffer.concat(chunks)))
    }).on('error', reject)
  })
}

function readApkEntry(apkFile, entryPath) {
  try {
    return execSync(`unzip -p "${apkFile}" "${entryPath}"`, { maxBuffer: 10 * 1024 * 1024 })
  } catch (err) {
    return null
  }
}

async function run() {
  console.log('='.repeat(80))
  console.log('APEX FITNESS — COMPREHENSIVE MEDIA INTEGRITY & NO-COMPRESSION AUDIT')
  console.log('='.repeat(80))

  let failures = 0

  for (const rel of SAMPLES) {
    const localPath = path.join(CATALOGUE_MEDIA, rel)
    if (!fs.existsSync(localPath)) {
      console.error(`✗ Local file missing: ${localPath}`)
      failures++
      continue
    }

    const localBytes = fs.readFileSync(localPath)
    const localHash = sha256(localBytes)
    const localSize = localBytes.length

    // 1. Android Staged Check
    const androidPath = path.join(ANDROID_STAGED, rel)
    let androidMatch = false
    if (fs.existsSync(androidPath)) {
      const androidBytes = fs.readFileSync(androidPath)
      const androidHash = sha256(androidBytes)
      androidMatch = (androidHash === localHash && androidBytes.length === localSize)
    }

    // 2. iOS Staged Check
    const iosPath = path.join(IOS_STAGED, rel)
    let iosMatch = false
    if (fs.existsSync(iosPath)) {
      const iosBytes = fs.readFileSync(iosPath)
      const iosHash = sha256(iosBytes)
      iosMatch = (iosHash === localHash && iosBytes.length === localSize)
    }

    // 3. APK Embedded Check
    let apkMatch = false
    if (fs.existsSync(APK_PATH)) {
      const apkBytes = readApkEntry(APK_PATH, `assets/public/exercise-media/${rel}`)
      if (apkBytes) {
        const apkHash = sha256(apkBytes)
        apkMatch = (apkHash === localHash && apkBytes.length === localSize)
      }
    }

    // 4. Remote CDN Check
    let cdnMatch = false
    let cdnSize = 0
    try {
      const cdnBytes = await fetchBuffer(CDN_BASE + rel)
      cdnSize = cdnBytes.length
      const cdnHash = sha256(cdnBytes)
      cdnMatch = (cdnHash === localHash && cdnSize === localSize)
    } catch (err) {
      console.error(`CDN Fetch error for ${rel}:`, err.message)
    }

    const allMatched = androidMatch && iosMatch && apkMatch && cdnMatch
    if (!allMatched) failures++

    console.log(`[${allMatched ? 'PASS' : 'FAIL'}] ${rel}`)
    console.log(`       Size: ${localSize} B | SHA-256: ${localHash.slice(0, 16)}...`)
    console.log(`       Android Staged: ${androidMatch ? 'MATCH' : 'MISMATCH'}`)
    console.log(`       iOS Staged:     ${iosMatch ? 'MATCH' : 'MISMATCH'}`)
    console.log(`       APK Bundled:    ${apkMatch ? 'MATCH' : 'MISMATCH'}`)
    console.log(`       CDN Upstream:   ${cdnMatch ? 'MATCH' : 'MISMATCH'} (${cdnSize} B)`)
    console.log('-'.repeat(80))
  }

  // 5. Video parameters on 4209.mp4 and 0001.mp4 via ffprobe
  console.log('\nInspecting Video Codecs & Stream Parameters:')
  for (const clip of ['clip/0001.mp4', 'clip/4209.mp4']) {
    const p = path.join(CATALOGUE_MEDIA, clip)
    try {
      const probeOut = execSync(`ffprobe -v error -show_entries stream=codec_name,width,height,r_frame_rate,bit_rate -of json "${p}"`).toString()
      const probe = JSON.parse(probeOut)
      const st = probe.streams[0]
      console.log(`  ✓ ${clip}: Codec=${st.codec_name}, Dimensions=${st.width}x${st.height}, FPS=${st.r_frame_rate}, Bitrate=${st.bit_rate}`)
    } catch (err) {
      console.log(`  ! ffprobe failed for ${clip}: ${err.message}`)
    }
  }

  // 6. Test HTTP Range request on CDN
  console.log('\nVerifying Remote CDN HTTP Range Seeking Support:')
  try {
    const rangeOut = execSync('curl -s -r 0-1023 -i "https://duartesantos8.github.io/openGym/exercise-media/clip/4209.mp4" | head -n 15').toString()
    const is206 = rangeOut.includes('HTTP/2 206') || rangeOut.includes('HTTP/1.1 206')
    const hasRanges = rangeOut.toLowerCase().includes('accept-ranges: bytes')
    const hasRangeHeader = rangeOut.toLowerCase().includes('content-range: bytes 0-1023/52852')
    console.log(`  ✓ HTTP Status: ${is206 ? '206 Partial Content (OK)' : 'FAIL'}`)
    console.log(`  ✓ Accept-Ranges: ${hasRanges ? 'Supported' : 'Missing'}`)
    console.log(`  ✓ Content-Range: ${hasRangeHeader ? 'Valid (0-1023/52852)' : 'Missing'}`)
    if (!is206 || !hasRanges || !hasRangeHeader) failures++
  } catch (err) {
    console.error('Range request check failed:', err.message)
    failures++
  }

  console.log('\n' + '='.repeat(80))
  if (failures === 0) {
    console.log('ALL MEDIA INTEGRITY & NO-COMPRESSION CHECKS PASSED (100% IDENTICAL)')
    console.log('='.repeat(80))
    process.exit(0)
  } else {
    console.error(`FAILED: ${failures} checks encountered discrepancies`)
    console.log('='.repeat(80))
    process.exit(1)
  }
}

run().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
