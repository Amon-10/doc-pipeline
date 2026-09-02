const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");

const PORT = Number(process.env.PORT || process.env.FRONTEND_PORT || 5173);
const API_ORIGIN = (process.env.API_ORIGIN || "http://localhost:3000").replace(/\/$/, "");
const PUBLIC_DIR = path.join(__dirname, "public");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

async function proxyApi(req, res) {
  const targetPath = req.url.replace(/^\/api/, "") || "/";
  const headers = { ...req.headers };
  delete headers.host;
  delete headers.connection;
  delete headers["content-length"];

  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    const upstream = await fetch(`${API_ORIGIN}${targetPath}`, {
      method: req.method,
      headers,
      body,
      redirect: "manual",
    });

    const responseHeaders = {};
    for (const name of ["content-type", "retry-after", "ratelimit", "ratelimit-policy"]) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders[name] = value;
    }
    res.writeHead(upstream.status, responseHeaders);
    res.end(Buffer.from(await upstream.arrayBuffer()));
  } catch (error) {
    console.error("Frontend proxy error:", error.message);
    res.writeHead(502, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "The API is unavailable. Make sure the backend is running." }));
  }
}

async function serveStatic(req, res) {
  const pathname = new URL(req.url, "http://localhost").pathname;
  const requested = pathname === "/" ? "index.html" : pathname.slice(1);
  const filePath = path.resolve(PUBLIC_DIR, requested);

  if (!filePath.startsWith(`${PUBLIC_DIR}${path.sep}`)) {
    res.writeHead(403).end("Forbidden");
    return;
  }

  try {
    const file = await fs.readFile(filePath);
    res.writeHead(200, {
      "content-type": MIME_TYPES[path.extname(filePath)] || "application/octet-stream",
      // This frontend has no asset fingerprinting/build step, so stale cached
      // JavaScript could preserve old authentication behavior after a deploy.
      "cache-control": "no-store",
    });
    res.end(file);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

const server = http.createServer((req, res) => {
  if (req.url === "/api/health") {
    proxyApi(req, res);
    return;
  }
  if (req.url.startsWith("/api/")) {
    proxyApi(req, res);
    return;
  }
  serveStatic(req, res).catch((error) => {
    console.error(error);
    res.writeHead(500).end("Internal server error");
  });
});

server.listen(PORT, () => {
  console.log(`Docflow frontend: http://localhost:${PORT}`);
  console.log(`Proxying API requests to: ${API_ORIGIN}`);
});
