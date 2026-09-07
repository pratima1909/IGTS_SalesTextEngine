import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT) || 4173;
const host = process.env.HOST || "0.0.0.0";

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

function sendError(response, status, message) {
  const body = JSON.stringify({ error: message });
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(body);
}

const server = http.createServer(async (request, response) => {
  try {
    if (request.method !== "GET" && request.method !== "HEAD") {
      sendError(response, 405, "Method not allowed");
      return;
    }

    const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
    const requestedPath = decodeURIComponent(url.pathname);
    const relativePath = requestedPath === "/" ? "index.html" : requestedPath.replace(/^\/+/, "");
    const filePath = path.resolve(root, relativePath);

    if (!filePath.startsWith(root + path.sep)) {
      sendError(response, 403, "Forbidden");
      return;
    }

    const content = await fs.readFile(filePath);
    const contentType = mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream";
    const acceptsGzip = request.headers["accept-encoding"]?.includes("gzip") && content.length > 1024;
    const body = acceptsGzip ? gzipSync(content) : content;

    response.writeHead(200, {
      "Content-Type": contentType,
      "Content-Length": body.length,
      "Cache-Control": relativePath.startsWith("public/data/") ? "public, max-age=3600" : "no-cache",
      "X-Content-Type-Options": "nosniff",
      ...(acceptsGzip ? { "Content-Encoding": "gzip", Vary: "Accept-Encoding" } : {}),
    });
    if (request.method === "HEAD") response.end();
    else response.end(body);
  } catch (error) {
    const status = error?.code === "ENOENT" ? 404 : 500;
    if (!response.headersSent) sendError(response, status, status === 404 ? "Not found" : "Server error");
    else response.end();
    if (status >= 500) console.error(error);
  }
});

server.listen(port, host, () => {
  console.log(`IGT Systems Sales Text Engine is running at http://localhost:${port}`);
  console.log("Sales Text Studio is using Philips-guided local mode; no API key is required.");
});
