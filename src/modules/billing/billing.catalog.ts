export type BillingTierCode = 'BASE' | 'GROWTH' | 'BUSINESS' | 'CUSTOM';
export type BillingIndustryCode =
  | 'GENERAL'
  | 'FINTECH'
  | 'GOVTECH'
  | 'HEALTHTECH'
  | 'LEGALTECH';

export type BillingCycle = 'monthly' | 'yearly';
export type BillingApiAddonCode = 'AUTH_API' | 'VAULT_API' | 'ZERO_TRUST_API';

export type BillingCatalogIndustry = {
  code: BillingIndustryCode;
  name: string;
  description: string;
};

export type BillingCatalogTier = {
  code: BillingTierCode;
  name: string;
  description: string;
  selfServe: boolean;
};

export type BillingOfferLimits = {
  maxVaults: number | null;
  monthlyNotaryRequests: number | null;
  ztMode: 'basic' | 'advanced' | 'custom';
  maxFileSizeMb: number | null;
  maxVaultStorageGb: number | null;
  maxUsers: number | null;
};

export type BillingCatalogOffer = {
  industry: BillingIndustryCode;
  tier: BillingTierCode;
  name: string;
  description: string;
  monthlyPriceCents: number | null;
  yearlyPriceCents: number | null;
  selfServe: boolean;
  limits: BillingOfferLimits;
};

export type BillingCatalogApiAddon = {
  code: BillingApiAddonCode;
  name: string;
  description: string;
  availableFromTier: BillingTierCode;
  monthlyPriceCents: number;
  yearlyPriceCents: number;
  features: string[];
  usageLimits: Array<{
    metric: string;
    label: string;
    included: number;
    unit: string;
    overageBlockSize: number;
    overageBlockPriceCents: number;
  }>;
};

const industries: BillingCatalogIndustry[] = [
  {
    code: 'GENERAL',
    name: 'General',
    description: 'For teams building structured access and document operations.',
  },
  {
    code: 'FINTECH',
    name: 'Fintech',
    description: 'For financial operations, onboarding, and high-trust flows.',
  },
  {
    code: 'GOVTECH',
    name: 'GovTech',
    description: 'For public-sector records, workflows, and controlled evidence.',
  },
  {
    code: 'HEALTHTECH',
    name: 'HealthTech',
    description: 'For clinical and sensitive environments with stronger controls.',
  },
  {
    code: 'LEGALTECH',
    name: 'LegalTech',
    description: 'For contracts, evidence handling, and regulated documentation.',
  },
];

const tiers: BillingCatalogTier[] = [
  {
    code: 'BASE',
    name: 'Base',
    description: 'Starting point for early operational structure.',
    selfServe: true,
  },
  {
    code: 'GROWTH',
    name: 'Growth',
    description: 'For growing operations that need more capacity and control.',
    selfServe: true,
  },
  {
    code: 'BUSINESS',
    name: 'Business',
    description: 'For organizations that need stronger controls and sustained scale.',
    selfServe: true,
  },
  {
    code: 'CUSTOM',
    name: 'Custom',
    description: 'For specialized environments, limits, and operating models.',
    selfServe: false,
  },
];

const apiAddons: BillingCatalogApiAddon[] = [
  {
    code: 'AUTH_API',
    name: 'Auth API Pack',
    description: 'Use Sytadel as the authentication layer for your own applications.',
    availableFromTier: 'BUSINESS',
    monthlyPriceCents: 14900,
    yearlyPriceCents: 149000,
    features: [
      'Up to 10,000 active users per month',
      'Up to 3 client apps',
      'Up to 10 service accounts',
    ],
    usageLimits: [
      {
        metric: 'service_account_tokens_issued',
        label: 'Tokens técnicos emitidos',
        included: 10000,
        unit: 'tokens/mes',
        overageBlockSize: 1000,
        overageBlockPriceCents: 1500,
      },
    ],
  },
  {
    code: 'VAULT_API',
    name: 'Vault API Pack',
    description: 'Programmatic access to protected document storage and Vault operations.',
    availableFromTier: 'BUSINESS',
    monthlyPriceCents: 19900,
    yearlyPriceCents: 199000,
    features: [
      'Up to 250,000 API requests per month',
      'Up to 100 GB storage included',
      'All traffic enforced through Zero Trust',
    ],
    usageLimits: [
      {
        metric: 'vault_api_requests',
        label: 'Requests totales a Vault API',
        included: 250000,
        unit: 'requests/mes',
        overageBlockSize: 100000,
        overageBlockPriceCents: 2000,
      },
    ],
  },
  {
    code: 'ZERO_TRUST_API',
    name: 'Zero Trust API Pack',
    description: 'Expose policies, upstreams, and advanced protected traffic controls.',
    availableFromTier: 'BUSINESS',
    monthlyPriceCents: 24900,
    yearlyPriceCents: 249000,
    features: [
      'Up to 500,000 protected requests per month',
      'Up to 20 policies',
      'Up to 10 upstreams',
    ],
    usageLimits: [
      {
        metric: 'zt_api_requests',
        label: 'Requests protegidos totales',
        included: 500000,
        unit: 'requests/mes',
        overageBlockSize: 100000,
        overageBlockPriceCents: 2500,
      },
    ],
  },
];

const makeOffer = (
  industry: BillingIndustryCode,
  tier: BillingTierCode,
  price: { monthly: number | null; yearly: number | null },
  limits: BillingOfferLimits,
): BillingCatalogOffer => {
  const industryName = industries.find((entry) => entry.code === industry)?.name ?? industry;
  const tierName = tiers.find((entry) => entry.code === tier)?.name ?? tier;

  return {
    industry,
    tier,
    name: `${industryName} ${tierName}`,
    description: `${tierName} package for ${industryName} organizations.`,
    monthlyPriceCents: price.monthly,
    yearlyPriceCents: price.yearly,
    selfServe: tier !== 'CUSTOM',
    limits,
  };
};

export const BILLING_CATALOG = {
  industries,
  tiers,
  apiAddons,
  offers: [
    makeOffer('GENERAL', 'BASE', { monthly: 7900, yearly: 79000 }, {
      maxVaults: 3,
      monthlyNotaryRequests: 25,
      ztMode: 'basic',
      maxFileSizeMb: 10,
      maxVaultStorageGb: 25,
      maxUsers: 5,
    }),
    makeOffer('GENERAL', 'GROWTH', { monthly: 14900, yearly: 149000 }, {
      maxVaults: 10,
      monthlyNotaryRequests: 150,
      ztMode: 'basic',
      maxFileSizeMb: 25,
      maxVaultStorageGb: 100,
      maxUsers: 20,
    }),
    makeOffer('GENERAL', 'BUSINESS', { monthly: 29900, yearly: 299000 }, {
      maxVaults: 30,
      monthlyNotaryRequests: 750,
      ztMode: 'advanced',
      maxFileSizeMb: 50,
      maxVaultStorageGb: 500,
      maxUsers: 100,
    }),
    makeOffer('GENERAL', 'CUSTOM', { monthly: null, yearly: null }, {
      maxVaults: null,
      monthlyNotaryRequests: null,
      ztMode: 'custom',
      maxFileSizeMb: null,
      maxVaultStorageGb: null,
      maxUsers: null,
    }),
    makeOffer('FINTECH', 'BASE', { monthly: 11900, yearly: 119000 }, {
      maxVaults: 5,
      monthlyNotaryRequests: 100,
      ztMode: 'basic',
      maxFileSizeMb: 15,
      maxVaultStorageGb: 50,
      maxUsers: 10,
    }),
    makeOffer('FINTECH', 'GROWTH', { monthly: 22900, yearly: 229000 }, {
      maxVaults: 20,
      monthlyNotaryRequests: 500,
      ztMode: 'advanced',
      maxFileSizeMb: 30,
      maxVaultStorageGb: 200,
      maxUsers: 40,
    }),
    makeOffer('FINTECH', 'BUSINESS', { monthly: 39900, yearly: 399000 }, {
      maxVaults: 60,
      monthlyNotaryRequests: 2000,
      ztMode: 'advanced',
      maxFileSizeMb: 75,
      maxVaultStorageGb: 1000,
      maxUsers: 150,
    }),
    makeOffer('FINTECH', 'CUSTOM', { monthly: null, yearly: null }, {
      maxVaults: null,
      monthlyNotaryRequests: null,
      ztMode: 'custom',
      maxFileSizeMb: null,
      maxVaultStorageGb: null,
      maxUsers: null,
    }),
    makeOffer('GOVTECH', 'BASE', { monthly: 12900, yearly: 129000 }, {
      maxVaults: 6,
      monthlyNotaryRequests: 150,
      ztMode: 'basic',
      maxFileSizeMb: 20,
      maxVaultStorageGb: 75,
      maxUsers: 15,
    }),
    makeOffer('GOVTECH', 'GROWTH', { monthly: 24900, yearly: 249000 }, {
      maxVaults: 25,
      monthlyNotaryRequests: 800,
      ztMode: 'advanced',
      maxFileSizeMb: 40,
      maxVaultStorageGb: 300,
      maxUsers: 60,
    }),
    makeOffer('GOVTECH', 'BUSINESS', { monthly: 44900, yearly: 449000 }, {
      maxVaults: 80,
      monthlyNotaryRequests: 3000,
      ztMode: 'advanced',
      maxFileSizeMb: 100,
      maxVaultStorageGb: 1500,
      maxUsers: 250,
    }),
    makeOffer('GOVTECH', 'CUSTOM', { monthly: null, yearly: null }, {
      maxVaults: null,
      monthlyNotaryRequests: null,
      ztMode: 'custom',
      maxFileSizeMb: null,
      maxVaultStorageGb: null,
      maxUsers: null,
    }),
    makeOffer('HEALTHTECH', 'BASE', { monthly: 13900, yearly: 139000 }, {
      maxVaults: 5,
      monthlyNotaryRequests: 200,
      ztMode: 'basic',
      maxFileSizeMb: 20,
      maxVaultStorageGb: 75,
      maxUsers: 12,
    }),
    makeOffer('HEALTHTECH', 'GROWTH', { monthly: 26900, yearly: 269000 }, {
      maxVaults: 20,
      monthlyNotaryRequests: 1000,
      ztMode: 'advanced',
      maxFileSizeMb: 50,
      maxVaultStorageGb: 400,
      maxUsers: 50,
    }),
    makeOffer('HEALTHTECH', 'BUSINESS', { monthly: 47900, yearly: 479000 }, {
      maxVaults: 70,
      monthlyNotaryRequests: 4000,
      ztMode: 'advanced',
      maxFileSizeMb: 100,
      maxVaultStorageGb: 2000,
      maxUsers: 200,
    }),
    makeOffer('HEALTHTECH', 'CUSTOM', { monthly: null, yearly: null }, {
      maxVaults: null,
      monthlyNotaryRequests: null,
      ztMode: 'custom',
      maxFileSizeMb: null,
      maxVaultStorageGb: null,
      maxUsers: null,
    }),
    makeOffer('LEGALTECH', 'BASE', { monthly: 9900, yearly: 99000 }, {
      maxVaults: 4,
      monthlyNotaryRequests: 75,
      ztMode: 'basic',
      maxFileSizeMb: 15,
      maxVaultStorageGb: 40,
      maxUsers: 8,
    }),
    makeOffer('LEGALTECH', 'GROWTH', { monthly: 18900, yearly: 189000 }, {
      maxVaults: 15,
      monthlyNotaryRequests: 300,
      ztMode: 'advanced',
      maxFileSizeMb: 30,
      maxVaultStorageGb: 150,
      maxUsers: 30,
    }),
    makeOffer('LEGALTECH', 'BUSINESS', { monthly: 34900, yearly: 349000 }, {
      maxVaults: 50,
      monthlyNotaryRequests: 1200,
      ztMode: 'advanced',
      maxFileSizeMb: 75,
      maxVaultStorageGb: 750,
      maxUsers: 120,
    }),
    makeOffer('LEGALTECH', 'CUSTOM', { monthly: null, yearly: null }, {
      maxVaults: null,
      monthlyNotaryRequests: null,
      ztMode: 'custom',
      maxFileSizeMb: null,
      maxVaultStorageGb: null,
      maxUsers: null,
    }),
  ] satisfies BillingCatalogOffer[],
};
