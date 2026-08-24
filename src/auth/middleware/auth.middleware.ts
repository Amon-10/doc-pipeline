import { Response, Request, NextFunction } from "express";
import jwt from "jsonwebtoken";

const jwt_secret = process.env.JWT_SECRET as string;

// require auth with jwt
const requireAuth = (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        res.status(401).json({ error: 'Missing Authorization header' });
        return;
    }

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