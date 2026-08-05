/**
 * Admin login verification code email.
 * Plain inline HTML so it renders without depending on a Resend template.
 */

export const buildAdminOtpEmail = (otp: string, expiresInMinutes: number) => {
    const spacedOtp = otp.split('').join(' ')

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Admin login verification code</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
          <tr>
            <td style="background-color:#111827;padding:28px 32px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.3px;">I Mobile Service Center</h1>
              <p style="margin:4px 0 0;color:#9ca3af;font-size:11px;text-transform:uppercase;letter-spacing:2px;">Admin Panel</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <h2 style="margin:0 0 8px;font-size:18px;color:#111827;">Your login verification code</h2>
              <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#4b5563;">
                Someone signed in to the admin panel with your email and password. Enter the code below to finish logging in.
              </p>

              <div style="background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:24px;text-align:center;">
                <p style="margin:0 0 8px;font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#6b7280;">Verification code</p>
                <p style="margin:0;font-size:34px;font-weight:800;letter-spacing:10px;color:#111827;font-family:'Courier New',Courier,monospace;">${spacedOtp}</p>
              </div>

              <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#4b5563;">
                This code expires in <strong>${expiresInMinutes} minutes</strong> and can only be used once.
              </p>
              <p style="margin:16px 0 0;font-size:13px;line-height:1.6;color:#b91c1c;">
                If this wasn't you, do not share this code — change the admin password immediately.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px;background-color:#f9fafb;border-top:1px solid #e5e7eb;text-align:center;">
              <p style="margin:0;font-size:11px;color:#9ca3af;">
                Automated message from I Mobile Service Center. Please do not reply.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

    const text = [
        'I Mobile Service Center - Admin Panel',
        '',
        `Your admin login verification code is: ${otp}`,
        '',
        `This code expires in ${expiresInMinutes} minutes and can only be used once.`,
        "If this wasn't you, change the admin password immediately.",
    ].join('\n')

    return { html, text, subject: `${otp} is your admin login code - I Mobile Service Center` }
}
