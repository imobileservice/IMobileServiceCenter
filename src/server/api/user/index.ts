import { Router } from 'express'
import { asyncHandler } from '../utils/async-handler'
import { deleteAccountHandler } from './delete-account'

const router = Router()

// DELETE /api/user/delete-account
router.delete('/delete-account', asyncHandler(deleteAccountHandler))

export default router
