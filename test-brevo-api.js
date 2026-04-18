const url = 'https://api.brevo.com/v3/smtp/email';
const apiKey = 'xsmtpsib-3cbad6989da25b9eb6d4a986ed654c04edbe2493dfda4d83dc8867c35ef36c5c-PIlYPEauNrXA2hlk';

fetch(url, {
  method: 'POST',
  headers: {
    'accept': 'application/json',
    'api-key': apiKey,
    'content-type': 'application/json'
  },
  body: JSON.stringify({
    sender: { name: 'Test', email: 'no-reply@imobileservicecenter.lk' },
    to: [{ email: 'test@example.com' }],
    subject: 'Test API Key',
    textContent: 'Testing if SMTP key works as API key'
  })
})
.then(res => res.json())
.then(console.log)
.catch(console.error);
