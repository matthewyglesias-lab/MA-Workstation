import "dotenv/config";
import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline/promises";
import sql from "mssql";
import { z } from "zod";
import { connectSql } from "./sql-connection.js";
import {
  digest,
  hashPin,
  pinLoginInput,
  staffRoles,
  validateNewPin,
} from "./pin-auth.js";

async function hiddenPin(prompt: string): Promise<string> {
  if (!process.stdin.isTTY || !process.stdout.isTTY)
    throw new Error("A terminal is required for hidden PIN entry.");
  process.stdout.write(prompt);
  const wasRaw = process.stdin.isRaw;
  process.stdin.setRawMode(true);
  process.stdin.resume();
  return new Promise<string>((resolve, reject) => {
    let value = "";
    const finish = (error?: Error) => {
      process.stdin.off("data", read);
      process.stdin.setRawMode(wasRaw);
      process.stdin.pause();
      process.stdout.write("\n");
      if (error) reject(error);
      else resolve(value);
    };
    const read = (chunk: Buffer) => {
      for (const character of chunk.toString("utf8")) {
        if (character === "\u0003" || character === "\u0004") {
          finish(new Error("Cancelled."));
          return;
        }
        if (character === "\r" || character === "\n") {
          finish();
          return;
        }
        if (character === "\u007f" || character === "\b") {
          value = value.slice(0, -1);
          continue;
        }
        if (/^[\x20-\x7e]$/.test(character) && value.length < 64)
          value += character;
      }
    };
    process.stdin.on("data", read);
  });
}
async function main() {
  if (process.argv.length > 2)
    throw new Error(
      "This command accepts no arguments. Enter all details interactively.",
    );
  if (!process.stdin.isTTY || !process.stdout.isTTY)
    throw new Error("Run staff administration in an interactive terminal.");
  const clinicId = z.string().uuid().parse(process.env.CLINIC_ID);
  const readline = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  let action: "create" | "reset" | "disable" | "revoke";
  let code: string,
    displayName = "",
    roles: string[] = [];
  try {
    action = z
      .enum(["create", "reset", "disable", "revoke"])
      .parse(
        (
          await readline.question(
            "Action (create / reset / disable / revoke): ",
          )
        ).trim(),
      );
    code = pinLoginInput.shape.staffCode.parse(
      await readline.question("Staff code: "),
    );
    if (action === "create" || action === "reset") {
      displayName = z
        .string()
        .trim()
        .min(1)
        .max(120)
        .parse(await readline.question("Staff display name: "));
      console.log(
        "Roles: Console.Reader, Console.Operator, Inventory.Manager (comma separated). Operator does not include inventory management.",
      );
      roles = staffRoles.parse(
        (await readline.question("Assigned roles: "))
          .split(",")
          .map((role) => role.trim()),
      );
    }
  } finally {
    readline.close();
  }
  let pinHash = "";
  if (action === "create" || action === "reset") {
    let pin = await hiddenPin("New PIN (4–12 digits; hidden): ");
    validateNewPin(pin);
    let repeated = await hiddenPin("Repeat PIN: ");
    if (pin !== repeated)
      throw new Error("PINs did not match. Nothing was saved.");
    pinHash = await hashPin(pin);
    pin = "";
    repeated = "";
  }
  const pool = await connectSql();
  const tx = pool.transaction();
  try {
    await tx.begin();
    const request = () =>
      tx
        .request()
        .input("clinic", sql.UniqueIdentifier, clinicId)
        .input("code", sql.NVarChar(40), code);
    await request()
      .input(
        "resource",
        sql.NVarChar(255),
        `pin:${clinicId}:${digest(`staff:${code}`)}`,
      )
      .query(
        "DECLARE @r int; EXEC @r=sys.sp_getapplock @Resource=@resource,@LockMode='Exclusive',@LockOwner='Transaction',@LockTimeout=15000; IF @r<0 THROW 51000,'Staff account is busy',1;",
      );
    const existing = (
      await request().query(
        "SELECT id FROM dbo.PinStaff WITH(UPDLOCK,HOLDLOCK) WHERE clinicId=@clinic AND staffCode=@code",
      )
    ).recordset[0];
    if (action === "create" && existing)
      throw new Error(
        "That staff code already exists. Use reset to replace credentials.",
      );
    if (action !== "create" && !existing)
      throw new Error("Staff code was not found.");
    const staffId = existing?.id || randomUUID();
    if (action === "create" || action === "reset")
      await request()
        .input("id", sql.UniqueIdentifier, staffId)
        .input("name", sql.NVarChar(120), displayName)
        .input("hash", sql.NVarChar(220), pinHash)
        .input("roles", sql.NVarChar(300), JSON.stringify(roles))
        .query(
          action === "create"
            ? "INSERT dbo.PinStaff(clinicId,id,staffCode,displayName,pinHash,rolesJson) VALUES(@clinic,@id,@code,@name,@hash,@roles)"
            : "UPDATE dbo.PinStaff SET displayName=@name,pinHash=@hash,rolesJson=@roles,credentialVersion=credentialVersion+1,disabled=0 WHERE clinicId=@clinic AND staffCode=@code",
        );
    else
      await request().query(
        `UPDATE dbo.PinStaff SET credentialVersion=credentialVersion+1${action === "disable" ? ",disabled=1" : ""} WHERE clinicId=@clinic AND staffCode=@code`,
      );
    await request()
      .input("id", sql.UniqueIdentifier, staffId)
      .query(
        "UPDATE dbo.PinSessions SET revokedAt=SYSUTCDATETIME() WHERE clinicId=@clinic AND staffId=@id AND revokedAt IS NULL",
      );
    await request()
      .input("key", sql.Char(64), digest(`staff:${code}`))
      .query(
        "DELETE dbo.PinAttempts WHERE clinicId=@clinic AND bucketKey=@key",
      );
    await request()
      .input("id", sql.UniqueIdentifier, staffId)
      .input(
        "event",
        sql.NVarChar(30),
        {
          create: "staff_created",
          reset: "staff_reset",
          disable: "staff_disabled",
          revoke: "staff_revoked",
        }[action],
      )
      .query(
        "INSERT dbo.PinAccessEvents(clinicId,staffId,event,administrator) VALUES(@clinic,@id,@event,SUSER_SNAME())",
      );
    await tx.commit();
    console.log(
      `Staff account ${action} complete. Existing sessions are revoked.`,
    );
  } catch (error) {
    await tx.rollback().catch(() => undefined);
    throw error;
  } finally {
    await pool.close();
  }
}
main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Staff administration failed.",
  );
  process.exitCode = 1;
});
