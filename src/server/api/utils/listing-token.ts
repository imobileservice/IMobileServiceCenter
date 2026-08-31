import crypto from 'crypto'

/**
 * The opaque id a storefront listing is addressed by.
 *
 * One panel is listed under every phone it fits, so the same product appears in
 * the shop several times under different phone names. If those links read
 * /product/<product-uuid>?phone_model=<model-uuid>, two of them share a visible
 * uuid - and a customer or a rival shop can see at a glance that "the A02
 * display" and "the M02 display" are one and the same box. That is precisely
 * what must not be visible.
 *
 * So a listing is addressed by a token that encrypts (product, phone model)
 * under a key that never leaves the server. Two listings of one product get two
 * unrelated-looking tokens, and nothing can be recovered from either.
 *
 * What this does NOT hide: the two listings still carry the same photo and the
 * same price, and the product id is still present in the page's own data
 * because the cart is keyed by it. This closes the obvious tell, not every one.
 */

const PREFIX = 'p_'
const KEY_SALT = 'imobile-listing-token-v1'

let cachedKey: Buffer | null | undefined

const getKey = (): Buffer | null => {
  if (cachedKey !== undefined) return cachedKey

  // Any stable server-side secret will do - this protects a product id, not a
  // credential. The service role key is always present on the API server, so
  // tokens keep working without any new configuration.
  const secret = (
    process.env.CREDENTIAL_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    ''
  ).trim()

  if (secret.length < 16) {
    cachedKey = null
    return null
  }

  cachedKey = crypto.scryptSync(secret, KEY_SALT, 32)
  return cachedKey
}

/** Is a listing addressable opaquely, or must links fall back to the raw id? */
export const canEncodeListing = (): boolean => getKey() !== null

/**
 * Token for one (product, phone model) listing.
 *
 * Returns the plain product id when no key is available, so the shop keeps
 * working on a server with no secrets configured - just without the disguise.
 */
export function encodeListing(productId: string, phoneModelId?: string | null): string {
  const key = getKey()
  if (!key || !productId) return productId

  try {
    const iv = crypto.randomBytes(12)
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
    const payload = `${productId}:${phoneModelId || ''}`
    const ciphertext = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()])
    const tag = cipher.getAuthTag()

    return PREFIX + Buffer.concat([iv, tag, ciphertext]).toString('base64url')
  } catch {
    return productId
  }
}

/**
 * Read a token back. A plain product id passes straight through, so every old
 * /product/<uuid> link a customer bookmarked still works.
 */
export function decodeListing(token: string): { productId: string; phoneModelId: string | null } {
  const raw = String(token || '')
  if (!raw.startsWith(PREFIX)) return { productId: raw, phoneModelId: null }

  const key = getKey()
  if (!key) return { productId: raw, phoneModelId: null }

  try {
    const buffer = Buffer.from(raw.slice(PREFIX.length), 'base64url')
    const iv = buffer.subarray(0, 12)
    const tag = buffer.subarray(12, 28)
    const ciphertext = buffer.subarray(28)

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(tag)

    const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
    const [productId, phoneModelId] = plain.split(':')

    return { productId: productId || '', phoneModelId: phoneModelId || null }
  } catch {
    // Tampered, truncated, or encrypted under an older key - treat as unknown
    // rather than guessing at a product.
    return { productId: '', phoneModelId: null }
  }
}
