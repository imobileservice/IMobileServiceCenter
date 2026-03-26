import { Router } from 'express'
import { testEnvHandler } from '../test-env'

const router = Router()

router.get('/', testEnvHandler)

export default router

