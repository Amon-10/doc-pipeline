"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authController_1 = require("../controllers/authController");
const validate_middleware_1 = require("../middleware/validate.middleware");
const rateLimit_middleware_1 = require("../../middleware/rateLimit.middleware");
const router = (0, express_1.Router)();
// validateAuth runs first on both routes — rejects requests missing
// email/password before hitting the database at all
router.post('/register', rateLimit_middleware_1.authLimiter, validate_middleware_1.validateAuth, authController_1.register);
router.post('/login', rateLimit_middleware_1.authLimiter, validate_middleware_1.validateAuth, authController_1.login);
exports.default = router;
