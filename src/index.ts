import "dotenv/config";
import { app } from "./app";
import "./workers/extract.worker";
import "./workers/chunk.worker";
import "./workers/summarize.worker";
import "./workers/merge.worker";
import "./workers/notify.worker";
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
