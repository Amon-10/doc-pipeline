import "express";

/**
 * Type augmentation for Express's Request object. userId is set by
 * requireAuth middleware after verifying a JWT — declared here so
 * TypeScript recognizes req.userId as valid everywhere in the project,
 * not just in files that happen to redefine it locally.
 */
declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}