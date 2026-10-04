import { createServer } from "node:http";
import { createHandler } from "./index.js";
import { developmentProvider } from "./dev-provider.js";
const live = process.argv.includes("--live");
const handler = createHandler(developmentProvider(live, process.env));
createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 16384) {
      res.writeHead(413, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: {
            code: "BODY_TOO_LARGE",
            message: "Request too large.",
            requestId: "local",
          },
        }),
      );
      return;
    }
    chunks.push(chunk);
  }
  const result = await handler({
    rawPath: req.url?.split("?")[0],
    headers: req.headers as Record<string, string>,
    body: Buffer.concat(chunks).toString(),
    requestContext: { http: { method: req.method } },
  });
  res.writeHead(result.statusCode, result.headers);
  res.end(result.body);
}).listen(3001, "127.0.0.1", () =>
  console.info(
    live
      ? "Live route API: http://127.0.0.1:3001 (requests consume provider quota)"
      : "Synthetic route API: http://127.0.0.1:3001 (not navigable routes)",
  ),
);
