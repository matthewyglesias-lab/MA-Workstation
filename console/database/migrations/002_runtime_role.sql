CREATE ROLE console_runtime;
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
