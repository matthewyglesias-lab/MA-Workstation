import 'dotenv/config';
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import sql from 'mssql';
import { connectSql } from './sql-connection.js';

/** Separate migration identity. Transactional, serialized, checksum-verified; never auto-runs on API boot. */
export async function migrate(pool: sql.ConnectionPool) {
  const tx = pool.transaction();
  await tx.begin();
  try {
    await tx.request().query("DECLARE @r int; EXEC @r=sys.sp_getapplock @Resource='console-schema', @LockMode='Exclusive', @LockOwner='Transaction', @LockTimeout=15000; IF @r<0 THROW 51000,'Migration lock unavailable',1;");
    await tx.request().query("IF OBJECT_ID('dbo.SchemaMigrations') IS NULL CREATE TABLE dbo.SchemaMigrations(name nvarchar(200) NOT NULL PRIMARY KEY, checksum char(64) NOT NULL, appliedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME());");
    const directory = resolve('database/migrations');
    for (const name of (await readdir(directory)).filter(x => x.endsWith('.sql')).sort()) {
      const source = await readFile(resolve(directory, name), 'utf8');
      const checksum = createHash('sha256').update(source).digest('hex');
      const existing = await tx.request().input('name', sql.NVarChar(200), name).query('SELECT checksum FROM dbo.SchemaMigrations WHERE name=@name');
      if (existing.recordset[0]) {
        if (existing.recordset[0].checksum !== checksum) throw new Error(`Applied migration changed: ${name}`);
        continue;
      }
      await tx.request().batch(source);
      await tx.request().input('name', sql.NVarChar(200), name).input('checksum', sql.Char(64), checksum).query('INSERT dbo.SchemaMigrations(name,checksum) VALUES(@name,@checksum)');
    }
    await tx.commit();
  } catch (error) { await tx.rollback().catch(() => undefined); throw error; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const pool = await connectSql();
  try { await migrate(pool); console.log('Database migrations applied.'); } finally { await pool.close(); }
}
