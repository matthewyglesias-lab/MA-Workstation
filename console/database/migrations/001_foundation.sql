CREATE TABLE dbo.Clinics (
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
  status varchar(20) NOT NULL DEFAULT 'planned',
  handoff varchar(20) NOT NULL DEFAULT 'pending',
  tebraReference nvarchar(200) NULL,
  version int NOT NULL DEFAULT 1,
  createdAt datetime2(3) NOT NULL,
  updatedAt datetime2(3) NOT NULL,
  CONSTRAINT PK_Activities PRIMARY KEY (clinicId,id),
  CONSTRAINT FK_Activities_Patient FOREIGN KEY(clinicId,patientId) REFERENCES dbo.Patients(clinicId,id),
  CONSTRAINT CK_Activity_Service CHECK(service IN ('Injection','UDS','TMS','Samples','Forms')),
  CONSTRAINT CK_Activity_Status CHECK(status IN ('planned','in_progress','completed')),
  CONSTRAINT CK_Activity_Handoff CHECK(handoff IN ('pending','prepared','filed')),
  CONSTRAINT CK_Activity_Reference CHECK((handoff='filed' AND status='completed' AND tebraReference IS NOT NULL) OR (handoff<>'filed' AND tebraReference IS NULL))
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
  CONSTRAINT CK_Product_Unit CHECK(unit IN ('syringe','kit','tablet','capsule','vial'))
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
  status varchar(20) NOT NULL DEFAULT 'active',
  onHand int NOT NULL DEFAULT 0,
  reserved int NOT NULL DEFAULT 0,
  CONSTRAINT PK_StockLots PRIMARY KEY(clinicId,id),
  CONSTRAINT FK_StockLots_Product FOREIGN KEY(clinicId,productId) REFERENCES dbo.Products(clinicId,id),
  CONSTRAINT FK_StockLots_Owner FOREIGN KEY(clinicId,ownerPatientId) REFERENCES dbo.Patients(clinicId,id),
  CONSTRAINT CK_Stock_Owner CHECK((ownership='patient' AND ownerPatientId IS NOT NULL) OR (ownership IN ('clinic','sample') AND ownerPatientId IS NULL)),
  CONSTRAINT CK_Stock_Status CHECK(status IN ('active','quarantined')),
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
  CONSTRAINT CK_Movement_Kind CHECK(kind IN ('receive','reserve','release','use','waste','adjust','reverse')),
  CONSTRAINT CK_Movement_Reversal CHECK((kind='reverse' AND reversesId IS NOT NULL AND quantity=0) OR (kind<>'reverse' AND reversesId IS NULL AND quantity<>0)),
  CONSTRAINT CK_Movement_Positive CHECK(kind IN ('reverse','adjust') OR quantity>0),
  CONSTRAINT CK_Movement_Patient CHECK(reservedDelta=0 OR patientId IS NOT NULL),
  CONSTRAINT CK_Movement_Deltas CHECK(
    (kind IN ('receive','adjust') AND stockDelta=quantity AND reservedDelta=0) OR
    (kind='reserve' AND stockDelta=0 AND reservedDelta=quantity) OR
    (kind='release' AND stockDelta=0 AND reservedDelta=-quantity) OR
    (kind='use' AND stockDelta=-quantity AND reservedDelta=-quantity) OR
    (kind='waste' AND stockDelta=-quantity AND reservedDelta=0) OR kind='reverse')
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
