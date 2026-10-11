import type { PlatformSubscriptionAuthorization } from '../../common/modules/auth-directory/types/tenant-billing-sync-payload.type';

export function hasMatchingPlatformAuthorization(
  requested: PlatformSubscriptionAuthorization,
  authorized: PlatformSubscriptionAuthorization,
): boolean {
  if (
    !Array.isArray(requested.coveredTenantIds) ||
    !Array.isArray(authorized.coveredTenantIds) ||
    requested.coveredTenantIds.some((id) => typeof id !== 'string') ||
    authorized.coveredTenantIds.some((id) => typeof id !== 'string')
  ) {
    return false;
  }
  const requestedTenants = [...new Set(requested.coveredTenantIds)].sort();
  const authorizedTenants = [...new Set(authorized.coveredTenantIds)].sort();
  return (
    requested.organizationId === authorized.organizationId &&
    requested.billingAccountId === authorized.billingAccountId &&
    requestedTenants.length === authorizedTenants.length &&
    requestedTenants.every((tenantId, index) => tenantId === authorizedTenants[index])
  );
}
