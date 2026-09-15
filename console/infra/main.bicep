targetScope = 'resourceGroup'

@description('Globally unique app and SQL name prefix, 3–24 lowercase letters/digits/hyphens.')
@minLength(3)
@maxLength(24)
param name string
param location string = resourceGroup().location
param clinicId string
param tenantId string = tenant().tenantId
@allowed(['pin', 'entra'])
param authMode string = 'pin'
param apiClientId string = ''
param webClientId string = ''
@description('Optional HTTPS origin for a custom domain; empty uses the actual App Service default hostname.')
param publicOrigin string = ''
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
  name: 'privatelink${environment().suffixes.sqlServerHostname}'
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
    }
  }
}
// Resolve the actual hostname after site creation; newer sites may have a generated suffix.
resource appSettings 'Microsoft.Web/sites/config@2023-12-01' = {
  parent: app
  name: 'appsettings'
  properties: {
    NODE_ENV: 'production'
    CONSOLE_MODE: 'sql'
    AUTH_MODE: authMode
    PUBLIC_ORIGIN: empty(publicOrigin) ? 'https://${app.properties.defaultHostName}' : publicOrigin
    HOST: '0.0.0.0'
    CLINIC_ID: clinicId
    CLINIC_TIMEZONE: clinicTimezone
    ENTRA_TENANT_ID: tenantId
    ENTRA_API_CLIENT_ID: apiClientId
    ENTRA_WEB_CLIENT_ID: webClientId
    SQL_SERVER: sqlServer.properties.fullyQualifiedDomainName
    SQL_DATABASE: database.name
    SQL_AUTH: 'azure-active-directory-default'
    SCM_DO_BUILD_DURING_DEPLOYMENT: 'false'
    WEBSITE_RUN_FROM_PACKAGE: '1'
  }
}
output appUrl string = 'https://${app.properties.defaultHostName}'
output appName string = app.name
output planName string = plan.name
output integrationSubnetId string = network.properties.subnets[0].id
output runtimeIdentityObjectId string = app.identity.principalId
output sqlHost string = sqlServer.properties.fullyQualifiedDomainName
output sqlServerName string = sqlServer.name
output databaseName string = database.name
output networkId string = network.id
