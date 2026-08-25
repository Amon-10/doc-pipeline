import { Router } from "express";
import { register, login } from '../controllers/authController';
import { validateAuth } from '../middleware/validate.middleware';
import { authLimiter } from "../../middleware/rateLimit.middleware";

const router = Router()

// validateAuth runs first on both routes — rejects requests missing
// email/password before hitting the database at all
router.post('/register', authLimiter, validateAuth, register)
router.post('/login', authLimiter, validateAuth, login)

export default router