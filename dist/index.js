"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const app_1 = require("./app");
require("./workers/extract.worker");
require("./workers/chunk.worker");
require("./workers/summarize.worker");
require("./workers/merge.worker");
require("./workers/notify.worker");
const PORT = process.env.PORT || 3000;
app_1.app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
