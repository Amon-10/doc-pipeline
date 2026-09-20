"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const jwt_secret = process.env.JWT_SECRET;
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
const requireAuth = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        res.status(401).json({ error: 'Missing Authorization header' });
        return;
    }
    // Authorization header format is "Bearer <token>" — split on space
    // and take the second part to get just the token itself
    const token = authHeader.split(' ')[1];
    if (token == null) {
        res.status(401).json({ error: 'token is null' });
        return;
    }
    try {
        const authPayload = jsonwebtoken_1.default.verify(token, jwt_secret);
        req.userId = authPayload.userId;
        next();
    }
    catch (err) {
        res.status(401).json({ error: 'Invalid or expired token' });
    }
};
exports.default = requireAuth;
