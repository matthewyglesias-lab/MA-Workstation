import "dotenv/config";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import staticFiles from "@fastify/static";
import { buildApp } from "./app.js";
import { readConfig } from "./platform/config.js";
import { seededDemo } from "./platform/demo-repository.js";
import { connectSql } from "./platform/sql-connection.js";
import { SqlRepository } from "./platform/sql-repository.js";
const config = readConfig(process.env);
const repo =
  config.mode === "demo"
    ? await seededDemo(config.timezone)
    : new SqlRepository(await connectSql(), config.clinicId, config.timezone);
const app = await buildApp(config, repo);
const webRoot = resolve("dist/web");
if (existsSync(webRoot))
  await app.register(staticFiles, { root: webRoot, index: "index.html" });
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => {
    void app.close().then(() => process.exit(0));
  });
await app.listen({ host: config.host, port: config.port });
console.log(
  `Clinic console listening on ${config.host}:${config.port} (${config.mode}).`,
);
