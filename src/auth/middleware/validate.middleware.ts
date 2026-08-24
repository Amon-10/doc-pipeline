import { Request, Response, NextFunction } from "express";

/**
 * Validates that a request to /register or /login includes both
 * email and password before hitting the database. Guards req.body
 * itself first — destructuring an undefined body (e.g. from a
 * missing Content-Type header) would otherwise throw before this
 * function's own field checks ever run.
 */
export const validateAuth = (req: Request, res: Response, next: NextFunction) => {
    if (!req.body) {
        res.status(400).json({ error: 'Request body is missing' });
        return;
    }

    const { email, password } = req.body;

    if (!email || !password) {
        res.status(400).json({ error: 'Email and password are required' });
        return;
    }

    next();
}