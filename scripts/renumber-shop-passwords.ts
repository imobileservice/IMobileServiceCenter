/**
 * Renumbers every shop's portal password to a sequential code.
 *
 * The office wants shop logins to read MEG-01, MEG-02, MEG-03... in the order
 * the shops were registered, rather than the ad-hoc passwords typed in when
 * each shop was added. Numbering follows created_at ascending, which is the
 * same order the Shops tab now lists them in, so the Nth card on the page has
 * the Nth code.
 *
 * The password is written the same way PUT /api/inventory/suppliers/:id/portal
 * writes it: scrypt hash in portal_password (what actually logs in) plus an
 * AES-GCM copy in portal_password_enc (what the office reads back on the Share
 * login card). Both are replaced together so the card can never show a stale
 * code that no longer works.
 *
 * Usage:
 *   npx tsx scripts/renumber-shop-passwords.ts                 # dry run
 *   npx tsx scripts/renumber-shop-passwords.ts --apply         # write
 *   npx tsx scripts/renumber-shop-passwords.ts --apply --prefix=PAD
 *   npx tsx scripts/renumber-shop-passwords.ts --apply --start=1
 *
 * THIS CHANGES LIVE LOGINS. Every shop's current password stops working the
 * moment it runs, so re-share the login cards afterwards. The previous values
 * are backed up to scripts/backups/ first.
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'
import { hashPassword } from '../src/server/api/utils/password'
import { encryptSecret, isSecretBoxReady } from '../src/server/api/utils/secret-box'

dotenv.config({ quiet: true })

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const argValue = (flag: string, fallback: string) => {
  const match = process.argv.find((a) => a.startsWith(`--${flag}=`))
  return match ? match.split('=').slice(1).join('=') : fallback
}

const APPLY = process.argv.includes('--apply')
const PREFIX = argValue('prefix', 'MEG').trim().toUpperCase()
const START = Number.parseInt(argValue('start', '1'), 10)

/** MEG-01 .. MEG-09 stay two digits; the sequence widens on its own past 99. */
const codeFor = (position: number, total: number) => {
  const width = Math.max(2, String(total).length)
  return `${PREFIX}-${String(position).padStart(width, '0')}`
}

async function main() {
  console.log(APPLY ? '=== APPLY MODE - portal passwords will be rewritten ===' : '=== DRY RUN - no changes written ===')
  console.log('')

  if (!isSecretBoxReady()) {
    console.warn(
      'WARNING: CREDENTIAL_SECRET is not configured, so the readable copy cannot be\n' +
      '         written. Logins would still work but the Share login card could not\n' +
      '         show the password. Set CREDENTIAL_SECRET before applying.'
    )
    console.log('')
    if (APPLY) process.exit(1)
  }

  const { data, error } = await supabase
    .from('inv_suppliers')
    .select('id, name, email, portal_enabled, portal_password, portal_password_enc, created_at')
    .order('created_at', { ascending: true })
    .order('name', { ascending: true })

  if (error) {
    console.error('Failed to load shops:', error.message)
    process.exit(1)
  }

  const shops = data || []
  if (shops.length === 0) {
    console.log('No shops found.')
    return
  }

  const plan = shops.map((shop, index) => ({
    id: shop.id as string,
    name: String(shop.name),
    email: String(shop.email || ''),
    enabled: Boolean(shop.portal_enabled),
    code: codeFor(START + index, START + shops.length - 1),
  }))

  console.log(`${shops.length} shops, numbered by the order they were added:`)
  console.log('')
  console.log('  #   NEW CODE   SHOP                          PORTAL')
  for (const [index, entry] of plan.entries()) {
    console.log(
      `  ${String(index + 1).padStart(2)}  ${entry.code.padEnd(10)} ${entry.name.padEnd(29)} ${entry.enabled ? 'enabled' : 'disabled'}`
    )
  }
  console.log('')

  if (!APPLY) {
    console.log('Dry run complete. Re-run with --apply to write these passwords.')
    console.log('Every shop\'s current password stops working when you do.')
    return
  }

  // Keep the previous credential columns so a bad run can be put back
  const backupDir = path.join(process.cwd(), 'scripts', 'backups')
  fs.mkdirSync(backupDir, { recursive: true })
  const backupFile = path.join(backupDir, `shop-portal-passwords-before-${Date.now()}.json`)
  fs.writeFileSync(
    backupFile,
    JSON.stringify(
      shops.map((shop) => ({
        id: shop.id,
        name: shop.name,
        portal_password: shop.portal_password,
        portal_password_enc: shop.portal_password_enc,
      })),
      null,
      2
    )
  )
  console.log(`Backup written: ${backupFile}`)
  console.log('')

  let updated = 0
  let failed = 0

  for (const entry of plan) {
    const { error: updateError } = await supabase
      .from('inv_suppliers')
      .update({
        portal_password: hashPassword(entry.code),
        portal_password_enc: encryptSecret(entry.code),
        updated_at: new Date().toISOString(),
      })
      .eq('id', entry.id)

    if (updateError) {
      failed++
      console.error(`  FAILED ${entry.name}: ${updateError.message}`)
    } else {
      updated++
    }
  }

  console.log('')
  console.log(`Updated ${updated} shops, ${failed} failures.`)
  console.log('Re-share the login cards - the old passwords no longer work.')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
