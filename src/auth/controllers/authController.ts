import { db } from '../../db/client';
import bcrypt from "bcrypt-ts";
import { Request, Response, NextFunction } from 'express';
import jwt from "jsonwebtoken";

const jwt_secret = process.env.JWT_SECRET as string

// REGISTER
export const register = async (req: Request, res: Response, next: NextFunction) => {
    const { email, password } = req.body;

    try {
        const hashedPassword = await bcrypt.hash(password, 10);

        const result = await db.query(
            `INSERT INTO users (email, password_hash)
             VALUES ($1, $2)
             RETURNING id, email`,
            [email, hashedPassword]
        );

        res.status(201).json(result.rows[0]);
    } catch (err: unknown) {
        if (typeof err === "object" && err !== null && "code" in err && err.code === "23505") {
            return res.status(409).json({ error: 'email already exists' })
        }
        next(err)
    }
}

// LOGIN
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

        const isMatch = await bcrypt.compare(password, user.password_hash);

        if (!isMatch) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }

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