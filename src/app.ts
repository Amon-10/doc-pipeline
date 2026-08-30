import express, { Request, Response } from "express";
import uploadRouter from "./api/upload.route";
import statusRouter from "./api/status.route";
import requireAuth from "./auth/middleware/auth.middleware";
import authRoutes from "./auth/route/auth.route";
import { uploadLimiter } from "./middleware/rateLimit.middleware";

/** Express application without a listener or background workers.
 * Keeping construction separate from startup lets integration tests bind an
 * ephemeral port without creating a second production server.
 */
export const app = express();

app.use(express.json());

app.get("/", (_req, res) => {
  res.json({ message: "Doc pipeline API", status: "ok" });
});

app.use("/", authRoutes);
app.use("/upload", requireAuth, uploadLimiter, uploadRouter);
app.use("/status", requireAuth, statusRouter);

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use((req: Request, res: Response) => {
  res.status(404).json({ error: `Cannot ${req.method} ${req.path}` });
});
