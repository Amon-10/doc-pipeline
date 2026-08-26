import "dotenv/config";
import express from "express";
import { Request, Response } from "express";
import uploadRouter from "./api/upload.route";
import "./workers/extract.worker";
import "./workers/chunk.worker";
import "./workers/summarize.worker";
import "./workers/merge.worker";
import "./workers/notify.worker";
import statusRouter from "./api/status.route";
import requireAuth from "./auth/middleware/auth.middleware";
import authRoutes from "./auth/route/auth.route";
import { uploadLimiter } from "./middleware/rateLimit.middleware";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get("/", (req, res) => {
  res.json({ message: "Doc pipeline API", status: "ok" });
});

app.use("/", authRoutes);
app.use("/upload", requireAuth, uploadLimiter, uploadRouter);
app.use("/status", requireAuth, statusRouter);

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use((req: Request, res: Response) => {
  res.status(404).json({ error: `Cannot ${req.method} ${req.path}` });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
