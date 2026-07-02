import crypto from 'crypto'

const SCRYPT_PREFIX = 'scrypt'

function timingSafeStringEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)

  if (leftBuffer.length !== rightBuffer.length) {
    return false
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer)
}

export function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(password, salt, 64).toString('hex')
  return `${SCRYPT_PREFIX}$${salt}$${hash}`
}

export function verifyPassword(password: string, storedPassword: string | null | undefined) {
  if (!storedPassword) {
    return false
  }

  const parts = storedPassword.split('$')
  if (parts.length === 3 && parts[0] === SCRYPT_PREFIX) {
    const [, salt, storedHash] = parts
    const storedBuffer = Buffer.from(storedHash, 'hex')
    const inputBuffer = crypto.scryptSync(password, salt, storedBuffer.length)

    if (storedBuffer.length !== inputBuffer.length) {
      return false
    }

    return crypto.timingSafeEqual(storedBuffer, inputBuffer)
  }

  return timingSafeStringEqual(password, storedPassword)
}
