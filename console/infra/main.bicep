targetScope = 'resourceGroup'

@description('Globally unique app and SQL name prefix, 3–24 lowercase letters/digits/hyphens.')
@minLength(3)
@maxLength(24)
param name string
param location string = resourceGroup().location
param clinicId string
param tenantId string = tenant().tenantId
param apiClientId string
param webClientId string
param sqlAdminGroupObjectId string
param sqlAdminGroupName string
param clinicTimezone string = 'America/Los_Angeles'

resource network 'Microsoft.Network/virtualNetworks@2023-11-01' = {
  name: '${name}-vnet'
  location: location
  properties: {
    addressSpace: { addressPrefixes: ['10.42.0.0/16'] }
    subnets: [
      {
        name: 'app-integration'
        properties: {
          addressPrefix: '10.42.0.0/24'
          delegations: [{ name: 'web', properties: { serviceName: 'Microsoft.Web/serverFarms' } }]
        }
      }
      {
        name: 'private-endpoints'
        properties: { addressPrefix: '10.42.1.0/24', privateEndpointNetworkPolicies: 'Disabled' }
      }
    ]
  }
}
resource dns 'Microsoft.Network/privateDnsZones@2020-06-01' = {
  name: 'privatelink.database.windows.net'
  location: 'global'
}
resource dnsLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2020-06-01' = {
  parent: dns
  name: '${name}-link'
  location: 'global'
  properties: { registrationEnabled: false, virtualNetwork: { id: network.id } }
}
resource sqlServer 'Microsoft.Sql/servers@2023-08-01' = {
  name: '${name}-sql'
  location: location
  properties: {
    version: '12.0'
    minimalTlsVersion: '1.2'
    publicNetworkAccess: 'Disabled'
    administrators: {
      administratorType: 'ActiveDirectory'
      azureADOnlyAuthentication: true
      principalType: 'Group'
      login: sqlAdminGroupName
      sid: sqlAdminGroupObjectId
      tenantId: tenantId
    }
  }
}
resource database 'Microsoft.Sql/servers/databases@2023-08-01' = {
  parent: sqlServer
  name: 'clinic-console'
  location: location
  sku: { name: 'Basic', tier: 'Basic', capacity: 5 }
  properties: { maxSizeBytes: 2147483648, requestedBackupStorageRedundancy: 'Local' }
}
resource backupRetention 'Microsoft.Sql/servers/databases/backupShortTermRetentionPolicies@2023-08-01' = {
  parent: database
  name: 'default'
  properties: { retentionDays: 7 }
}
resource endpoint 'Microsoft.Network/privateEndpoints@2023-11-01' = {
  name: '${name}-sql-private'
  location: location
  properties: {
    subnet: { id: network.properties.subnets[1].id }
    privateLinkServiceConnections: [{
      name: 'sql'
      properties: { privateLinkServiceId: sqlServer.id, groupIds: ['sqlServer'] }
    }]
  }
}
resource zoneGroup 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2023-11-01' = {
  parent: endpoint
  name: 'default'
  properties: { privateDnsZoneConfigs: [{ name: 'sql', properties: { privateDnsZoneId: dns.id } }] }
}
resource plan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: '${name}-plan'
  location: location
  kind: 'linux'
  sku: { name: 'B1', tier: 'Basic', capacity: 1 }
  properties: { reserved: true }
}
resource app 'Microsoft.Web/sites@2023-12-01' = {
  name: name
  location: location
  kind: 'app,linux'
  identity: { type: 'SystemAssigned' }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    virtualNetworkSubnetId: network.properties.subnets[0].id
    siteConfig: {
      linuxFxVersion: 'NODE|22-lts'
      appCommandLine: 'npm start'
      alwaysOn: true
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      scmMinTlsVersion: '1.2'
      http20Enabled: true
      healthCheckPath: '/api/health'
      appSettings: [
        { name: 'NODE_ENV', value: 'production' }
        { name: 'CONSOLE_MODE', value: 'sql' }
        { name: 'HOST', value: '0.0.0.0' }
        { name: 'CLINIC_ID', value: clinicId }
        { name: 'CLINIC_TIMEZONE', value: clinicTimezone }
        { name: 'ENTRA_TENANT_ID', value: tenantId }
        { name: 'ENTRA_API_CLIENT_ID', value: apiClientId }
        { name: 'ENTRA_WEB_CLIENT_ID', value: webClientId }
        { name: 'SQL_SERVER', value: sqlServer.properties.fullyQualifiedDomainName }
        { name: 'SQL_DATABASE', value: database.name }
        { name: 'SQL_AUTH', value: 'azure-active-directory-default' }
        { name: 'SCM_DO_BUILD_DURING_DEPLOYMENT', value: 'false' }
        { name: 'WEBSITE_RUN_FROM_PACKAGE', value: '1' }
      ]
    }
  }
}
output appUrl string = 'https://${app.properties.defaultHostName}'
output runtimeIdentityObjectId string = app.identity.principalId
output sqlHost string = sqlServer.properties.fullyQualifiedDomainName
output databaseName string = database.name
output networkId string = network.id
