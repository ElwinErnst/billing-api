export type TenantBillingSyncPayload = {
  planCode: string;
  vaultsEnabled: boolean;
  ztPoliciesEnabled: boolean;
  maxVaults: number;
  maxUsers: number | null;
  monthlyNotaryRequests: number;
  auditRetentionDays: number;
  maxClientApps: number | null;
  maxServiceAccounts: number | null;
  apiAddons: Array<'AUTH_API' | 'VAULT_API' | 'ZERO_TRUST_API'>;
};

export type RemoteTenantSummary = {
  id: string;
  name: string;
  slug: string;
  planCode: string | null;
  billingBypass?: boolean;
};
