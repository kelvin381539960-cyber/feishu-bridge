#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
await import(pathToFileURL(join(dir, "..", "lark-doc-mcp", "server.mjs")).href);
