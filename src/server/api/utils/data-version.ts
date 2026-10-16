import { Request, Response, NextFunction } from 'express'

// Writes that never change stock, orders or catalogue data. A read sent as POST
// must be listed here, or every screen polling it would refresh in a loop.
const IGNORED_WRITES = /(login|logout|signin|signup|signout|verify|resend|password|security-event|product-search|customer-models|\/email|whatsapp|send-invoice|wishlist|\/addresses|\/cart|\/profile)/i

let version = Date.now()

export function trackDataVersion(req: Request, res: Response, next: NextFunction) {
  if (req.method !== 'GET' && req.method !== 'HEAD' && !IGNORED_WRITES.test(req.path)) {
    res.on('finish', () => {
      if (res.statusCode < 400) version = Date.now()
    })
  }
  next()
}

export function dataVersionHandler(_req: Request, res: Response) {
  res.json({ version })
}
