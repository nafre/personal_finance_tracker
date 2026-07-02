import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { buildServer } from "./server.js";

// Phase 2 — remote transport for Render (web/mobile access via Claude.ai /
// Desktop custom connectors).
//
// ⚠️  AUTH: this scaffold guards /mcp with a single shared bearer token, which
// is fine for MCP Inspector and a Claude Desktop custom connector that can send
// an Authorization header. Claude.ai (web/mobile) custom connectors require full
// OAuth 2.1 (PKCE + dynamic client registration). To support those, replace the
// bearer check below with the MCP SDK's auth router/provider, or front this
// service with an OAuth gateway (e.g. Cloudflare Access / oauth2-proxy).
// Financial data is exposed publicly here — do NOT deploy without real auth.

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// Shared-secret guard (interim). No-op if MCP_BEARER_TOKEN is unset.
app.use((req, res, next) => {
  const token = process.env.MCP_BEARER_TOKEN;
  if (!token) return next();
  if (req.headers.authorization === `Bearer ${token}`) return next();
  res.status(401).json({ error: "unauthorized" });
});

// Stateless Streamable HTTP: a fresh server+transport per request.
app.post("/mcp", async (req, res) => {
  const server = buildServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => {
    transport.close();
    server.close();
  });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("[expense-tracker-mcp] request error:", err);
    if (!res.headersSent) res.status(500).json({ error: "internal error" });
  }
});

// GET/DELETE are used by the streaming/session protocol; not needed statelessly.
const methodNotAllowed = (_req: express.Request, res: express.Response) =>
  res.status(405).json({ error: "method not allowed" });
app.get("/mcp", methodNotAllowed);
app.delete("/mcp", methodNotAllowed);

const port = Number(process.env.PORT ?? 3333);
app.listen(port, () => {
  console.error(`[expense-tracker-mcp] http server listening on :${port}`);
});
