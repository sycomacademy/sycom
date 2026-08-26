using '../main.local-deploy.bicep'

param location = 'uksouth'
param projectName = 'sycomlearn'
param environmentName = 'prod'

// Production resource names.
param containerRegistryName = 'sycomlearnprodacr01'
param keyVaultName = 'sycomlearnprodkv01'
param logAnalyticsWorkspaceName = 'sycomlearn-prod-logs'
param containerAppsEnvironmentName = 'sycomlearn-prod-cae'
param appName = 'sycomlearn-prod-app'
param appServicePlanName = 'sycomlearn-prod-plan'
param webAppName = 'sycomlearn-prod-web'
param keyVaultAdminObjectId = 'edee4978-903c-44c1-8ff4-590a926e1d82'

// Azure Database for PostgreSQL Flexible Server (production; created in portal).
param postgresServerName = 'sycomlearn-prod-postgres'
param postgresDatabaseName = 'sycom'
param postgresAdminLogin = 'sycomadmin'
param postgresSkuName = 'Standard_B1ms'
param postgresSkuTier = 'Burstable'
param postgresStorageGb = 32
param postgresVersion = '18'

// SPA on Azure Web App; API on Container Apps.
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
  managedBy: 'az-cli'
}
