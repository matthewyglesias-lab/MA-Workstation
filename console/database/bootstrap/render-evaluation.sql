-- Generated from the exact PR #67 migration sources in database/migrations.
-- Intended only for clinic-console on ipmg-clinic-console-sql.database.windows.net.
-- Recreate this bootstrap if any source migration changes; do not edit embedded hashes.
-- Contains no patient data, application secrets, or PIN; creates only the named TEST clinic.
-- Application/client ID is used for the external application SID, per CREATE USER docs.

-- MA-Workstation PR #67: transactional schema + TEST clinic + contained runtime user.
-- Run once (or safely rerun) in Azure SQL portal Query editor as the configured
-- Microsoft Entra administrator, database clinic-console, server
-- ipmg-clinic-console-sql.database.windows.net. Paste this entire file; no GO batches.
-- No patient data, staff account, PIN, or application secret is inserted here.
-- Source migration checksums are SHA-256 of the exact original UTF-8 file bytes.
SET NOCOUNT ON;
SET XACT_ABORT ON;
IF DB_NAME() COLLATE Latin1_General_100_BIN2 <> N'clinic-console'
    THROW 51001, 'Wrong database: expected clinic-console.', 1;
IF @@TRANCOUNT <> 0
    THROW 51002, 'Bootstrap requires a session without an existing transaction.', 1;

BEGIN TRY
    BEGIN TRANSACTION;
    DECLARE @LockResult int;
    EXEC @LockResult = sys.sp_getapplock
        @Resource = N'console-schema',
        @LockMode = N'Exclusive',
        @LockOwner = N'Transaction',
        @LockTimeout = 15000;
    IF @LockResult < 0
        THROW 51000, 'Migration lock unavailable.', 1;

    EXEC sys.sp_executesql N'
IF OBJECT_ID(N''dbo.SchemaMigrations'') IS NULL
    CREATE TABLE dbo.SchemaMigrations (
        name nvarchar(200) NOT NULL PRIMARY KEY,
        checksum char(64) NOT NULL,
        appliedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME()
    );';

    -- 001_foundation.sql: 5baec4efd60d719e729ba05a0d2d441b5ad60d283076d3e6e7ae863c25b7da03
    EXEC sys.sp_executesql N'
IF EXISTS (SELECT 1 FROM dbo.SchemaMigrations WHERE name = N''001_foundation.sql'')
BEGIN
    IF EXISTS (
        SELECT 1 FROM dbo.SchemaMigrations
        WHERE name = N''001_foundation.sql''
          AND checksum COLLATE Latin1_General_100_BIN2 <> ''5baec4efd60d719e729ba05a0d2d441b5ad60d283076d3e6e7ae863c25b7da03''
    )
        THROW 51003, ''Applied migration changed: 001_foundation.sql'', 1;
END
ELSE
BEGIN
    EXEC sys.sp_executesql N''CREATE TABLE dbo.Clinics (
  id uniqueidentifier NOT NULL PRIMARY KEY,
  name nvarchar(160) NOT NULL,
  timezone nvarchar(80) NOT NULL
);
CREATE TABLE dbo.Patients (
  clinicId uniqueidentifier NOT NULL REFERENCES dbo.Clinics(id),
  id uniqueidentifier NOT NULL,
  tebraId nvarchar(64) NOT NULL,
  displayName nvarchar(160) NOT NULL,
  dob date NOT NULL,
  verifiedAt datetime2(3) NOT NULL,
  verifiedBy nvarchar(100) NOT NULL,
  CONSTRAINT PK_Patients PRIMARY KEY (clinicId,id),
  CONSTRAINT UQ_Patients_Tebra UNIQUE (clinicId,tebraId)
);
CREATE INDEX IX_Patients_Name ON dbo.Patients(clinicId,displayName);
CREATE TABLE dbo.Activities (
  clinicId uniqueidentifier NOT NULL,
  id uniqueidentifier NOT NULL,
  patientId uniqueidentifier NOT NULL,
  service nvarchar(30) NOT NULL,
  status varchar(20) NOT NULL DEFAULT ''''planned'''',
  handoff varchar(20) NOT NULL DEFAULT ''''pending'''',
  tebraReference nvarchar(200) NULL,
  version int NOT NULL DEFAULT 1,
  createdAt datetime2(3) NOT NULL,
  updatedAt datetime2(3) NOT NULL,
  CONSTRAINT PK_Activities PRIMARY KEY (clinicId,id),
  CONSTRAINT FK_Activities_Patient FOREIGN KEY(clinicId,patientId) REFERENCES dbo.Patients(clinicId,id),
  CONSTRAINT CK_Activity_Service CHECK(service IN (''''Injection'''',''''UDS'''',''''TMS'''',''''Samples'''',''''Forms'''')),
  CONSTRAINT CK_Activity_Status CHECK(status IN (''''planned'''',''''in_progress'''',''''completed'''')),
  CONSTRAINT CK_Activity_Handoff CHECK(handoff IN (''''pending'''',''''prepared'''',''''filed'''')),
  CONSTRAINT CK_Activity_Reference CHECK((handoff=''''filed'''' AND status=''''completed'''' AND tebraReference IS NOT NULL) OR (handoff<>''''filed'''' AND tebraReference IS NULL))
);
CREATE INDEX IX_Activities_Patient ON dbo.Activities(clinicId,patientId,createdAt DESC);
CREATE TABLE dbo.Products (
  clinicId uniqueidentifier NOT NULL REFERENCES dbo.Clinics(id),
  id uniqueidentifier NOT NULL,
  name nvarchar(160) NOT NULL,
  strength nvarchar(80) NOT NULL,
  unit nvarchar(20) NOT NULL,
  ndc nvarchar(30) NULL,
  CONSTRAINT PK_Products PRIMARY KEY(clinicId,id),
  CONSTRAINT UQ_Product UNIQUE(clinicId,name,strength,unit),
  CONSTRAINT CK_Product_Unit CHECK(unit IN (''''syringe'''',''''kit'''',''''tablet'''',''''capsule'''',''''vial''''))
);
CREATE TABLE dbo.StockLots (
  clinicId uniqueidentifier NOT NULL,
  id uniqueidentifier NOT NULL,
  productId uniqueidentifier NOT NULL,
  lotNumber nvarchar(80) NOT NULL,
  expiresOn date NOT NULL,
  location nvarchar(100) NOT NULL,
  ownership varchar(20) NOT NULL,
  ownerPatientId uniqueidentifier NULL,
  status varchar(20) NOT NULL DEFAULT ''''active'''',
  onHand int NOT NULL DEFAULT 0,
  reserved int NOT NULL DEFAULT 0,
  CONSTRAINT PK_StockLots PRIMARY KEY(clinicId,id),
  CONSTRAINT FK_StockLots_Product FOREIGN KEY(clinicId,productId) REFERENCES dbo.Products(clinicId,id),
  CONSTRAINT FK_StockLots_Owner FOREIGN KEY(clinicId,ownerPatientId) REFERENCES dbo.Patients(clinicId,id),
  CONSTRAINT CK_Stock_Owner CHECK((ownership=''''patient'''' AND ownerPatientId IS NOT NULL) OR (ownership IN (''''clinic'''',''''sample'''') AND ownerPatientId IS NULL)),
  CONSTRAINT CK_Stock_Status CHECK(status IN (''''active'''',''''quarantined'''')),
  CONSTRAINT CK_Stock_Balance CHECK(onHand>=0 AND reserved>=0 AND reserved<=onHand),
  CONSTRAINT UQ_Stock_Bucket UNIQUE(clinicId,productId,lotNumber,location,ownership,ownerPatientId)
);
CREATE INDEX IX_Stock_Expiration ON dbo.StockLots(clinicId,expiresOn);
CREATE TABLE dbo.StockMovements (
  clinicId uniqueidentifier NOT NULL,
  id uniqueidentifier NOT NULL,
  lotId uniqueidentifier NOT NULL,
  kind varchar(20) NOT NULL,
  quantity int NOT NULL,
  patientId uniqueidentifier NULL,
  reason nvarchar(300) NOT NULL,
  reversesId uniqueidentifier NULL,
  stockDelta int NOT NULL,
  reservedDelta int NOT NULL,
  actorId nvarchar(100) NOT NULL,
  createdAt datetime2(3) NOT NULL,
  CONSTRAINT PK_StockMovements PRIMARY KEY(clinicId,id),
  CONSTRAINT FK_Movement_Lot FOREIGN KEY(clinicId,lotId) REFERENCES dbo.StockLots(clinicId,id),
  CONSTRAINT FK_Movement_Patient FOREIGN KEY(clinicId,patientId) REFERENCES dbo.Patients(clinicId,id),
  CONSTRAINT FK_Movement_Reversal FOREIGN KEY(clinicId,reversesId) REFERENCES dbo.StockMovements(clinicId,id),
  CONSTRAINT CK_Movement_Kind CHECK(kind IN (''''receive'''',''''reserve'''',''''release'''',''''use'''',''''waste'''',''''adjust'''',''''reverse'''')),
  CONSTRAINT CK_Movement_Reversal CHECK((kind=''''reverse'''' AND reversesId IS NOT NULL AND quantity=0) OR (kind<>''''reverse'''' AND reversesId IS NULL AND quantity<>0)),
  CONSTRAINT CK_Movement_Positive CHECK(kind IN (''''reverse'''',''''adjust'''') OR quantity>0),
  CONSTRAINT CK_Movement_Patient CHECK(reservedDelta=0 OR patientId IS NOT NULL),
  CONSTRAINT CK_Movement_Deltas CHECK(
    (kind IN (''''receive'''',''''adjust'''') AND stockDelta=quantity AND reservedDelta=0) OR
    (kind=''''reserve'''' AND stockDelta=0 AND reservedDelta=quantity) OR
    (kind=''''release'''' AND stockDelta=0 AND reservedDelta=-quantity) OR
    (kind=''''use'''' AND stockDelta=-quantity AND reservedDelta=-quantity) OR
    (kind=''''waste'''' AND stockDelta=-quantity AND reservedDelta=0) OR kind=''''reverse'''')
);
CREATE UNIQUE INDEX UX_Movement_Reversal ON dbo.StockMovements(clinicId,reversesId) WHERE reversesId IS NOT NULL;
CREATE INDEX IX_Movement_LotPatient ON dbo.StockMovements(clinicId,lotId,patientId) INCLUDE(stockDelta,reservedDelta,createdAt);
CREATE TABLE dbo.CommandReceipts (
  clinicId uniqueidentifier NOT NULL REFERENCES dbo.Clinics(id),
  id uniqueidentifier NOT NULL,
  fingerprint char(64) NOT NULL,
  response nvarchar(max) NOT NULL CHECK(ISJSON(response)=1),
  createdAt datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT PK_CommandReceipts PRIMARY KEY(clinicId,id)
);
CREATE TABLE dbo.AuditEvents (
  clinicId uniqueidentifier NOT NULL REFERENCES dbo.Clinics(id),
  id uniqueidentifier NOT NULL,
  actorId nvarchar(100) NOT NULL,
  action nvarchar(80) NOT NULL,
  entityId uniqueidentifier NULL,
  occurredAt datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT PK_Audit PRIMARY KEY(clinicId,id)
);
CREATE TABLE dbo.OutboxEvents (
  clinicId uniqueidentifier NOT NULL REFERENCES dbo.Clinics(id),
  id uniqueidentifier NOT NULL,
  eventType nvarchar(80) NOT NULL,
  entityId uniqueidentifier NOT NULL,
  occurredAt datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
  dispatchedAt datetime2(3) NULL,
  attempts int NOT NULL DEFAULT 0,
  CONSTRAINT PK_Outbox PRIMARY KEY(clinicId,id)
);
CREATE INDEX IX_Outbox_Pending ON dbo.OutboxEvents(dispatchedAt,occurredAt);
-- Outbox capture only: no notification is sent until a dedicated, idempotent adapter is installed.
'';
    INSERT dbo.SchemaMigrations(name, checksum)
    VALUES(N''001_foundation.sql'', ''5baec4efd60d719e729ba05a0d2d441b5ad60d283076d3e6e7ae863c25b7da03'');
END;
';

    -- 002_runtime_role.sql: fe6a7161bfa4a9f2ef9942581fd1bbff99d66e6daf1c038ea385356ac117c464
    EXEC sys.sp_executesql N'
IF EXISTS (SELECT 1 FROM dbo.SchemaMigrations WHERE name = N''002_runtime_role.sql'')
BEGIN
    IF EXISTS (
        SELECT 1 FROM dbo.SchemaMigrations
        WHERE name = N''002_runtime_role.sql''
          AND checksum COLLATE Latin1_General_100_BIN2 <> ''fe6a7161bfa4a9f2ef9942581fd1bbff99d66e6daf1c038ea385356ac117c464''
    )
        THROW 51003, ''Applied migration changed: 002_runtime_role.sql'', 1;
END
ELSE
BEGIN
    EXEC sys.sp_executesql N''CREATE ROLE console_runtime;
GRANT SELECT ON dbo.Clinics TO console_runtime;
GRANT SELECT, INSERT ON dbo.Patients TO console_runtime;
GRANT SELECT, INSERT, UPDATE ON dbo.Activities TO console_runtime;
GRANT SELECT, INSERT ON dbo.Products TO console_runtime;
GRANT SELECT, INSERT, UPDATE ON dbo.StockLots TO console_runtime;
GRANT SELECT, INSERT ON dbo.StockMovements TO console_runtime;
GRANT SELECT, INSERT ON dbo.CommandReceipts TO console_runtime;
GRANT INSERT ON dbo.AuditEvents TO console_runtime;
GRANT INSERT ON dbo.OutboxEvents TO console_runtime;
DENY UPDATE, DELETE ON dbo.StockMovements TO console_runtime;
DENY UPDATE, DELETE ON dbo.AuditEvents TO console_runtime;
DENY UPDATE, DELETE ON dbo.CommandReceipts TO console_runtime;
-- The runtime role cannot migrate, provision clinics, or dispatch/delete outbox events.
'';
    INSERT dbo.SchemaMigrations(name, checksum)
    VALUES(N''002_runtime_role.sql'', ''fe6a7161bfa4a9f2ef9942581fd1bbff99d66e6daf1c038ea385356ac117c464'');
END;
';

    -- 003_injections.sql: f8628a2e78ab375ea1faee4722f0d1ee6b1615ec48b2e0b0178b585460a38b72
    EXEC sys.sp_executesql N'
IF EXISTS (SELECT 1 FROM dbo.SchemaMigrations WHERE name = N''003_injections.sql'')
BEGIN
    IF EXISTS (
        SELECT 1 FROM dbo.SchemaMigrations
        WHERE name = N''003_injections.sql''
          AND checksum COLLATE Latin1_General_100_BIN2 <> ''f8628a2e78ab375ea1faee4722f0d1ee6b1615ec48b2e0b0178b585460a38b72''
    )
        THROW 51003, ''Applied migration changed: 003_injections.sql'', 1;
END
ELSE
BEGIN
    EXEC sys.sp_executesql N''-- Relational identity and stock allocation with versioned JSON snapshots for order/review detail.
CREATE TABLE dbo.InjectionCases (
  clinicId uniqueidentifier NOT NULL,
  id uniqueidentifier NOT NULL,
  patientId uniqueidentifier NOT NULL,
  productId uniqueidentifier NOT NULL,
  tebraOrderReference nvarchar(200) NOT NULL,
  plannedOn date NOT NULL,
  doseSequence int NOT NULL CHECK(doseSequence BETWEEN 1 AND 10),
  status varchar(20) NOT NULL,
  version int NOT NULL,
  lotId uniqueidentifier NULL,
  stockUnits int NOT NULL DEFAULT 0,
  payload nvarchar(max) NOT NULL,
  updatedAt datetime2(3) NOT NULL,
  CONSTRAINT PK_InjectionCases PRIMARY KEY(clinicId,id),
  CONSTRAINT FK_Injection_Patient FOREIGN KEY(clinicId,patientId) REFERENCES dbo.Patients(clinicId,id),
  CONSTRAINT FK_Injection_Product FOREIGN KEY(clinicId,productId) REFERENCES dbo.Products(clinicId,id),
  CONSTRAINT FK_Injection_Lot FOREIGN KEY(clinicId,lotId) REFERENCES dbo.StockLots(clinicId,id),
  CONSTRAINT CK_Injection_Status CHECK(status IN (''''draft'''',''''reviewed'''',''''administered'''',''''held'''',''''cancelled'''')),
  CONSTRAINT CK_Injection_Version CHECK(version>0),
  CONSTRAINT CK_Injection_Json CHECK(ISJSON(payload)=1),
  CONSTRAINT CK_Injection_Allocation CHECK((status=''''reviewed'''' AND lotId IS NOT NULL AND stockUnits>0) OR (status<>''''reviewed'''' AND stockUnits=0))
);
CREATE UNIQUE INDEX UX_Injection_Occurrence ON dbo.InjectionCases(clinicId,patientId,productId,tebraOrderReference,plannedOn,doseSequence) WHERE status<>''''cancelled'''';
CREATE INDEX IX_Injection_Worklist ON dbo.InjectionCases(clinicId,plannedOn,status);
CREATE INDEX IX_Injection_Reservation ON dbo.InjectionCases(clinicId,lotId,patientId,status) INCLUDE(stockUnits);
CREATE TABLE dbo.InjectionEvents (
  clinicId uniqueidentifier NOT NULL,
  id uniqueidentifier NOT NULL,
  injectionId uniqueidentifier NOT NULL,
  version int NOT NULL,
  action nvarchar(80) NOT NULL,
  actorId nvarchar(100) NOT NULL,
  payload nvarchar(max) NOT NULL CHECK(ISJSON(payload)=1),
  occurredAt datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT PK_InjectionEvents PRIMARY KEY(clinicId,id),
  CONSTRAINT FK_InjectionEvents_Case FOREIGN KEY(clinicId,injectionId) REFERENCES dbo.InjectionCases(clinicId,id),
  CONSTRAINT UQ_InjectionEvent_Version UNIQUE(clinicId,injectionId,version)
);
CREATE TABLE dbo.InjectionStockLinks (
  clinicId uniqueidentifier NOT NULL,
  movementId uniqueidentifier NOT NULL,
  injectionId uniqueidentifier NOT NULL,
  CONSTRAINT PK_InjectionStockLinks PRIMARY KEY(clinicId,movementId),
  CONSTRAINT FK_InjectionStock_Movement FOREIGN KEY(clinicId,movementId) REFERENCES dbo.StockMovements(clinicId,id),
  CONSTRAINT FK_InjectionStock_Case FOREIGN KEY(clinicId,injectionId) REFERENCES dbo.InjectionCases(clinicId,id)
);
CREATE TABLE dbo.InjectionAdministrations (
  clinicId uniqueidentifier NOT NULL,
  id uniqueidentifier NOT NULL,
  injectionId uniqueidentifier NOT NULL,
  stockMovementId uniqueidentifier NOT NULL,
  payload nvarchar(max) NOT NULL CHECK(ISJSON(payload)=1),
  CONSTRAINT PK_InjectionAdministrations PRIMARY KEY(clinicId,id),
  CONSTRAINT UQ_InjectionAdministration UNIQUE(clinicId,injectionId),
  CONSTRAINT UQ_InjectionAdministration_Stock UNIQUE(clinicId,stockMovementId),
  CONSTRAINT FK_InjectionAdministration_Case FOREIGN KEY(clinicId,injectionId) REFERENCES dbo.InjectionCases(clinicId,id),
  CONSTRAINT FK_InjectionAdministration_Movement FOREIGN KEY(clinicId,stockMovementId) REFERENCES dbo.StockMovements(clinicId,id)
);
CREATE TABLE dbo.InjectionAmendments (
  clinicId uniqueidentifier NOT NULL,
  id uniqueidentifier NOT NULL,
  injectionId uniqueidentifier NOT NULL,
  payload nvarchar(max) NOT NULL CHECK(ISJSON(payload)=1),
  CONSTRAINT PK_InjectionAmendments PRIMARY KEY(clinicId,id),
  CONSTRAINT FK_InjectionAmendment_Case FOREIGN KEY(clinicId,injectionId) REFERENCES dbo.InjectionCases(clinicId,id)
);
CREATE TABLE dbo.InjectionFilings (
  clinicId uniqueidentifier NOT NULL,
  id uniqueidentifier NOT NULL,
  injectionId uniqueidentifier NOT NULL,
  payload nvarchar(max) NOT NULL CHECK(ISJSON(payload)=1),
  CONSTRAINT PK_InjectionFilings PRIMARY KEY(clinicId,id),
  CONSTRAINT FK_InjectionFiling_Case FOREIGN KEY(clinicId,injectionId) REFERENCES dbo.InjectionCases(clinicId,id)
);
GRANT SELECT,INSERT,UPDATE ON dbo.InjectionCases TO console_runtime;
DENY DELETE ON dbo.InjectionCases TO console_runtime;
GRANT SELECT,INSERT ON dbo.InjectionEvents TO console_runtime;
GRANT SELECT,INSERT ON dbo.InjectionStockLinks TO console_runtime;
GRANT SELECT,INSERT ON dbo.InjectionAdministrations TO console_runtime;
GRANT SELECT,INSERT ON dbo.InjectionAmendments TO console_runtime;
GRANT SELECT,INSERT ON dbo.InjectionFilings TO console_runtime;
DENY UPDATE,DELETE ON dbo.InjectionEvents TO console_runtime;
DENY UPDATE,DELETE ON dbo.InjectionStockLinks TO console_runtime;
DENY UPDATE,DELETE ON dbo.InjectionAdministrations TO console_runtime;
DENY UPDATE,DELETE ON dbo.InjectionAmendments TO console_runtime;
DENY UPDATE,DELETE ON dbo.InjectionFilings TO console_runtime;
'';
    INSERT dbo.SchemaMigrations(name, checksum)
    VALUES(N''003_injections.sql'', ''f8628a2e78ab375ea1faee4722f0d1ee6b1615ec48b2e0b0178b585460a38b72'');
END;
';

    -- 004_pin_auth.sql: e36690333c010aaa13f02bd9013d27e039e19289dc8f08dedb2c7c84ba5c770c
    EXEC sys.sp_executesql N'
IF EXISTS (SELECT 1 FROM dbo.SchemaMigrations WHERE name = N''004_pin_auth.sql'')
BEGIN
    IF EXISTS (
        SELECT 1 FROM dbo.SchemaMigrations
        WHERE name = N''004_pin_auth.sql''
          AND checksum COLLATE Latin1_General_100_BIN2 <> ''e36690333c010aaa13f02bd9013d27e039e19289dc8f08dedb2c7c84ba5c770c''
    )
        THROW 51003, ''Applied migration changed: 004_pin_auth.sql'', 1;
END
ELSE
BEGIN
    EXEC sys.sp_executesql N''CREATE TABLE dbo.PinStaff (
  clinicId uniqueidentifier NOT NULL,
  id uniqueidentifier NOT NULL DEFAULT NEWID(),
  staffCode nvarchar(40) NOT NULL,
  displayName nvarchar(120) NOT NULL,
  pinHash nvarchar(220) NOT NULL,
  rolesJson nvarchar(300) NOT NULL,
  credentialVersion int NOT NULL DEFAULT 1,
  disabled bit NOT NULL DEFAULT 0,
  createdAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT PK_PinStaff PRIMARY KEY(clinicId,id),
  CONSTRAINT UQ_PinStaff_Code UNIQUE(clinicId,staffCode),
  CONSTRAINT FK_PinStaff_Clinic FOREIGN KEY(clinicId) REFERENCES dbo.Clinics(id),
  CONSTRAINT CK_PinStaff_Roles CHECK(ISJSON(rolesJson)=1),
  CONSTRAINT CK_PinStaff_Version CHECK(credentialVersion>0)
);
CREATE TABLE dbo.PinSessions (
  clinicId uniqueidentifier NOT NULL,
  sessionHash char(64) NOT NULL,
  staffId uniqueidentifier NOT NULL,
  credentialVersion int NOT NULL,
  createdAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
  lastSeen datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
  revokedAt datetime2 NULL,
  CONSTRAINT PK_PinSessions PRIMARY KEY(clinicId,sessionHash),
  CONSTRAINT FK_PinSessions_Staff FOREIGN KEY(clinicId,staffId) REFERENCES dbo.PinStaff(clinicId,id)
);
CREATE INDEX IX_PinSessions_Staff ON dbo.PinSessions(clinicId,staffId,revokedAt);
CREATE TABLE dbo.PinAttempts (
  clinicId uniqueidentifier NOT NULL,
  bucketKey char(64) NOT NULL,
  attempts int NOT NULL,
  windowStart datetime2 NOT NULL,
  blockedUntil datetime2 NULL,
  CONSTRAINT PK_PinAttempts PRIMARY KEY(clinicId,bucketKey),
  CONSTRAINT FK_PinAttempts_Clinic FOREIGN KEY(clinicId) REFERENCES dbo.Clinics(id),
  CONSTRAINT CK_PinAttempts_Count CHECK(attempts>=0)
);
CREATE TABLE dbo.PinAccessEvents (
  id bigint IDENTITY(1,1) NOT NULL PRIMARY KEY,
  clinicId uniqueidentifier NOT NULL,
  staffId uniqueidentifier NULL,
  event nvarchar(30) NOT NULL,
  ipHash char(64) NULL,
  administrator nvarchar(128) NULL,
  occurredAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT FK_PinAccessEvents_Clinic FOREIGN KEY(clinicId) REFERENCES dbo.Clinics(id),
  CONSTRAINT CK_PinAccessEvents_Event CHECK(event IN(''''signed_in'''',''''sign_in_failed'''',''''sign_in_throttled'''',''''staff_created'''',''''staff_reset'''',''''staff_disabled'''',''''staff_revoked''''))
);
CREATE INDEX IX_PinAccessEvents_ClinicTime ON dbo.PinAccessEvents(clinicId,occurredAt);
GRANT SELECT ON dbo.PinStaff TO console_runtime;
DENY INSERT,UPDATE,DELETE ON dbo.PinStaff TO console_runtime;
GRANT SELECT,INSERT,UPDATE ON dbo.PinSessions TO console_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON dbo.PinAttempts TO console_runtime;
GRANT INSERT ON dbo.PinAccessEvents TO console_runtime;
DENY UPDATE,DELETE ON dbo.PinAccessEvents TO console_runtime;
'';
    INSERT dbo.SchemaMigrations(name, checksum)
    VALUES(N''004_pin_auth.sql'', ''e36690333c010aaa13f02bd9013d27e039e19289dc8f08dedb2c7c84ba5c770c'');
END;
';

    EXEC sys.sp_executesql N'
DECLARE @ClinicId uniqueidentifier = ''0574d019-3142-4edc-804e-6bf4f33e45e3'';
DECLARE @ClinicName nvarchar(160) = N''IPMG San Bernardino — TEST'';
DECLARE @Timezone nvarchar(80) = N''America/Los_Angeles'';
IF EXISTS (SELECT 1 FROM dbo.Clinics WHERE id = @ClinicId)
BEGIN
    IF EXISTS (
        SELECT 1 FROM dbo.Clinics WHERE id = @ClinicId
          AND (name COLLATE Latin1_General_100_BIN2 <> @ClinicName
            OR timezone COLLATE Latin1_General_100_BIN2 <> @Timezone)
    )
        THROW 51004, ''Existing test clinic identity has different name or timezone; no changes made.'', 1;
END
ELSE
    INSERT dbo.Clinics(id, name, timezone) VALUES(@ClinicId, @ClinicName, @Timezone);

-- For an application, Azure SQL CREATE USER WITH SID/TYPE=E uses the application/client ID.
-- Microsoft CREATE USER docs, section K; enterprise OBJECT ID is a different syntax.
DECLARE @RuntimeName sysname = N''console-app'';
DECLARE @RuntimeClientId uniqueidentifier = ''88c516fe-2d78-4faf-bf37-ef8850269ef7'';
DECLARE @RuntimeSid varbinary(16) = CONVERT(binary(16), @RuntimeClientId);
DECLARE @RuntimePrincipalId int;
DECLARE @RuntimeRoleId int;
SELECT @RuntimeRoleId = principal_id FROM sys.database_principals
WHERE name = N''console_runtime'' AND type = ''R'' AND is_fixed_role = 0;
IF @RuntimeRoleId IS NULL
    THROW 51005, ''Expected nonfixed console_runtime database role is missing.'', 1;
IF EXISTS (SELECT 1 FROM sys.database_role_members WHERE member_principal_id = @RuntimeRoleId)
    THROW 51006, ''console_runtime is nested in another role; refusing broader runtime access.'', 1;

IF EXISTS (
    SELECT 1 FROM sys.database_principals
    WHERE name = @RuntimeName
      AND (type <> ''E'' OR authentication_type_desc <> N''EXTERNAL'' OR sid <> @RuntimeSid)
)
    THROW 51007, ''Existing console-app does not match the verified external service-principal identity.'', 1;
IF EXISTS (SELECT 1 FROM sys.database_principals WHERE sid = @RuntimeSid AND name <> @RuntimeName)
    THROW 51008, ''Verified service-principal SID already exists under a different database principal name.'', 1;

IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = @RuntimeName)
BEGIN
    DECLARE @CreateUser nvarchar(max) =
        N''CREATE USER '' + QUOTENAME(@RuntimeName) + N'' WITH SID = ''
        + CONVERT(varchar(34), @RuntimeSid, 1) + N'', TYPE = E;'';
    EXEC sys.sp_executesql @CreateUser;
END;

SELECT @RuntimePrincipalId = principal_id FROM sys.database_principals
WHERE name = @RuntimeName AND type = ''E'' AND authentication_type_desc = N''EXTERNAL'' AND sid = @RuntimeSid;
IF @RuntimePrincipalId IS NULL
    THROW 51009, ''Runtime principal did not validate after creation.'', 1;
IF EXISTS (
    SELECT 1 FROM sys.database_role_members
    WHERE member_principal_id = @RuntimePrincipalId AND role_principal_id <> @RuntimeRoleId
)
    THROW 51010, ''Existing runtime user belongs to another role; refusing broader runtime access.'', 1;
IF EXISTS (
    SELECT 1 FROM sys.database_permissions
    WHERE grantee_principal_id = @RuntimePrincipalId
      AND NOT (class = 0 AND major_id = 0 AND permission_name = N''CONNECT'' AND state = ''G'')
)
    THROW 51011, ''Existing runtime user has direct permissions beyond CONNECT; refusing to change it.'', 1;
IF EXISTS (SELECT 1 FROM sys.schemas WHERE principal_id = @RuntimePrincipalId)
    OR EXISTS (SELECT 1 FROM sys.database_principals WHERE owning_principal_id = @RuntimePrincipalId)
    OR EXISTS (SELECT 1 FROM sys.objects WHERE principal_id = @RuntimePrincipalId)
    THROW 51012, ''Existing runtime user owns database securables; refusing broader runtime access.'', 1;

IF NOT EXISTS (
    SELECT 1 FROM sys.database_role_members
    WHERE member_principal_id = @RuntimePrincipalId AND role_principal_id = @RuntimeRoleId
)
    ALTER ROLE [console_runtime] ADD MEMBER [console-app];
';

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;

-- Read-only success receipts; no secrets are returned.
EXEC sys.sp_executesql N'
SELECT N''Bootstrap committed'' AS result, DB_NAME() AS databaseName;
SELECT name, checksum, appliedAt FROM dbo.SchemaMigrations ORDER BY name;
SELECT id, name, timezone FROM dbo.Clinics
WHERE id = ''0574d019-3142-4edc-804e-6bf4f33e45e3'';
SELECT p.name AS runtimeUser, p.type_desc, p.authentication_type_desc,
       CONVERT(uniqueidentifier, p.sid) AS applicationClientId, r.name AS roleName
FROM sys.database_principals p
JOIN sys.database_role_members m ON m.member_principal_id = p.principal_id
JOIN sys.database_principals r ON r.principal_id = m.role_principal_id
WHERE p.name = N''console-app'';
SELECT COUNT_BIG(*) AS enrolledStaffCount FROM dbo.PinStaff;';
