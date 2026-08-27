using '../main.bicep'

param location = 'uksouth'
param projectName = 'sycomlearn'
param environmentName = 'prod'

// Production resource names
param containerRegistryName = 'sycomlearnprodacr01'
param logAnalyticsWorkspaceName = 'sycomlearn-prod-logs'
param containerAppsEnvironmentName = 'sycomlearn-prod-cae'
param dashboardAppName = 'sycomlearn-prod-dashboard'
param serverAppName = 'sycomlearn-prod-server'
param migrateJobName = 'sycomlearn-prod-migrate'

// Azure Database for PostgreSQL Flexible Server
param postgresServerName = 'sycomlearn-prod-postgres'
param postgresDatabaseName = 'sycom'
param postgresAdminLogin = 'sycomadmin'
param postgresSkuName = 'Standard_B1ms'
param postgresSkuTier = 'Burstable'
param postgresStorageGb = 32
param postgresVersion = '18'

param dashboardUrl = 'https://learn.sycom.academy'
param websiteUrl = 'https://sycomsolutions.com'
param corsOrigins = [
  'https://learn.sycom.academy'
  'https://sycomsolutions.com'
]

param debugPerformance = 'false'

param tags = {
  owner: 'sycom'
  workload: 'lms'
  environment: 'prod'
  managedBy: 'github-actions'
}
