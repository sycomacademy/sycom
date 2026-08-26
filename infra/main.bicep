targetScope = 'resourceGroup'

// Production topology: SPA on Azure Web App, API on Container Apps,
// Postgres on Azure Database for PostgreSQL. The live template used by
// CI is infra/main.local-deploy.bicep.

@description('Azure region for this environment.')
param location string = resourceGroup().location

@description('Project name prefix used in resource naming.')
param projectName string = 'sycom'

@description('Environment name, usually prod.')
param environmentName string

@description('Deploy only the shared infrastructure when false, or infrastructure plus the app when true.')
param deployApps bool = true

@description('Globally unique Azure Container Registry name.')
param containerRegistryName string

@description('Globally unique Azure Key Vault name.')
param keyVaultName string

@description('Log Analytics workspace name.')
param logAnalyticsWorkspaceName string = '${projectName}-${environmentName}-logs'

@description('Container Apps environment name.')
param containerAppsEnvironmentName string = '${projectName}-${environmentName}-cae'

@description('User-assigned managed identity name (shared by both containers).')
param appIdentityName string = '${projectName}-${environmentName}-app-id'

@description('Container App name. Both containers live in this single app.')
param appName string = '${projectName}-${environmentName}-app'

@description('Dashboard image reference in ACR.')
param dashboardImage string = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'

@description('Server image reference in ACR.')
param serverImage string = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'

@description('Public app URL for this environment (browser-facing, hits the dashboard ingress).')
param dashboardUrl string

@description('Optional public website URL used by server-side links.')
param websiteUrl string = ''

@description('Allowed browser origins for the server. Defaults to dashboardUrl plus websiteUrl when omitted.')
param corsOrigins array = []

@description('Dashboard container port (the only ingress).')
param dashboardTargetPort int = 3000

@description('Server container port (loopback only).')
param serverTargetPort int = 3001

@description('Minimum app replicas.')
param appMinReplicas int = 1

@description('Maximum app replicas.')
param appMaxReplicas int = 2

@description('DEBUG_PERFORMANCE value passed to the server.')
@allowed([
  'true'
  'false'
])
param debugPerformance string = 'false'

@description('Key Vault secret names expected by the server container.')
param keyVaultSecretNames object = {
  databaseUrl: 'database-url'
  betterAuthSecret: 'better-auth-secret'
  betterAuthApiKey: 'better-auth-api-key'
  googleClientId: 'google-client-id'
  googleClientSecret: 'google-client-secret'
  linkedinClientId: 'linkedin-client-id'
  linkedinClientSecret: 'linkedin-client-secret'
  cloudinaryCloudName: 'cloudinary-cloud-name'
  cloudinaryApiKey: 'cloudinary-api-key'
  cloudinaryApiSecret: 'cloudinary-api-secret'
  resendApiKey: 'resend-api-key'
  resendEmailFrom: 'resend-email-from'
  resendEmailReplyTo: 'resend-email-reply-to'
  aiGatewayApiKey: 'ai-gateway-api-key'
}

@description('Common tags applied to created resources.')
param tags object = {}

var mergedTags = union(tags, {
  environment: environmentName
  project: projectName
  managedBy: 'bicep'
})

var defaultCorsOrigins = empty(websiteUrl) ? [dashboardUrl] : [dashboardUrl, websiteUrl]
var effectiveCorsOrigins = length(corsOrigins) > 0 ? corsOrigins : defaultCorsOrigins
var corsOriginValue = join(effectiveCorsOrigins, ',')
var keyVaultBaseUrl = '${keyVault.properties.vaultUri}secrets'
// Both containers share a network namespace; dashboard SSR talks to the
// server over loopback. No env-level service discovery needed.
var internalServerUrl = 'http://localhost:${serverTargetPort}'
var acrPullRoleDefinitionId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d')
var keyVaultSecretsUserRoleDefinitionId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4633458b-17de-408a-b874-0445c86b69e6')
var appIdentityMap = {
  '${appIdentity.id}': {}
}

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
    adminUserEnabled: false
    publicNetworkAccess: 'Enabled'
  }
  tags: mergedTags
}

resource keyVault 'Microsoft.KeyVault/vaults@2023-02-01' = {
  name: keyVaultName
  location: location
  properties: {
    enableRbacAuthorization: true
    enablePurgeProtection: true
    enabledForDeployment: false
    enabledForDiskEncryption: false
    enabledForTemplateDeployment: false
    publicNetworkAccess: 'Enabled'
    tenantId: subscription().tenantId
    sku: {
      family: 'A'
      name: 'standard'
    }
    softDeleteRetentionInDays: 90
  }
  tags: mergedTags
}

resource appIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: appIdentityName
  location: location
  tags: mergedTags
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

resource appAcrPullRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(containerRegistry.id, appIdentity.id, 'acr-pull')
  scope: containerRegistry
  properties: {
    principalId: appIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: acrPullRoleDefinitionId
  }
}

resource appKeyVaultSecretsUserRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVault.id, appIdentity.id, 'key-vault-secrets-user')
  scope: keyVault
  properties: {
    principalId: appIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: keyVaultSecretsUserRoleDefinitionId
  }
}

resource app 'Microsoft.App/containerApps@2024-03-01' = if (deployApps) {
  name: appName
  location: location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: appIdentityMap
  }
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
      registries: [
        {
          server: containerRegistry.properties.loginServer
          identity: appIdentity.id
        }
      ]
      secrets: [
        {
          name: 'database-url'
          identity: appIdentity.id
          keyVaultUrl: '${keyVaultBaseUrl}/${keyVaultSecretNames.databaseUrl}'
        }
        {
          name: 'better-auth-secret'
          identity: appIdentity.id
          keyVaultUrl: '${keyVaultBaseUrl}/${keyVaultSecretNames.betterAuthSecret}'
        }
        {
          name: 'better-auth-api-key'
          identity: appIdentity.id
          keyVaultUrl: '${keyVaultBaseUrl}/${keyVaultSecretNames.betterAuthApiKey}'
        }
        {
          name: 'google-client-id'
          identity: appIdentity.id
          keyVaultUrl: '${keyVaultBaseUrl}/${keyVaultSecretNames.googleClientId}'
        }
        {
          name: 'google-client-secret'
          identity: appIdentity.id
          keyVaultUrl: '${keyVaultBaseUrl}/${keyVaultSecretNames.googleClientSecret}'
        }
        {
          name: 'linkedin-client-id'
          identity: appIdentity.id
          keyVaultUrl: '${keyVaultBaseUrl}/${keyVaultSecretNames.linkedinClientId}'
        }
        {
          name: 'linkedin-client-secret'
          identity: appIdentity.id
          keyVaultUrl: '${keyVaultBaseUrl}/${keyVaultSecretNames.linkedinClientSecret}'
        }
        {
          name: 'cloudinary-cloud-name'
          identity: appIdentity.id
          keyVaultUrl: '${keyVaultBaseUrl}/${keyVaultSecretNames.cloudinaryCloudName}'
        }
        {
          name: 'cloudinary-api-key'
          identity: appIdentity.id
          keyVaultUrl: '${keyVaultBaseUrl}/${keyVaultSecretNames.cloudinaryApiKey}'
        }
        {
          name: 'cloudinary-api-secret'
          identity: appIdentity.id
          keyVaultUrl: '${keyVaultBaseUrl}/${keyVaultSecretNames.cloudinaryApiSecret}'
        }
        {
          name: 'resend-api-key'
          identity: appIdentity.id
          keyVaultUrl: '${keyVaultBaseUrl}/${keyVaultSecretNames.resendApiKey}'
        }
        {
          name: 'resend-email-from'
          identity: appIdentity.id
          keyVaultUrl: '${keyVaultBaseUrl}/${keyVaultSecretNames.resendEmailFrom}'
        }
        {
          name: 'resend-email-reply-to'
          identity: appIdentity.id
          keyVaultUrl: '${keyVaultBaseUrl}/${keyVaultSecretNames.resendEmailReplyTo}'
        }
        {
          name: 'ai-gateway-api-key'
          identity: appIdentity.id
          keyVaultUrl: '${keyVaultBaseUrl}/${keyVaultSecretNames.aiGatewayApiKey}'
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'dashboard'
          image: dashboardImage
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: [
            {
              name: 'INTERNAL_SERVER_URL'
              value: internalServerUrl
            }
          ]
          probes: [
            {
              type: 'Startup'
              httpGet: {
                path: '/health'
                port: dashboardTargetPort
              }
              initialDelaySeconds: 10
              periodSeconds: 10
              timeoutSeconds: 5
              failureThreshold: 12
            }
            {
              type: 'Liveness'
              httpGet: {
                path: '/health'
                port: dashboardTargetPort
              }
              initialDelaySeconds: 15
              periodSeconds: 30
              timeoutSeconds: 5
              failureThreshold: 3
            }
          ]
        }
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
              value: dashboardUrl
            }
            {
              name: 'DASHBOARD_URL'
              value: dashboardUrl
            }
            {
              name: 'SERVER_URL'
              value: dashboardUrl
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
              value: '127.0.0.1'
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
  dependsOn: [
    appAcrPullRole
    appKeyVaultSecretsUserRole
  ]
  tags: mergedTags
}

output containerRegistryName string = containerRegistry.name
output containerRegistryLoginServer string = containerRegistry.properties.loginServer
output keyVaultName string = keyVault.name
output containerAppsEnvironmentId string = containerAppsEnvironment.id
output appContainerAppName string = appName
output appDefaultUrl string = deployApps ? 'https://${app!.properties.configuration.ingress.fqdn}' : ''
