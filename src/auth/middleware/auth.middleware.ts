import { Response, Request, NextFunction } from "express";
import jwt from "jsonwebtoken";

const jwt_secret = process.env.JWT_SECRET as string;

/**
 * Express middleware that verifies a JWT from the Authorization header
 * and attaches the authenticated user's id to req.userId for downstream
 * routes to use. Rejects the request with 401 if the token is missing,
 * malformed, or invalid/expired.
 *
 * req.userId is the only trustworthy source of "who is making this
 * request" — never take identity from the request body, since a client
 * could type any value there.
 */
const requireAuth = (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        res.status(401).json({ error: 'Missing Authorization header' });
        return;
    }

    // Authorization header format is "Bearer <token>" — split on space
    // and take the second part to get just the token itself
    const token = authHeader.split(' ')[1];

    if (token == null) {
        res.status(401).json({error: 'token is null'});
        return;
    }
    
    try {
        const authPayload = jwt.verify(token, jwt_secret) as { userId: string };
        req.userId = authPayload.userId;
        next();
    } catch (err) {
        res.status(401).json({ error: 'Invalid or expired token' });
    }
}

export default requireAuth