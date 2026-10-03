CREATE TABLE dbo.PinStaff (
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
  CONSTRAINT CK_PinAccessEvents_Event CHECK(event IN('signed_in','sign_in_failed','sign_in_throttled','staff_created','staff_reset','staff_disabled','staff_revoked'))
);
CREATE INDEX IX_PinAccessEvents_ClinicTime ON dbo.PinAccessEvents(clinicId,occurredAt);
GRANT SELECT ON dbo.PinStaff TO console_runtime;
DENY INSERT,UPDATE,DELETE ON dbo.PinStaff TO console_runtime;
GRANT SELECT,INSERT,UPDATE ON dbo.PinSessions TO console_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON dbo.PinAttempts TO console_runtime;
GRANT INSERT ON dbo.PinAccessEvents TO console_runtime;
DENY UPDATE,DELETE ON dbo.PinAccessEvents TO console_runtime;
