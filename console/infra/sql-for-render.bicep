targetScope = 'resourceGroup'

@description('Globally unique SQL server name.')
param serverName string
param location string = resourceGroup().location
param sqlAdminObjectId string
param sqlAdminName string
@allowed(['Group', 'User'])
param sqlAdminType string = 'Group'

@description('Only verified Render outbound IPv4 ranges, plus a temporary migration workstation IP if needed. Empty leaves SQL firewalled from all public clients.')
param allowedIpv4Ranges { name: string, start: string, end: string }[] = []

resource server 'Microsoft.Sql/servers@2023-08-01' = {
  name: serverName
  location: location
  properties: {
    version: '12.0'
    minimalTlsVersion: '1.2'
    // Render uses SQL's TLS public endpoint, restricted by the rules below.
    // No "Allow all Azure services" or wildcard rule is created.
    publicNetworkAccess: 'Enabled'
    administrators: {
      administratorType: 'ActiveDirectory'
      azureADOnlyAuthentication: true
      principalType: sqlAdminType
      login: sqlAdminName
      sid: sqlAdminObjectId
      tenantId: tenant().tenantId
    }
  }
}
resource database 'Microsoft.Sql/servers/databases@2023-08-01' = {
  parent: server
  name: 'clinic-console'
  location: location
  sku: { name: 'GP_S_Gen5', tier: 'GeneralPurpose', family: 'Gen5', capacity: 2 }
  properties: {
    useFreeLimit: true
    freeLimitExhaustionBehavior: 'AutoPause'
    minCapacity: json('0.5')
    autoPauseDelay: 60
    maxSizeBytes: 34359738368
    requestedBackupStorageRedundancy: 'Local'
  }
}
resource backups 'Microsoft.Sql/servers/databases/backupShortTermRetentionPolicies@2023-08-01' = {
  parent: database
  name: 'default'
  properties: { retentionDays: 7 }
}
resource firewall 'Microsoft.Sql/servers/firewallRules@2023-08-01' = [for item in allowedIpv4Ranges: {
  parent: server
  name: item.name
  properties: { startIpAddress: item.start, endIpAddress: item.end }
}]

output sqlHost string = server.properties.fullyQualifiedDomainName
output databaseName string = database.name
