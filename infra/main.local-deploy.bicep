targetScope = 'resourceGroup'

@description('Azure region for this environment.')
param location string = resourceGroup().location

@description('Project name prefix used in resource naming.')
param projectName string = 'sycomlearn'

@description('Environment name, usually prod.')
param environmentName string = 'prod'

@description('Deploy only shared infrastructure when false, or infrastructure plus the app when true.')
param deployApps bool = true

@description('Globally unique Azure Container Registry name.')
param containerRegistryName string

@description('Globally unique Azure Key Vault name.')
param keyVaultName string

@description('Log Analytics workspace name.')
param logAnalyticsWorkspaceName string = '${projectName}-${environmentName}-logs'

@description('Container Apps environment name.')
param containerAppsEnvironmentName string = '${projectName}-${environmentName}-cae'

@description('Container App name for the API server.')
param appName string = '${projectName}-${environmentName}-app'

@description('Linux App Service plan name for the SPA.')
param appServicePlanName string = '${projectName}-${environmentName}-plan'

@description('Azure Web App name for the dashboard SPA.')
param webAppName string = '${projectName}-${environmentName}-web'

@description('Server image reference in ACR.')
param serverImage string = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'

@description('Public dashboard SPA URL (custom domain or azurewebsites.net).')
param dashboardUrl string = ''

@description('Public API URL. Defaults to the Container App FQDN when empty.')
param serverUrl string = ''

@description('Optional public website URL used by server-side links.')
param websiteUrl string = 'https://sycomsolutions.com'

@description('Allowed browser origins for the server.')
param corsOrigins array = []

@description('Server container port.')
param serverTargetPort int = 3000

@description('Minimum app replicas.')
param appMinReplicas int = 1

@description('Maximum app replicas.')
param appMaxReplicas int = 2

@description('Object ID that should get Key Vault secret permissions.')
param keyVaultAdminObjectId string

@allowed([
  'true'
  'false'
])
param debugPerformance string = 'false'

@description('Provision Azure Database for PostgreSQL Flexible Server. Set false for Neon or other external Postgres.')
param deployPostgres bool = true

@description('External Postgres connection string when deployPostgres is false (e.g. Neon). Stored in Key Vault as database-url.')
@secure()
param databaseUrl string = ''

@description('Globally unique PostgreSQL flexible server name.')
param postgresServerName string = ''

@description('Application database name on the flexible server.')
param postgresDatabaseName string = 'sycom'

@description('PostgreSQL administrator login.')
param postgresAdminLogin string = ''

@secure()
param postgresAdminPassword string = ''

@description('Flexible server SKU name.')
param postgresSkuName string = 'Standard_B1ms'

@description('Flexible server SKU tier.')
param postgresSkuTier string = 'Burstable'

@description('Storage size in GB.')
param postgresStorageGb int = 32

@description('PostgreSQL major version.')
param postgresVersion string = '18'

@secure()
param betterAuthSecret string = ''

@secure()
param betterAuthApiKey string = ''

@secure()
param googleClientId string = ''

@secure()
param googleClientSecret string = ''

@secure()
param linkedinClientId string = ''

@secure()
param linkedinClientSecret string = ''

@secure()
param cloudinaryCloudName string = ''

@secure()
param cloudinaryApiKey string = ''

@secure()
param cloudinaryApiSecret string = ''

@secure()
param resendApiKey string = ''

@secure()
param resendEmailFrom string = ''

@secure()
param resendEmailReplyTo string = ''

@secure()
param aiGatewayApiKey string = ''

@description('Common tags applied to created resources.')
param tags object = {}

var mergedTags = union(tags, {
  project: projectName
})

var acrUsername = containerRegistry.listCredentials().username
var acrPassword = containerRegistry.listCredentials().passwords[0].value
var effectiveDatabaseUrl = deployPostgres
  ? 'postgresql://${postgresAdminLogin}:${uriComponent(postgresAdminPassword)}@${postgres!.properties.fullyQualifiedDomainName}:5432/${postgresDatabaseName}?sslmode=require'
  : databaseUrl
var serverFqdn = '${appName}.${containerAppsEnvironment.properties.defaultDomain}'
var effectiveServerUrl = empty(serverUrl) ? 'https://${serverFqdn}' : serverUrl
var webAppUrl = 'https://${webApp.properties.defaultHostName}'
var defaultCorsOrigins = empty(websiteUrl)
  ? [dashboardUrl, webAppUrl]
  : [dashboardUrl, websiteUrl, webAppUrl]
var effectiveCorsOrigins = length(corsOrigins) > 0 ? concat(corsOrigins, [webAppUrl]) : defaultCorsOrigins
var corsOriginValue = join(effectiveCorsOrigins, ',')

resource logAnalyticsWorkspace 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: logAnalyticsWorkspaceName
  location: location
  properties: {
    retentionInDays: 30
    features: {
      enableLogAccessUsingOnlyResourcePermissions: true
    }
  }
  sku: {
    name: 'PerGB2018'
  }
  tags: mergedTags
}

resource containerRegistry 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: containerRegistryName
  location: location
  sku: {
    name: 'Basic'
  }
  properties: {
    adminUserEnabled: true
    publicNetworkAccess: 'Enabled'
  }
  tags: mergedTags
}

resource keyVault 'Microsoft.KeyVault/vaults@2023-02-01' = {
  name: keyVaultName
  location: location
  properties: {
    enableRbacAuthorization: false
    enablePurgeProtection: true
    enabledForDeployment: false
    enabledForDiskEncryption: false
    enabledForTemplateDeployment: false
    publicNetworkAccess: 'Enabled'
    tenantId: subscription().tenantId
    accessPolicies: [
      {
        tenantId: subscription().tenantId
        objectId: keyVaultAdminObjectId
        permissions: {
          secrets: [
            'Get'
            'List'
            'Set'
            'Delete'
            'Recover'
            'Backup'
            'Restore'
          ]
        }
      }
    ]
    sku: {
      family: 'A'
      name: 'standard'
    }
    softDeleteRetentionInDays: 90
  }
  tags: mergedTags
}

resource databaseUrlSecret 'Microsoft.KeyVault/vaults/secrets@2023-02-01' = if (!deployPostgres && !empty(databaseUrl)) {
  parent: keyVault
  name: 'database-url'
  properties: {
    value: databaseUrl
  }
}

resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' = if (deployPostgres) {
  name: postgresServerName
  location: location
  sku: {
    name: postgresSkuName
    tier: postgresSkuTier
  }
  properties: {
    version: postgresVersion
    administratorLogin: postgresAdminLogin
    administratorLoginPassword: postgresAdminPassword
    storage: {
      storageSizeGB: postgresStorageGb
    }
    backup: {
      backupRetentionDays: 7
      geoRedundantBackup: 'Disabled'
    }
    network: {
      publicNetworkAccess: 'Enabled'
    }
    highAvailability: {
      mode: 'Disabled'
    }
  }
  tags: mergedTags
}

resource postgresDatabase 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2024-08-01' = if (deployPostgres) {
  parent: postgres
  name: postgresDatabaseName
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
}

resource postgresFirewallAllowAzure 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2024-08-01' = if (deployPostgres) {
  parent: postgres
  name: 'AllowAllAzureServices'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

resource containerAppsEnvironment 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: containerAppsEnvironmentName
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalyticsWorkspace.properties.customerId
        sharedKey: logAnalyticsWorkspace.listKeys().primarySharedKey
      }
    }
  }
  tags: mergedTags
}

resource appServicePlan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: appServicePlanName
  location: location
  kind: 'linux'
  sku: {
    name: 'B1'
    tier: 'Basic'
  }
  properties: {
    reserved: true
  }
  tags: mergedTags
}

resource webApp 'Microsoft.Web/sites@2023-12-01' = {
  name: webAppName
  location: location
  kind: 'app,linux'
  properties: {
    serverFarmId: appServicePlan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'NODE|22-lts'
      alwaysOn: true
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      http20Enabled: true
      appCommandLine: 'node spa-server.mjs'
      healthCheckPath: '/health'
      appSettings: [
        {
          name: 'SCM_DO_BUILD_DURING_DEPLOYMENT'
          value: 'false'
        }
      ]
    }
  }
  tags: mergedTags
}

resource app 'Microsoft.App/containerApps@2024-03-01' = if (deployApps) {
  name: appName
  location: location
  properties: {
    managedEnvironmentId: containerAppsEnvironment.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        allowInsecure: false
        external: true
        targetPort: serverTargetPort
        transport: 'auto'
        traffic: [
          {
            latestRevision: true
            weight: 100
          }
        ]
      }
      registries: [
        {
          server: containerRegistry.properties.loginServer
          username: acrUsername
          passwordSecretRef: 'acr-password'
        }
      ]
      secrets: [
        {
          name: 'acr-password'
          value: acrPassword
        }
        {
          name: 'database-url'
          value: effectiveDatabaseUrl
        }
        {
          name: 'better-auth-secret'
          value: betterAuthSecret
        }
        {
          name: 'better-auth-api-key'
          value: betterAuthApiKey
        }
        {
          name: 'google-client-id'
          value: googleClientId
        }
        {
          name: 'google-client-secret'
          value: googleClientSecret
        }
        {
          name: 'linkedin-client-id'
          value: linkedinClientId
        }
        {
          name: 'linkedin-client-secret'
          value: linkedinClientSecret
        }
        {
          name: 'cloudinary-cloud-name'
          value: cloudinaryCloudName
        }
        {
          name: 'cloudinary-api-key'
          value: cloudinaryApiKey
        }
        {
          name: 'cloudinary-api-secret'
          value: cloudinaryApiSecret
        }
        {
          name: 'resend-api-key'
          value: resendApiKey
        }
        {
          name: 'resend-email-from'
          value: resendEmailFrom
        }
        {
          name: 'resend-email-reply-to'
          value: resendEmailReplyTo
        }
        {
          name: 'ai-gateway-api-key'
          value: aiGatewayApiKey
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'server'
          image: serverImage
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: [
            {
              name: 'NODE_ENV'
              value: 'production'
            }
            {
              name: 'BETTER_AUTH_URL'
              value: effectiveServerUrl
            }
            {
              name: 'DASHBOARD_URL'
              value: dashboardUrl
            }
            {
              name: 'SERVER_URL'
              value: effectiveServerUrl
            }
            {
              name: 'WEBSITE_URL'
              value: websiteUrl
            }
            {
              name: 'CORS_ORIGIN'
              value: corsOriginValue
            }
            {
              name: 'DEBUG_PERFORMANCE'
              value: debugPerformance
            }
            {
              name: 'PORT'
              value: string(serverTargetPort)
            }
            {
              name: 'HOST'
              value: '0.0.0.0'
            }
            {
              name: 'DATABASE_URL'
              secretRef: 'database-url'
            }
            {
              name: 'BETTER_AUTH_SECRET'
              secretRef: 'better-auth-secret'
            }
            {
              name: 'BETTER_AUTH_API_KEY'
              secretRef: 'better-auth-api-key'
            }
            {
              name: 'GOOGLE_CLIENT_ID'
              secretRef: 'google-client-id'
            }
            {
              name: 'GOOGLE_CLIENT_SECRET'
              secretRef: 'google-client-secret'
            }
            {
              name: 'LINKEDIN_CLIENT_ID'
              secretRef: 'linkedin-client-id'
            }
            {
              name: 'LINKEDIN_CLIENT_SECRET'
              secretRef: 'linkedin-client-secret'
            }
            {
              name: 'CLOUDINARY_CLOUD_NAME'
              secretRef: 'cloudinary-cloud-name'
            }
            {
              name: 'CLOUDINARY_API_KEY'
              secretRef: 'cloudinary-api-key'
            }
            {
              name: 'CLOUDINARY_API_SECRET'
              secretRef: 'cloudinary-api-secret'
            }
            {
              name: 'RESEND_API_KEY'
              secretRef: 'resend-api-key'
            }
            {
              name: 'RESEND_EMAIL_FROM'
              secretRef: 'resend-email-from'
            }
            {
              name: 'RESEND_EMAIL_REPLY_TO'
              secretRef: 'resend-email-reply-to'
            }
            {
              name: 'AI_GATEWAY_API_KEY'
              secretRef: 'ai-gateway-api-key'
            }
          ]
          probes: [
            {
              type: 'Startup'
              httpGet: {
                path: '/health'
                port: serverTargetPort
              }
              initialDelaySeconds: 5
              periodSeconds: 5
              timeoutSeconds: 3
              failureThreshold: 24
            }
            {
              type: 'Liveness'
              httpGet: {
                path: '/health'
                port: serverTargetPort
              }
              initialDelaySeconds: 15
              periodSeconds: 30
              timeoutSeconds: 5
              failureThreshold: 3
            }
          ]
        }
      ]
      scale: {
        minReplicas: appMinReplicas
        maxReplicas: appMaxReplicas
      }
    }
  }
  tags: mergedTags
}

output containerRegistryName string = containerRegistry.name
output containerRegistryLoginServer string = containerRegistry.properties.loginServer
output keyVaultName string = keyVault.name
output containerAppsEnvironmentId string = containerAppsEnvironment.id
output containerAppsEnvironmentDefaultDomain string = containerAppsEnvironment.properties.defaultDomain
output appContainerAppName string = appName
output serverDefaultUrl string = deployApps ? 'https://${app!.properties.configuration.ingress.fqdn}' : 'https://${serverFqdn}'
output dashboardWebAppName string = webApp.name
output webAppDefaultUrl string = 'https://${webApp.properties.defaultHostName}'
output postgresFqdn string = deployPostgres ? postgres!.properties.fullyQualifiedDomainName : ''
