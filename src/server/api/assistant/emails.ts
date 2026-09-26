/**
 * Emails sent to assistant admin accounts.
 *
 * Same inline-HTML approach as buildAdminOtpEmail: no Resend template to keep
 * in sync, and it renders in every client that strips <style> blocks.
 */

const shell = (title: string, body: string) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
          <tr>
            <td style="background-color:#111827;padding:28px 32px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.3px;">I Mobile Service Center</h1>
              <p style="margin:4px 0 0;color:#9ca3af;font-size:11px;text-transform:uppercase;letter-spacing:2px;">Assistant Admin</p>
            </td>
          </tr>
          <tr><td style="padding:32px;">${body}</td></tr>
          <tr>
            <td style="padding:20px 32px;background-color:#f9fafb;border-top:1px solid #e5e7eb;text-align:center;">
              <p style="margin:0;font-size:11px;color:#9ca3af;">Automated message from I Mobile Service Center. Please do not reply.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

/**
 * Sent once, when an administrator creates the account. The link both proves
 * the address is real and switches the account from 'pending' to 'active' -
 * until it is followed, the password an administrator set cannot be used.
 */
export const buildAssistantVerificationEmail = (opts: {
  name: string
  verifyUrl: string
  expiresInHours: number
  loginUrl: string
}) => {
  const { name, verifyUrl, expiresInHours, loginUrl } = opts

  const html = shell(
    'Verify your assistant admin account',
    `
      <h2 style="margin:0 0 8px;font-size:18px;color:#111827;">Hello ${escapeHtml(name)}, confirm your email</h2>
      <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#4b5563;">
        An administrator created an assistant admin account for this address at I Mobile Service Center.
        Confirm the address to activate it — until you do, the account cannot sign in.
      </p>

      <div style="text-align:center;margin:0 0 24px;">
        <a href="${verifyUrl}" style="display:inline-block;background-color:#111827;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:14px 28px;border-radius:10px;">Confirm this email address</a>
      </div>

      <p style="margin:0 0 16px;font-size:12px;line-height:1.6;color:#6b7280;word-break:break-all;">
        If the button does not work, paste this link into your browser:<br />${verifyUrl}
      </p>

      <p style="margin:0 0 16px;font-size:13px;line-height:1.6;color:#4b5563;">
        This link expires in <strong>${expiresInHours} hours</strong> and can only be used once.
        Afterwards sign in at <a href="${loginUrl}" style="color:#111827;">${loginUrl}</a> with the password the
        administrator gave you. You will also be emailed a 6-digit code each time you sign in.
      </p>

      <p style="margin:0;font-size:13px;line-height:1.6;color:#b91c1c;">
        If you were not expecting this, ignore this email and tell the administrator — the account stays inactive.
      </p>
    `
  )

  const text = [
    'I Mobile Service Center - Assistant Admin',
    '',
    `Hello ${name},`,
    '',
    'An administrator created an assistant admin account for this email address.',
    'Confirm the address to activate it:',
    verifyUrl,
    '',
    `This link expires in ${expiresInHours} hours and can only be used once.`,
    `Afterwards sign in at ${loginUrl} with the password the administrator gave you.`,
    '',
    'If you were not expecting this, ignore this email and tell the administrator.',
  ].join('\n')

  return { html, text, subject: 'Confirm your assistant admin account - I Mobile Service Center' }
}

/** Login second factor. */
export const buildAssistantOtpEmail = (otp: string, expiresInMinutes: number) => {
  const spaced = otp.split('').join(' ')

  const html = shell(
    'Assistant admin login code',
    `
      <h2 style="margin:0 0 8px;font-size:18px;color:#111827;">Your login verification code</h2>
      <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#4b5563;">
        Someone signed in to the assistant admin panel with your email and password. Enter the code below to finish.
      </p>
      <div style="background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:24px;text-align:center;">
        <p style="margin:0 0 8px;font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#6b7280;">Verification code</p>
        <p style="margin:0;font-size:34px;font-weight:800;letter-spacing:10px;color:#111827;font-family:'Courier New',Courier,monospace;">${spaced}</p>
      </div>
      <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#4b5563;">
        This code expires in <strong>${expiresInMinutes} minutes</strong> and can only be used once.
      </p>
      <p style="margin:16px 0 0;font-size:13px;line-height:1.6;color:#b91c1c;">
        If this wasn't you, tell the administrator immediately — your password may be known to someone else.
      </p>
    `
  )

  const text = [
    'I Mobile Service Center - Assistant Admin',
    '',
    `Your login verification code is: ${otp}`,
    '',
    `This code expires in ${expiresInMinutes} minutes and can only be used once.`,
    "If this wasn't you, tell the administrator immediately.",
  ].join('\n')

  return { html, text, subject: `${otp} is your assistant admin login code - I Mobile Service Center` }
}

/** Sent when an administrator sets a new password on the account. */
export const buildAssistantPasswordResetEmail = (opts: { name: string; loginUrl: string }) => {
  const html = shell(
    'Your assistant admin password was changed',
    `
      <h2 style="margin:0 0 8px;font-size:18px;color:#111827;">Hello ${escapeHtml(opts.name)}, your password was reset</h2>
      <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#4b5563;">
        An administrator has set a new password on your assistant admin account and asked you to choose your own.
        The new password was given to you directly — it is never sent by email.
      </p>
      <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#4b5563;">
        Sign in at <a href="${opts.loginUrl}" style="color:#111827;">${opts.loginUrl}</a>. You will be asked to pick a
        new password before anything else is available, and every session you had open has been signed out.
      </p>
      <p style="margin:0;font-size:13px;line-height:1.6;color:#b91c1c;">
        If you did not expect this, contact the administrator before signing in.
      </p>
    `
  )

  const text = [
    'I Mobile Service Center - Assistant Admin',
    '',
    `Hello ${opts.name},`,
    '',
    'An administrator has set a new password on your assistant admin account.',
    `Sign in at ${opts.loginUrl} — you will be asked to choose your own password.`,
    'All of your open sessions have been signed out.',
    '',
    'If you did not expect this, contact the administrator before signing in.',
  ].join('\n')

  return { html, text, subject: 'Your assistant admin password was reset - I Mobile Service Center' }
}

/** Sent when an administrator approves or rejects a change request. */
export const buildAssistantRequestDecisionEmail = (opts: {
  name: string
  approved: boolean
  resource: string
  label: string
  action: string
  reviewNote?: string | null
}) => {
  const verdict = opts.approved ? 'approved' : 'declined'
  const colour = opts.approved ? '#047857' : '#b91c1c'

  const html = shell(
    `Your ${opts.action} request was ${verdict}`,
    `
      <h2 style="margin:0 0 8px;font-size:18px;color:${colour};">Request ${verdict}</h2>
      <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#4b5563;">
        Hello ${escapeHtml(opts.name)}, your request to <strong>${escapeHtml(opts.action)}</strong>
        the ${escapeHtml(opts.resource)} <strong>${escapeHtml(opts.label)}</strong> was ${verdict} by an administrator.
      </p>
      ${
        opts.reviewNote
          ? `<div style="background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin:0 0 16px;">
               <p style="margin:0 0 4px;font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#6b7280;">Note from the administrator</p>
               <p style="margin:0;font-size:14px;line-height:1.6;color:#111827;">${escapeHtml(opts.reviewNote)}</p>
             </div>`
          : ''
      }
      <p style="margin:0;font-size:13px;line-height:1.6;color:#4b5563;">
        ${opts.approved ? 'The change has been applied.' : 'Nothing was changed.'}
      </p>
    `
  )

  const text = [
    'I Mobile Service Center - Assistant Admin',
    '',
    `Your request to ${opts.action} the ${opts.resource} "${opts.label}" was ${verdict}.`,
    opts.reviewNote ? `Note from the administrator: ${opts.reviewNote}` : '',
    opts.approved ? 'The change has been applied.' : 'Nothing was changed.',
  ]
    .filter(Boolean)
    .join('\n')

  return { html, text, subject: `Your ${opts.action} request was ${verdict} - I Mobile Service Center` }
}

function escapeHtml(value: string) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
