import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { Request } from "express";

/**
 * Limits uploads per authenticated user rather than per IP — multiple
 * legitimate users can share an IP (offices, NAT), but each user's own
 * OpenAI-cost-generating activity should be capped individually. Falls
 * back to IP only in the unlikely case req.userId isn't set.
 */
export const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 uploads per window
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => req.userId || ipKeyGenerator(req.ip || "unknown"),
  message: { error: "Too many uploads. Please wait before uploading again." },
});

/**
 * Limits register/login attempts per IP — this runs before a user is
 * authenticated, so there's no userId to key on yet. Protects against
 * brute-force password guessing and account enumeration.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Please try again later." },
});
