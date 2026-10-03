import sql from "mssql";
import type { Actor } from "../../shared/contracts.js";
import {
  ABSOLUTE_MS,
  IDLE_MS,
  IP_ATTEMPTS,
  STAFF_ATTEMPTS,
  consumeAttempt,
  digest,
  loginFailure,
  staffActor,
  staffRoles,
  verifyPin,
  type AttemptBucket,
  type PinStaff,
  type PinStore,
} from "./pin-auth.js";

export class SqlPinStore implements PinStore {
  constructor(
    private readonly pool: sql.ConnectionPool,
    private readonly clinicId: string,
    private readonly dummyHash: string,
  ) {}
  private request(tx?: sql.Transaction) {
    return (tx || this.pool)
      .request()
      .input("clinic", sql.UniqueIdentifier, this.clinicId);
  }
  async login(
    code: string,
    pin: string,
    ip: string,
    sessionHash: string,
  ): Promise<Actor> {
    const tx = this.pool.transaction();
    await tx.begin();
    let actor: Actor | undefined;
    try {
      const staffKey = digest(`staff:${code}`),
        ipKey = digest(`ip:${ip}`);
      // Ordered, clinic-scoped database locks serialize attempts across every API instance.
      for (const key of [staffKey, ipKey].sort())
        await this.request(tx)
          .input("resource", sql.NVarChar(255), `pin:${this.clinicId}:${key}`)
          .query(
            "DECLARE @r int; EXEC @r=sys.sp_getapplock @Resource=@resource, @LockMode='Exclusive', @LockOwner='Transaction', @LockTimeout=15000; IF @r<0 THROW 51000,'Sign-in is busy',1;",
          );
      const now = (
        await this.request(tx).query("SELECT SYSUTCDATETIME() AS now")
      ).recordset[0]!.now as Date;
      let allowed = true;
      for (const [key, limit] of [
        [staffKey, STAFF_ATTEMPTS],
        [ipKey, IP_ATTEMPTS],
      ] as const) {
        const row = (
          await this.request(tx)
            .input("key", sql.Char(64), key)
            .query(
              "SELECT attempts,windowStart,blockedUntil FROM dbo.PinAttempts WITH(UPDLOCK,HOLDLOCK) WHERE clinicId=@clinic AND bucketKey=@key",
            )
        ).recordset[0];
        const bucket: AttemptBucket | undefined = row
          ? {
              attempts: row.attempts,
              windowStart: row.windowStart.getTime(),
              blockedUntil: row.blockedUntil ? row.blockedUntil.getTime() : 0,
            }
          : undefined;
        const next = consumeAttempt(bucket, limit, now.getTime());
        allowed = allowed && next.allowed;
        await this.request(tx)
          .input("key", sql.Char(64), key)
          .input("attempts", sql.Int, next.bucket.attempts)
          .input("window", sql.DateTime2, new Date(next.bucket.windowStart))
          .input(
            "blocked",
            sql.DateTime2,
            next.bucket.blockedUntil
              ? new Date(next.bucket.blockedUntil)
              : null,
          )
          .query(
            row
              ? "UPDATE dbo.PinAttempts SET attempts=@attempts,windowStart=@window,blockedUntil=@blocked WHERE clinicId=@clinic AND bucketKey=@key"
              : "INSERT dbo.PinAttempts(clinicId,bucketKey,attempts,windowStart,blockedUntil) VALUES(@clinic,@key,@attempts,@window,@blocked)",
          );
      }
      const row = allowed
        ? (
            await this.request(tx)
              .input("code", sql.NVarChar(40), code)
              .query(
                "SELECT LOWER(CONVERT(varchar(36),id)) AS id,staffCode AS code,displayName,pinHash,rolesJson,credentialVersion AS version,disabled FROM dbo.PinStaff WITH(UPDLOCK,HOLDLOCK) WHERE clinicId=@clinic AND staffCode=@code",
              )
          ).recordset[0]
        : undefined;
      const verified =
        allowed && (await verifyPin(pin, row?.pinHash || this.dummyHash));
      if (verified && row && !row.disabled) {
        const staff: PinStaff = {
          ...row,
          roles: staffRoles.parse(JSON.parse(row.rolesJson)),
        };
        actor = staffActor(staff);
        await this.request(tx)
          .input("hash", sql.Char(64), sessionHash)
          .input("staff", sql.UniqueIdentifier, staff.id)
          .input("version", sql.Int, staff.version)
          .input("now", sql.DateTime2, now)
          .query(
            "INSERT dbo.PinSessions(clinicId,sessionHash,staffId,credentialVersion,createdAt,lastSeen) VALUES(@clinic,@hash,@staff,@version,@now,@now)",
          );
        await this.request(tx)
          .input("key", sql.Char(64), staffKey)
          .query(
            "DELETE dbo.PinAttempts WHERE clinicId=@clinic AND bucketKey=@key",
          );
      }
      await this.request(tx)
        .input("staff", sql.UniqueIdentifier, row?.id || null)
        .input("ip", sql.Char(64), ipKey)
        .input(
          "event",
          sql.NVarChar(30),
          actor
            ? "signed_in"
            : allowed
              ? "sign_in_failed"
              : "sign_in_throttled",
        )
        .query(
          "INSERT dbo.PinAccessEvents(clinicId,staffId,event,ipHash) VALUES(@clinic,@staff,@event,@ip)",
        );
      await tx.commit();
    } catch (error) {
      await tx.rollback().catch(() => undefined);
      throw error;
    }
    // Failed attempts must commit before an authentication error is raised.
    if (!actor) throw loginFailure();
    return actor;
  }
  async session(sessionHash: string): Promise<Actor | null> {
    const row = (
      await this.request()
        .input("hash", sql.Char(64), sessionHash)
        .input("idle", sql.Int, IDLE_MS / 1000)
        .input("absolute", sql.Int, ABSOLUTE_MS / 1000).query(`
      UPDATE session SET lastSeen=SYSUTCDATETIME()
      OUTPUT LOWER(CONVERT(varchar(36),staff.id)) AS id,staff.displayName,staff.rolesJson
      FROM dbo.PinSessions AS session
      JOIN dbo.PinStaff AS staff ON staff.clinicId=session.clinicId AND staff.id=session.staffId
      WHERE session.clinicId=@clinic AND session.sessionHash=@hash AND session.revokedAt IS NULL
        AND staff.disabled=0 AND staff.credentialVersion=session.credentialVersion
        AND session.lastSeen>DATEADD(second,-@idle,SYSUTCDATETIME())
        AND session.createdAt>DATEADD(second,-@absolute,SYSUTCDATETIME());
    `)
    ).recordset[0];
    return row
      ? {
          id: row.id,
          displayName: row.displayName,
          roles: staffRoles.parse(JSON.parse(row.rolesJson)),
        }
      : null;
  }
  async logout(sessionHash: string) {
    await this.request()
      .input("hash", sql.Char(64), sessionHash)
      .query(
        "UPDATE dbo.PinSessions SET revokedAt=SYSUTCDATETIME() WHERE clinicId=@clinic AND sessionHash=@hash AND revokedAt IS NULL;",
      );
  }
}
