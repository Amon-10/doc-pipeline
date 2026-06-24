import "dotenv/config";
import express from "express";
import uploadRouter from "./api/upload.route";
import "./workers/extract.worker";

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