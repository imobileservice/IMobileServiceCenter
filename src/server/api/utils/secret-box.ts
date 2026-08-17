import crypto from 'crypto'

/**
 * Two-way encryption for the few secrets the office has to be able to read back.
 *
 * This is NOT how account passwords are stored. Everything that logs in - admins,
 * cashiers, the shop portal - is scrypt-hashed by ../utils/password, which is a
 * one-way function: there is no "decrypt", by design, so a stolen database does
 * not hand over the passwords.
 *
 * The shop portal has one extra requirement on top of that. A shopkeeper who
 * loses their password rings the office, and the office needs to be able to read
 * it back to them rather than reset it and re-send a card every time. So a
 * second, reversible copy is kept beside the hash - encrypted with AES-256-GCM
 * under a key that lives in the environment, never in the database.
 *
 * What that buys and what it costs:
 *  - the database alone is still useless: no key, no plaintext
 *  - the login path never touches this copy; verifyPassword still checks the hash
 *  - but anyone holding BOTH the database and the key can read every shop
 *    password, so the key belongs in the host's secret store and nowhere else
 *
 * That trade is deliberate and it is limited to shop-portal logins, which order
 * stock and take no payment. It must not be extended to admin or cashier
 * accounts.
 */

const VERSION = 'v1'
/** Fixed, and only ever mixed with the env secret - it is a domain separator, not a password salt. */
const KEY_SALT = 'imobile-credential-box-v1'
const MIN_SECRET_LENGTH = 16

let cachedKey: Buffer | null | undefined
let warned = false

const getKey = (): Buffer | null => {
  if (cachedKey !== undefined) return cachedKey

  const secret = (process.env.CREDENTIAL_SECRET || process.env.SUPPLIER_PORTAL_SECRET || '').trim()

  if (secret.length < MIN_SECRET_LENGTH) {
    if (!warned) {
      warned = true
      console.warn(
        `[SecretBox] CREDENTIAL_SECRET is not set (or is under ${MIN_SECRET_LENGTH} characters). ` +
          'Shop portal passwords will be hashed as usual but cannot be read back to the office.'
      )
    }
    cachedKey = null
    return null
  }

  cachedKey = crypto.scryptSync(secret, KEY_SALT, 32)
  return cachedKey
}

/** False when no key is configured; callers degrade instead of failing. */
export const isSecretBoxReady = () => getKey() !== null

/** `v1$iv$tag$ciphertext`, all base64. Null when there is no key to encrypt under. */
export const encryptSecret = (plain: string): string | null => {
  const key = getKey()
  if (!key || !plain) return null

  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  return [VERSION, iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join('$')
}

/**
 * Null for anything that cannot be read: no key, nothing stored, a blob written
 * under a different key, or one that has been tampered with (GCM catches that).
 * The caller cannot tell those apart on purpose - none of them are recoverable.
 */
export const decryptSecret = (blob: string | null | undefined): string | null => {
  const key = getKey()
  if (!key || !blob) return null

  const parts = String(blob).split('$')
  if (parts.length !== 4 || parts[0] !== VERSION) return null

  try {
    const [, iv, tag, ciphertext] = parts
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'))
    decipher.setAuthTag(Buffer.from(tag, 'base64'))
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64')), decipher.final()]).toString('utf8')
  } catch {
    return null
  }
}
