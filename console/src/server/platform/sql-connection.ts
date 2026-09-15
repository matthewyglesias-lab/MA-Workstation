import sql from "mssql";
import { z } from "zod";
export function sqlConfig(env = process.env): sql.config {
  const server = env.SQL_SERVER,
    database = env.SQL_DATABASE;
  if (!server || !database)
    throw new Error("SQL_SERVER and SQL_DATABASE are required.");
  const auth = z
    .enum([
      "password",
      "azure-active-directory-default",
      "azure-active-directory-service-principal-secret",
    ])
    .parse(env.SQL_AUTH || "azure-active-directory-default");
  const local = ["localhost", "127.0.0.1"].includes(server);
  if (auth === "password" && (!local || env.NODE_ENV === "production"))
    throw new Error(
      "Password SQL authentication is restricted to a local test server.",
    );
  let authentication: sql.config["authentication"];
  if (auth === "azure-active-directory-service-principal-secret") {
    if (!env.SQL_CLIENT_SECRET)
      throw new Error(
        "SQL_CLIENT_SECRET is required for the SQL app identity.",
      );
    authentication = {
      type: auth,
      options: {
        tenantId: z.string().uuid().parse(env.SQL_TENANT_ID),
        clientId: z.string().uuid().parse(env.SQL_CLIENT_ID),
        clientSecret: env.SQL_CLIENT_SECRET,
      },
    };
  } else if (auth === "azure-active-directory-default") {
    authentication = {
      type: auth,
      options: { clientId: env.SQL_MANAGED_IDENTITY_CLIENT_ID },
    };
  }
  return {
    server,
    database,
    port: Number(env.SQL_PORT || 1433),
    options: {
      encrypt: true,
      trustServerCertificate: local && env.NODE_ENV !== "production",
      abortTransactionOnError: true,
    },
    pool: {
      max: z.coerce
        .number()
        .int()
        .min(1)
        .max(16)
        .parse(env.SQL_POOL_MAX || 10),
      min: 0,
      idleTimeoutMillis: 30000,
    },
    // Azure SQL free/serverless may be resuming on first access.
    connectionTimeout: 60000,
    requestTimeout: 15000,
    ...(auth === "password"
      ? { user: env.SQL_USER, password: env.SQL_PASSWORD }
      : { authentication }),
  };
}
export async function connectSql(env = process.env) {
  return new sql.ConnectionPool(sqlConfig(env)).connect();
}
