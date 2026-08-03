import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";

const args = process.argv.slice(2);
const option = (short, long) => {
  const index = args.findIndex((value) => value === short || value === long);
  return index >= 0 ? args[index + 1] : undefined;
};
const port = Number(option("-p", "--port") ?? process.env.PORT ?? 3000);
const hostname = option("-H", "--hostname") ?? "0.0.0.0";
const clientDirectory = resolve("dist/client");
const workerUrl = new URL(`../dist/server/index.js?started=${Date.now()}`, import.meta.url);
const { default: worker } = await import(workerUrl.href);

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

async function staticResponse(pathname, method = "GET") {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  const filePath = resolve(clientDirectory, `.${decodedPath}`);
  if (filePath !== clientDirectory && !filePath.startsWith(`${clientDirectory}${sep}`)) return null;
  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) return null;
    const headers = {
      "Content-Type": contentTypes[extname(filePath)] ?? "application/octet-stream",
      "Content-Length": String(fileStat.size),
      "Cache-Control": decodedPath.startsWith("/assets/")
        ? "public, max-age=31536000, immutable"
        : "public, max-age=3600",
    };
    return new Response(method === "HEAD" ? null : await readFile(filePath), { headers });
  } catch {
    return null;
  }
}

async function handle(request) {
  const url = new URL(request.url);
  const staticFile = await staticResponse(url.pathname, request.method);
  if (staticFile) return staticFile;
  return worker.fetch(
    request,
    {
      ASSETS: {
        fetch: async (assetRequest) => {
          const assetUrl = new URL(assetRequest.url);
          return (await staticResponse(assetUrl.pathname, assetRequest.method)) ?? new Response("Not found", { status: 404 });
        },
      },
    },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

const server = createServer(async (incoming, outgoing) => {
  try {
    const origin = `http://${incoming.headers.host ?? `${hostname}:${port}`}`;
    const request = new Request(new URL(incoming.url ?? "/", origin), {
      method: incoming.method,
      headers: incoming.headers,
    });
    const response = await handle(request);
    const headers = Object.fromEntries(response.headers.entries());
    outgoing.writeHead(response.status, headers);
    if (incoming.method === "HEAD" || !response.body) outgoing.end();
    else outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    console.error(error);
    if (!outgoing.headersSent) outgoing.writeHead(500);
    outgoing.end("Internal Server Error");
  }
});

server.listen(port, hostname, () => {
  console.log(`말결 production server: http://${hostname}:${port}`);
});
