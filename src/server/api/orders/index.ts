import { Router } from 'express'
import { sendWhatsAppHandler } from './whatsapp'
import { createOrderHandler } from './create'
import { getUserOrdersHandler } from './list'
import { sendInvoiceHandler } from './send-invoice'
import { downloadInvoiceHandler } from './download-invoice'
import { checkOrderNumberHandler } from './check-number'

const router = Router()

router.get('/', getUserOrdersHandler)
router.post('/', createOrderHandler)
router.post('/whatsapp', sendWhatsAppHandler)
router.post('/:id/send-invoice', sendInvoiceHandler)
router.get('/:id/download', downloadInvoiceHandler)
router.get('/check-number/:number', checkOrderNumberHandler)

export default router
