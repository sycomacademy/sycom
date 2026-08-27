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
// Pre-provisioned via `az containerapp env certificate list` — rebind target
// after any incident that drops the custom domain, so this is declared here
// rather than left to whoever last ran `az containerapp hostname bind`.
param dashboardCustomDomainName = 'learn.sycom.academy'
param dashboardCertificateName = 'learn.sycom.academy-sycomlea-260519133833'
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
