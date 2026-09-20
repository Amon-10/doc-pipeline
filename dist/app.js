"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
const express_1 = __importDefault(require("express"));
const upload_route_1 = __importDefault(require("./api/upload.route"));
const status_route_1 = __importDefault(require("./api/status.route"));
const auth_middleware_1 = __importDefault(require("./auth/middleware/auth.middleware"));
const auth_route_1 = __importDefault(require("./auth/route/auth.route"));
const rateLimit_middleware_1 = require("./middleware/rateLimit.middleware");
/** Express application without a listener or background workers.
 * Keeping construction separate from startup lets integration tests bind an
 * ephemeral port without creating a second production server.
 */
exports.app = (0, express_1.default)();
exports.app.use(express_1.default.json());
exports.app.get("/", (_req, res) => {
    res.json({ message: "Doc pipeline API", status: "ok" });
});
exports.app.use("/", auth_route_1.default);
exports.app.use("/upload", auth_middleware_1.default, rateLimit_middleware_1.uploadLimiter, upload_route_1.default);
exports.app.use("/status", auth_middleware_1.default, status_route_1.default);
exports.app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
});
exports.app.use((req, res) => {
    res.status(404).json({ error: `Cannot ${req.method} ${req.path}` });
});
