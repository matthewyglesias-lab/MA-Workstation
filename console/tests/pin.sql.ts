import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import sql from "mssql";
import { SqlPinStore } from "../src/server/platform/sql-pin-store.js";
import {
  digest,
  hashPin,
  STAFF_ATTEMPTS,
} from "../src/server/platform/pin-auth.js";

/** Invoked only by the guarded disposable local SQL integration harness. */
export async function verifyPinSql(
  pool: sql.ConnectionPool,
  clinic: string,
  otherClinic: string,
) {
  const code = "pin-sql-test",
    staffId = randomUUID();
  const pinHash = await hashPin("482951");
  const request = () =>
    pool
      .request()
      .input("clinic", sql.UniqueIdentifier, clinic)
      .input("staff", sql.UniqueIdentifier, staffId);
  await request()
    .input("code", sql.NVarChar(40), code)
    .input("hash", sql.NVarChar(220), pinHash)
    .query(
      "INSERT dbo.PinStaff(clinicId,id,staffCode,displayName,pinHash,rolesJson) VALUES(@clinic,@staff,@code,'Synthetic PIN staff',@hash,'[\"Console.Operator\"]')",
    );
  const store = new SqlPinStore(pool, clinic, pinHash);
  const secondInstance = new SqlPinStore(pool, clinic, pinHash);
  const other = new SqlPinStore(pool, otherClinic, pinHash);
  let token = digest(randomUUID());
  const actor = await store.login(code, "482951", "sql-test-ip", token);
  assert.equal(actor.id, staffId);
  assert.equal(actor.displayName, "Synthetic PIN staff");
  assert.deepEqual(actor.roles, ["Console.Operator"]);
  assert.equal(
    (await secondInstance.session(token))?.id,
    staffId,
    "Session did not persist across API instances",
  );
  assert.equal(
    await other.session(token),
    null,
    "Session crossed clinic boundary",
  );
  await assert.rejects(
    other.login(code, "482951", "sql-test-ip", digest(randomUUID())),
    /Unable to sign in/,
  );
  const stored = (
    await request().query(
      "SELECT sessionHash FROM dbo.PinSessions WHERE clinicId=@clinic AND staffId=@staff",
    )
  ).recordset;
  assert.equal(stored[0]!.sessionHash, token);

  await request().query(
    "UPDATE dbo.PinStaff SET rolesJson='[\"Console.Reader\"]' WHERE clinicId=@clinic AND id=@staff",
  );
  assert.deepEqual(
    (await store.session(token))?.roles,
    ["Console.Reader"],
    "Changed roles did not take effect",
  );
  await secondInstance.logout(token);
  assert.equal(await store.session(token), null, "Logout was not persistent");

  token = digest(randomUUID());
  await store.login(code, "482951", "sql-test-ip", token);
  await request().query(
    "UPDATE dbo.PinStaff SET credentialVersion=credentialVersion+1 WHERE clinicId=@clinic AND id=@staff",
  );
  assert.equal(
    await store.session(token),
    null,
    "Credential reset did not revoke old sessions",
  );
  token = digest(randomUUID());
  await store.login(code, "482951", "sql-test-ip", token);
  await request().query(
    "UPDATE dbo.PinStaff SET disabled=1 WHERE clinicId=@clinic AND id=@staff",
  );
  assert.equal(
    await secondInstance.session(token),
    null,
    "Disabled staff kept an active session",
  );
  await assert.rejects(
    store.login(code, "482951", "sql-test-ip", digest(randomUUID())),
    /Unable to sign in/,
  );
  await request().query(
    "UPDATE dbo.PinStaff SET disabled=0 WHERE clinicId=@clinic AND id=@staff",
  );

  token = digest(randomUUID());
  await store.login(code, "482951", "sql-test-ip", token);
  await request()
    .input("token", sql.Char(64), token)
    .query(
      "UPDATE dbo.PinSessions SET lastSeen=DATEADD(minute,-16,SYSUTCDATETIME()) WHERE clinicId=@clinic AND sessionHash=@token",
    );
  assert.equal(await store.session(token), null, "Idle session did not expire");
  token = digest(randomUUID());
  await store.login(code, "482951", "sql-test-ip", token);
  await request()
    .input("token", sql.Char(64), token)
    .query(
      "UPDATE dbo.PinSessions SET createdAt=DATEADD(hour,-9,SYSUTCDATETIME()) WHERE clinicId=@clinic AND sessionHash=@token",
    );
  assert.equal(
    await store.session(token),
    null,
    "Active session exceeded absolute lifetime",
  );

  const outcomes = await Promise.allSettled(
    Array.from({ length: 8 }, (_, index) =>
      (index % 2 ? store : secondInstance).login(
        code,
        "000000",
        `sql-race-ip-${index}`,
        digest(randomUUID()),
      ),
    ),
  );
  assert.ok(outcomes.every((result) => result.status === "rejected"));
  const staffKey = digest(`staff:${code}`);
  const bucket = (
    await request()
      .input("key", sql.Char(64), staffKey)
      .query(
        "SELECT attempts,blockedUntil FROM dbo.PinAttempts WHERE clinicId=@clinic AND bucketKey=@key",
      )
  ).recordset[0]!;
  assert.equal(
    bucket.attempts,
    STAFF_ATTEMPTS,
    "Concurrent attempts bypassed durable staff lockout",
  );
  assert.ok(bucket.blockedUntil);
  await assert.rejects(
    secondInstance.login(code, "482951", "new-ip", digest(randomUUID())),
    /Unable to sign in/,
  );
  await request()
    .input("key", sql.Char(64), staffKey)
    .query(
      "UPDATE dbo.PinAttempts SET windowStart=DATEADD(minute,-31,SYSUTCDATETIME()),blockedUntil=DATEADD(minute,-1,SYSUTCDATETIME()) WHERE clinicId=@clinic AND bucketKey=@key",
    );
  assert.equal(
    (
      await secondInstance.login(
        code,
        "482951",
        "recovery-ip",
        digest(randomUUID()),
      )
    ).id,
    staffId,
  );
  const ipKey = digest("ip:blocked-socket");
  await request()
    .input("key", sql.Char(64), ipKey)
    .query(
      "INSERT dbo.PinAttempts(clinicId,bucketKey,attempts,windowStart,blockedUntil) VALUES(@clinic,@key,20,SYSUTCDATETIME(),DATEADD(minute,15,SYSUTCDATETIME()))",
    );
  await assert.rejects(
    new SqlPinStore(pool, clinic, pinHash).login(
      code,
      "482951",
      "blocked-socket",
      digest(randomUUID()),
    ),
    /Unable to sign in/,
  );
  await assert.rejects(
    store.login("demo", "123456", "synthetic-denied", digest(randomUUID())),
    /Unable to sign in/,
  );

  await pool
    .request()
    .query(
      "IF USER_ID('console_pin_role_test') IS NULL BEGIN CREATE USER console_pin_role_test WITHOUT LOGIN; ALTER ROLE console_runtime ADD MEMBER console_pin_role_test; END",
    );
  const permissions = (
    await pool
      .request()
      .query(
        "EXECUTE AS USER='console_pin_role_test'; SELECT HAS_PERMS_BY_NAME('dbo.PinStaff','OBJECT','SELECT') canReadStaff,HAS_PERMS_BY_NAME('dbo.PinStaff','OBJECT','INSERT') canCreateStaff,HAS_PERMS_BY_NAME('dbo.PinStaff','OBJECT','UPDATE') canChangeStaff,HAS_PERMS_BY_NAME('dbo.PinStaff','OBJECT','DELETE') canDeleteStaff,HAS_PERMS_BY_NAME('dbo.PinSessions','OBJECT','INSERT') canCreateSession,HAS_PERMS_BY_NAME('dbo.PinAccessEvents','OBJECT','UPDATE') canAlterAudit; REVERT;",
      )
  ).recordset[0]!;
  assert.equal(permissions.canReadStaff, 1);
  assert.equal(permissions.canCreateStaff, 0);
  assert.equal(permissions.canChangeStaff, 0);
  assert.equal(permissions.canDeleteStaff, 0);
  assert.equal(permissions.canCreateSession, 1);
  assert.equal(permissions.canAlterAudit, 0);
  console.log(
    "PIN SQL integration passed: persistent sessions and attempt limits, clinic isolation, roles, logout, disable, credential revocation, idle/absolute expiry, and staff administration permissions.",
  );
}
