import "dotenv/config";
import express from "express";
import uploadRouter from "./api/upload.route";
import "./workers/extract.worker";
import "./workers/chunk.worker";
import "./workers/summarize.worker";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use("/upload", uploadRouter);

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
//edd7a3c8-2331-423b-a55a-ebb2e0ab97f5