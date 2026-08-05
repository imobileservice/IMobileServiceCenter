/**
 * Environment bootstrap. Import this FIRST, before anything that reads env vars.
 *
 * NODE_ENV arrives from a hosting dashboard, where a value picks up stray
 * whitespace very easily. Railway was serving this API with NODE_ENV set to
 * "production " - one trailing space - which looks completely correct in the
 * dashboard and fails every `=== 'production'` check in this server:
 *
 *   - auth cookies fell back to sameSite:'lax' + secure:false, and the browser
 *     will not send a Lax cookie to this API from imobileservicecenter.lk
 *     because that is a cross-site request, so no session ever restored;
 *   - the admin login decided it was running locally and returned the one-time
 *     code in its own response, which hands the second factor to the client.
 *
 * Trimming here repairs every existing `process.env.NODE_ENV === 'production'`
 * comparison in the codebase at once, so no call site has to remember this.
 *
 * dotenv is loaded here rather than in the entry point so that .env is applied
 * before the trim - ES module bodies run in import order, and this must be the
 * first one.
 */
import 'dotenv/config'

if (typeof process.env.NODE_ENV === 'string') {
  process.env.NODE_ENV = process.env.NODE_ENV.trim()
}

export const nodeEnv = () => process.env.NODE_ENV || 'development'

export const isProduction = () => nodeEnv() === 'production'
