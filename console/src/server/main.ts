import "dotenv/config";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import staticFiles from "@fastify/static";
import { buildApp } from "./app.js";
import { readConfig } from "./platform/config.js";
import { seededDemo } from "./platform/demo-repository.js";
import { connectSql } from "./platform/sql-connection.js";
import { PinAuthentication, hashPin } from "./platform/pin-auth.js";
import { SqlPinStore } from "./platform/sql-pin-store.js";
import { randomBytes } from "node:crypto";
import { SqlRepository } from "./platform/sql-repository.js";
const config = readConfig(process.env);
const pool = config.mode === "sql" ? await connectSql() : undefined;
const repo =
  config.mode === "demo"
    ? await seededDemo(config.timezone)
    : new SqlRepository(pool!, config.clinicId, config.timezone);
const pinAuth =
  config.mode === "sql" && config.authMode === "pin"
    ? new PinAuthentication(
        new SqlPinStore(
          pool!,
          config.clinicId,
          await hashPin(randomBytes(32).toString("hex")),
        ),
        config,
      )
    : undefined;
const app = await buildApp(config, repo, undefined, pinAuth);
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
