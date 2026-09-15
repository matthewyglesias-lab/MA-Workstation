import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { readConfig } from "../src/server/platform/config.js";
import { sqlConfig } from "../src/server/platform/sql-connection.js";

describe("Render deployment boundaries", () => {
  it("uses Render's assigned HTTPS origin while preserving explicit custom domains", () => {
    const env = {
      CONSOLE_MODE: "sql",
      AUTH_MODE: "pin",
      CLINIC_ID: randomUUID(),
      RENDER: "true",
      RENDER_EXTERNAL_URL: "https://console-example.onrender.com",
      HOST: "0.0.0.0",
      PORT: "10000",
    };
    expect(readConfig(env)).toMatchObject({
      publicOrigin: env.RENDER_EXTERNAL_URL,
      port: 10000,
    });
    expect(
      readConfig({ ...env, PUBLIC_ORIGIN: "https://clinic.example" })
        .publicOrigin,
    ).toBe("https://clinic.example");
    expect(() => readConfig({ ...env, RENDER: "false" })).toThrow();
    for (const origin of [
      "http://clinic.example",
      "https://clinic.example/path",
    ])
      expect(() =>
        readConfig({ ...env, RENDER_EXTERNAL_URL: origin }),
      ).toThrow();
  });

  it("uses an explicit Entra app identity without allowing production SQL passwords", () => {
    const env = {
      NODE_ENV: "production",
      SQL_SERVER: "console-example.database.windows.net",
      SQL_DATABASE: "clinic-console",
      SQL_AUTH: "azure-active-directory-service-principal-secret",
      SQL_TENANT_ID: randomUUID(),
      SQL_CLIENT_ID: randomUUID(),
      SQL_CLIENT_SECRET: "synthetic-test-only",
      SQL_POOL_MAX: "4",
    };
    const config = sqlConfig(env);
    expect(config.authentication).toEqual({
      type: env.SQL_AUTH,
      options: {
        tenantId: env.SQL_TENANT_ID,
        clientId: env.SQL_CLIENT_ID,
        clientSecret: env.SQL_CLIENT_SECRET,
      },
    });
    expect(config.options).toMatchObject({
      encrypt: true,
      trustServerCertificate: false,
    });
    expect(config.pool).toMatchObject({ max: 4, min: 0 });
    expect(() => sqlConfig({ ...env, SQL_CLIENT_SECRET: "" })).toThrow();
    expect(() => sqlConfig({ ...env, SQL_AUTH: "password" })).toThrow();
    expect(() => sqlConfig({ ...env, SQL_AUTH: "typo" })).toThrow();
    expect(() => sqlConfig({ ...env, SQL_POOL_MAX: "0" })).toThrow();
  });
});
