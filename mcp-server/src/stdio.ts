import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { buildServer } from "./server.js";

// Phase 1 — local transport for Claude Desktop. The DB credentials live on your
// machine; nothing is exposed to the network.
//
// NOTE: stdout is the JSON-RPC channel — never console.log() here. Logs go to
// stderr only.
async function main() {
  const server = buildServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[expense-tracker-mcp] stdio server ready");
}

main().catch((err) => {
  console.error("[expense-tracker-mcp] fatal:", err);
  process.exit(1);
});
