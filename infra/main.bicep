targetScope = 'resourceGroup'

// Production topology: dashboard (static SPA, nginx) and server (API) as two
// separate Container Apps in one Container Apps Environment, both dockerized.
// Postgres on Azure Database for PostgreSQL Flexible Server. A Container App
// Job runs schema migrations using the server image before the server is
// updated.

@description('Azure region for this environment.')
param location string = resourceGroup().location

@description('Project name prefix used in resource naming.')
param projectName string = 'sycomlearn'

@description('Environment name, usually prod.')
param environmentName string = 'prod'

@description('Globally unique Azure Container Registry name.')
param containerRegistryName string

@description('Log Analytics workspace name.')
param logAnalyticsWorkspaceName string = '${projectName}-${environmentName}-logs'

@description('Container Apps environment name.')
param containerAppsEnvironmentName string = '${projectName}-${environmentName}-cae'

@description('Dashboard Container App name.')
param dashboardAppName string = '${projectName}-${environmentName}-dashboard'

@description('Server Container App name.')
param serverAppName string = '${projectName}-${environmentName}-server'

@description('Migration Container App Job name. Runs drizzle-kit migrate against Postgres using the server image.')
param migrateJobName string = '${projectName}-${environmentName}-migrate'

@description('Dashboard image reference in ACR.')
param dashboardImage string = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'

@description('Server image reference in ACR.')
param serverImage string = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'

@description('Public dashboard URL (custom domain once bound, otherwise the Container App default FQDN).')
param dashboardUrl string = ''

@description('Public server/API URL. Defaults to the server Container App default FQDN when empty.')
param serverUrl string = ''

@description('Optional public marketing website URL used by server-side links.')
param websiteUrl string = 'https://sycomsolutions.com'

@description('Allowed browser origins for the server. Defaults to dashboardUrl plus websiteUrl when omitted.')
param corsOrigins array = []

@description('Dashboard container port (nginx).')
param dashboardTargetPort int = 80

@description('Server container port.')
param serverTargetPort int = 3000

@description('Minimum replicas for both apps.')
param appMinReplicas int = 1

@description('Maximum replicas for both apps.')
param appMaxReplicas int = 2

@allowed([
  'true'
  'false'
])
param debugPerformance string = 'false'

@description('Provision Azure Database for PostgreSQL Flexible Server. Set false to bring your own Postgres (e.g. Neon) via databaseUrl.')
param deployPostgres bool = true

@description('External Postgres connection string when deployPostgres is false. Stored as the server/migrate secret.')
@secure()
param databaseUrl string = ''

@description('Globally unique PostgreSQL flexible server name.')
param postgresServerName string = ''

@description('Application database name on the flexible server.')
param postgresDatabaseName string = 'sycom'

@description('PostgreSQL administrator login. Used only for schema migrations, never by the running server.')
param postgresAdminLogin string = ''

@secure()
param postgresAdminPassword string = ''

@secure()
param postgresAppPassword string = ''

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

// Must match the APP_ROLE constant in packages/db/src/ensure-app-role.ts —
// not a param, since nothing benefits from these ever disagreeing.
var postgresAppLogin = 'sycom_app'

var acrUsername = containerRegistry.listCredentials().username
var acrPassword = containerRegistry.listCredentials().passwords[0].value
var effectiveDatabaseUrl = deployPostgres
  ? 'postgresql://${postgresAdminLogin}:${uriComponent(postgresAdminPassword)}@${postgres!.properties.fullyQualifiedDomainName}:5432/${postgresDatabaseName}?sslmode=require'
  : databaseUrl
// The server's own runtime connection uses the least-privilege role instead
// of the admin login above. When bringing your own Postgres (deployPostgres
// = false) there's no way for this template to provision that role, so it
// falls back to the same connection string the admin/migrate path uses.
var effectiveAppDatabaseUrl = deployPostgres
  ? 'postgresql://${postgresAppLogin}:${uriComponent(postgresAppPassword)}@${postgres!.properties.fullyQualifiedDomainName}:5432/${postgresDatabaseName}?sslmode=require'
  : databaseUrl
// Built from the environment's default domain rather than read back off the
// app resources themselves — reading serverApp's own fqdn into serverApp's
// own env would be a circular reference.
var serverDefaultUrl = 'https://${serverAppName}.${containerAppsEnvironment.properties.defaultDomain}'
var effectiveServerUrl = empty(serverUrl) ? serverDefaultUrl : serverUrl
var dashboardDefaultUrl = 'https://${dashboardAppName}.${containerAppsEnvironment.properties.defaultDomain}'
var effectiveDashboardUrl = empty(dashboardUrl) ? dashboardDefaultUrl : dashboardUrl
var defaultCorsOrigins = empty(websiteUrl) ? [effectiveDashboardUrl] : [effectiveDashboardUrl, websiteUrl]
var effectiveCorsOrigins = length(corsOrigins) > 0 ? corsOrigins : defaultCorsOrigins
var corsOriginValue = join(effectiveCorsOrigins, ',')

var registryLoginConfig = [
  {
    server: containerRegistry.properties.loginServer
    username: acrUsername
    passwordSecretRef: 'acr-password'
  }
]

var serverEnv = [
  { name: 'NODE_ENV', value: 'production' }
  { name: 'BETTER_AUTH_URL', value: effectiveServerUrl }
  { name: 'DASHBOARD_URL', value: effectiveDashboardUrl }
  { name: 'SERVER_URL', value: effectiveServerUrl }
  { name: 'WEBSITE_URL', value: websiteUrl }
  { name: 'CORS_ORIGIN', value: corsOriginValue }
  { name: 'DEBUG_PERFORMANCE', value: debugPerformance }
  { name: 'PORT', value: string(serverTargetPort) }
  { name: 'HOST', value: '0.0.0.0' }
  { name: 'DATABASE_URL', secretRef: 'database-url' }
  { name: 'BETTER_AUTH_SECRET', secretRef: 'better-auth-secret' }
  { name: 'BETTER_AUTH_API_KEY', secretRef: 'better-auth-api-key' }
  { name: 'GOOGLE_CLIENT_ID', secretRef: 'google-client-id' }
  { name: 'GOOGLE_CLIENT_SECRET', secretRef: 'google-client-secret' }
  { name: 'LINKEDIN_CLIENT_ID', secretRef: 'linkedin-client-id' }
  { name: 'LINKEDIN_CLIENT_SECRET', secretRef: 'linkedin-client-secret' }
  { name: 'CLOUDINARY_CLOUD_NAME', secretRef: 'cloudinary-cloud-name' }
  { name: 'CLOUDINARY_API_KEY', secretRef: 'cloudinary-api-key' }
  { name: 'CLOUDINARY_API_SECRET', secretRef: 'cloudinary-api-secret' }
  { name: 'RESEND_API_KEY', secretRef: 'resend-api-key' }
  { name: 'RESEND_EMAIL_FROM', secretRef: 'resend-email-from' }
  { name: 'RESEND_EMAIL_REPLY_TO', secretRef: 'resend-email-reply-to' }
  { name: 'AI_GATEWAY_API_KEY', secretRef: 'ai-gateway-api-key' }
]

var appSecrets = [
  { name: 'acr-password', value: acrPassword }
  { name: 'database-url', value: effectiveAppDatabaseUrl }
  { name: 'better-auth-secret', value: betterAuthSecret }
  { name: 'better-auth-api-key', value: betterAuthApiKey }
  { name: 'google-client-id', value: googleClientId }
  { name: 'google-client-secret', value: googleClientSecret }
  { name: 'linkedin-client-id', value: linkedinClientId }
  { name: 'linkedin-client-secret', value: linkedinClientSecret }
  { name: 'cloudinary-cloud-name', value: cloudinaryCloudName }
  { name: 'cloudinary-api-key', value: cloudinaryApiKey }
  { name: 'cloudinary-api-secret', value: cloudinaryApiSecret }
  { name: 'resend-api-key', value: resendApiKey }
  { name: 'resend-email-from', value: resendEmailFrom }
  { name: 'resend-email-reply-to', value: resendEmailReplyTo }
  { name: 'ai-gateway-api-key', value: aiGatewayApiKey }
]

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

// Special "0.0.0.0-0.0.0.0" rule = allow traffic from other Azure resources
// (Container Apps, Container App Jobs) without opening the server to the
// public internet.
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

resource dashboardApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: dashboardAppName
  location: location
  properties: {
    managedEnvironmentId: containerAppsEnvironment.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        allowInsecure: false
        external: true
        targetPort: dashboardTargetPort
        transport: 'auto'
        traffic: [
          {
            latestRevision: true
            weight: 100
          }
        ]
      }
      registries: registryLoginConfig
      secrets: [
        {
          name: 'acr-password'
          value: acrPassword
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'dashboard'
          image: dashboardImage
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
          probes: [
            {
              type: 'Startup'
              httpGet: {
                path: '/health'
                port: dashboardTargetPort
              }
              initialDelaySeconds: 5
              periodSeconds: 5
              timeoutSeconds: 3
              failureThreshold: 12
            }
            {
              type: 'Liveness'
              httpGet: {
                path: '/health'
                port: dashboardTargetPort
              }
              initialDelaySeconds: 10
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

resource serverApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: serverAppName
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
      registries: registryLoginConfig
      secrets: appSecrets
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
          env: serverEnv
          probes: [
            {
              type: 'Startup'
              tcpSocket: {
                port: serverTargetPort
              }
              initialDelaySeconds: 5
              periodSeconds: 5
              timeoutSeconds: 3
              failureThreshold: 24
            }
            {
              type: 'Liveness'
              tcpSocket: {
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

// Manually-triggered job that runs `drizzle-kit migrate` using the server
// image (which already bundles packages/db's migrations + drizzle-kit),
// then (re)provisions the least-privilege sycom_app role the server itself
// connects as. Runs as the admin login — the only place that login is used;
// the server never sees it. deploy.yml points this job at the freshly built
// server image and starts it before updating the server Container App.
resource migrateJob 'Microsoft.App/jobs@2024-03-01' = {
  name: migrateJobName
  location: location
  properties: {
    environmentId: containerAppsEnvironment.id
    configuration: {
      triggerType: 'Manual'
      replicaTimeout: 600
      replicaRetryLimit: 0
      manualTriggerConfig: {
        parallelism: 1
        replicaCompletionCount: 1
      }
      registries: registryLoginConfig
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
          name: 'app-db-password'
          value: postgresAppPassword
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'migrate'
          image: serverImage
          command: ['sh', '-c']
          args: [
            deployPostgres
              ? 'cd /app && bun run db:migrate && bun run db:ensure-app-role'
              : 'cd /app && bun run db:migrate'
          ]
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: [
            { name: 'DATABASE_URL', secretRef: 'database-url' }
            { name: 'APP_DB_PASSWORD', secretRef: 'app-db-password' }
            { name: 'APP_DB_NAME', value: postgresDatabaseName }
          ]
        }
      ]
    }
  }
  tags: mergedTags
}

output containerRegistryName string = containerRegistry.name
output containerRegistryLoginServer string = containerRegistry.properties.loginServer
output containerAppsEnvironmentId string = containerAppsEnvironment.id
output dashboardAppName string = dashboardApp.name
output serverAppName string = serverApp.name
output migrateJobName string = migrateJob.name
output dashboardDefaultUrl string = dashboardDefaultUrl
output serverDefaultUrl string = serverDefaultUrl
output postgresFqdn string = deployPostgres ? postgres!.properties.fullyQualifiedDomainName : ''
