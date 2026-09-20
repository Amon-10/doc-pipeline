"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.login = exports.register = void 0;
const client_1 = require("../../db/client");
const bcrypt_ts_1 = require("bcrypt-ts");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const jwt_secret = process.env.JWT_SECRET;
/**
 * POST /register
 * Creates a new user account. Password is hashed with bcrypt before
 * storage — never stored or logged in plain text.
 */
const register = async (req, res, next) => {
    const { email, password } = req.body;
    try {
        const hashedPassword = await (0, bcrypt_ts_1.hash)(password, 10);
        const result = await client_1.db.query(`INSERT INTO users (email, password_hash)
             VALUES ($1, $2)
             RETURNING id, email`, [email, hashedPassword]);
        res.status(201).json(result.rows[0]);
    }
    catch (err) {
        // Postgres error code 23505 = unique constraint violation —
        // fired here specifically when the email already exists,
        // since users.email has a UNIQUE constraint
        if (typeof err === "object" && err !== null && "code" in err && err.code === "23505") {
            return res.status(409).json({ error: 'email already exists' });
        }
        next(err);
    }
};
exports.register = register;
/**
 * POST /login
 * Verifies credentials and returns a signed JWT on success.
 * The token carries only userId — no email or other user data —
 * kept minimal since anything in the payload is readable by
 * anyone holding the token, even though it can't be forged.
 */
const login = async (req, res, next) => {
    const { email, password } = req.body;
    try {
        const result = await client_1.db.query(`SELECT * FROM users WHERE email = $1`, [email]);
        if (result.rowCount === 0) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }
        const user = result.rows[0];
        const isMatch = await (0, bcrypt_ts_1.compare)(password, user.password_hash);
        if (!isMatch) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }
        // Same generic "Invalid credentials" message whether the email
        // doesn't exist or the password is wrong — avoids confirming
        // to an attacker which emails are registered
        const token = jsonwebtoken_1.default.sign({ userId: user.id }, jwt_secret, { expiresIn: '1h' });
        res.json({ token });
    }
    catch (err) {
        next(err);
    }
};
exports.login = login;
