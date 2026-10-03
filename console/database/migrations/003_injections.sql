-- Relational identity and stock allocation with versioned JSON snapshots for order/review detail.
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
  CONSTRAINT CK_Injection_Status CHECK(status IN ('draft','reviewed','administered','held','cancelled')),
  CONSTRAINT CK_Injection_Version CHECK(version>0),
  CONSTRAINT CK_Injection_Json CHECK(ISJSON(payload)=1),
  CONSTRAINT CK_Injection_Allocation CHECK((status='reviewed' AND lotId IS NOT NULL AND stockUnits>0) OR (status<>'reviewed' AND stockUnits=0))
);
CREATE UNIQUE INDEX UX_Injection_Occurrence ON dbo.InjectionCases(clinicId,patientId,productId,tebraOrderReference,plannedOn,doseSequence) WHERE status<>'cancelled';
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
