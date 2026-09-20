"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.addJob = exports.closeQueues = exports.getQueue = exports.connection = void 0;
const bullmq_1 = require("bullmq");
/**
 * Redis connection config used by BullMQ.
 * Host defaults to "redis" — the Docker service name, not localhost,
 * since this connects to Redis from inside the app container.
 */
exports.connection = {
    host: process.env.REDIS_HOST || "redis",
    port: parseInt(process.env.REDIS_PORT || "6379"),
    password: process.env.REDIS_PASSWORD || undefined,
};
// one dedicated queue per job type — prevents workers from competing for jobs meant for a different stage
const queues = {
    extract: new bullmq_1.Queue("extract", { connection: exports.connection }),
    chunk: new bullmq_1.Queue("chunk", { connection: exports.connection }),
    summarize: new bullmq_1.Queue("summarize", { connection: exports.connection }),
    merge: new bullmq_1.Queue("merge", { connection: exports.connection }),
    notify: new bullmq_1.Queue("notify", { connection: exports.connection }),
};
/** Exposed for operational checks and integration-test queue assertions. */
const getQueue = (jobType) => queues[jobType];
exports.getQueue = getQueue;
const closeQueues = async () => {
    await Promise.all(Object.values(queues).map((queue) => queue.close()));
};
exports.closeQueues = closeQueues;
/**
 * Adds a job to the pipeline queue with automatic retry.
 *
 * @param payload - job data matching the JobPayload shape
 *
 * Allows up to 3 total attempts (2 retries) with exponential backoff —
 * the wait between retries doubles each time (2s, 4s),
 * giving external services like OpenAI room to recover from rate limits.
 */
const addJob = async (payload) => {
    const queue = queues[payload.jobType];
    await queue.add(payload.jobType, payload, {
        attempts: 3,
        backoff: {
            type: "exponential",
            delay: 2000,
        },
    });
};
exports.addJob = addJob;
