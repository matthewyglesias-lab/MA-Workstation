import sql from 'mssql';
export function sqlConfig(env = process.env): sql.config {
  const server = env.SQL_SERVER, database = env.SQL_DATABASE;
  if (!server || !database) throw new Error('SQL_SERVER and SQL_DATABASE are required.');
  const local = ['localhost', '127.0.0.1'].includes(server);
  if (env.SQL_AUTH === 'password' && (!local || env.NODE_ENV === 'production')) throw new Error('Password SQL authentication is restricted to a local test server.');
  return {
    server, database, port: Number(env.SQL_PORT || 1433),
    options: { encrypt: true, trustServerCertificate: local && env.NODE_ENV !== 'production', abortTransactionOnError: true },
    pool: { max: 10, min: 0, idleTimeoutMillis: 30000 }, connectionTimeout: 15000, requestTimeout: 15000,
    ...(env.SQL_AUTH === 'password' ? { user: env.SQL_USER, password: env.SQL_PASSWORD } : {
      authentication: { type: 'azure-active-directory-default' as const, options: { clientId: env.SQL_MANAGED_IDENTITY_CLIENT_ID } },
    }),
  };
}
export async function connectSql(env = process.env) { return new sql.ConnectionPool(sqlConfig(env)).connect(); }
