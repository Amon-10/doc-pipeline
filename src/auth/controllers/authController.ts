import { db } from '../../db/client';
import { compare, hash } from "bcrypt-ts";
import { Request, Response, NextFunction } from 'express';
import jwt from "jsonwebtoken";

const jwt_secret = process.env.JWT_SECRET as string

/**
 * POST /register
 * Creates a new user account. Password is hashed with bcrypt before
 * storage — never stored or logged in plain text.
 */
export const register = async (req: Request, res: Response, next: NextFunction) => {
    const { email, password } = req.body;

    try {
        const hashedPassword = await hash(password, 10);

        const result = await db.query(
            `INSERT INTO users (email, password_hash)
             VALUES ($1, $2)
             RETURNING id, email`,
            [email, hashedPassword]
        );

        res.status(201).json(result.rows[0]);
    } catch (err: unknown) {
        // Postgres error code 23505 = unique constraint violation —
        // fired here specifically when the email already exists,
        // since users.email has a UNIQUE constraint
        if (typeof err === "object" && err !== null && "code" in err && err.code === "23505") {
            return res.status(409).json({ error: 'email already exists' })
        }
        next(err)
    }
}

/**
 * POST /login
 * Verifies credentials and returns a signed JWT on success.
 * The token carries only userId — no email or other user data —
 * kept minimal since anything in the payload is readable by
 * anyone holding the token, even though it can't be forged.
 */
export const login = async (req: Request, res: Response, next: NextFunction) => {
    const { email, password } = req.body;

    try {
        const result = await db.query(
            `SELECT * FROM users WHERE email = $1`,
            [email]
        )

        if (result.rowCount === 0) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }

        const user = result.rows[0];

        const isMatch = await compare(password, user.password_hash);

        if (!isMatch) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }

        // Same generic "Invalid credentials" message whether the email
        // doesn't exist or the password is wrong — avoids confirming
        // to an attacker which emails are registered
        const token = jwt.sign(
            { userId: user.id },
            jwt_secret,
            { expiresIn: '1h' }
        )

        res.json({ token })

    } catch (err) {
        next(err)
    }
}
