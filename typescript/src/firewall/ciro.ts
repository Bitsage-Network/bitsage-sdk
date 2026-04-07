/**
 * CIRO Intelligence Client — Runtime Enrichment
 *
 * Fetches real-time address risk, transaction enrichment, and alerts
 * from CIRO's blockchain data lake. Used by the classifier to augment
 * the 48-feature input with on-chain intelligence before classification.
 *
 * @example
 * ```typescript
 * import { CiroClient } from '@obelyzk/sdk/firewall';
 *
 * const ciro = new CiroClient({
 *   baseUrl: 'https://ciro.bitsage.network',
 *   apiKey: process.env.CIRO_API_KEY!,
 * });
 *
 * // Enrich a transaction before classification
 * const enrichment = await ciro.enrichTransaction({
 *   target: '0x049d...',
 *   value: '1000000000',
 *   selector: '0xa9059cbb',
 * });
 *
 * // Check address risk
 * const risk = await ciro.getAddressRisk('0x049d...');
 * console.log(risk.riskLevel, risk.riskScore); // "LOW", 12
 *
 * // Get recent alerts
 * const alerts = await ciro.getRecentAlerts({ severity: 'CRITICAL' });
 * ```
 */

/** CIRO client configuration. */
export interface CiroConfig {
  /** CIRO Intelligence API base URL. */
  baseUrl: string;
  /** API key for authentication. */
  apiKey: string;
  /** Organization slug (default: "obelyzk"). */
  org?: string;
  /** Request timeout in ms (default: 10000). */
  timeout?: number;
}

/** Address risk level. */
export type RiskLevel = "clean" | "low" | "medium" | "high" | "critical" | "unknown";

/** Enrichment response from CIRO. */
export interface EnrichmentResult {
  targetRisk: RiskLevel;
  targetRiskScore: number;
  targetVerified: boolean;
  targetIsProxy: boolean;
  targetHasSource: boolean;
  targetInteractionCount: number;
  targetUniqueCallers: number;
  targetFirstSeenBlocksAgo: number;
  isSanctioned: boolean;
  sanctionLists: string[];
  fortaAlerts24h: number;
  fortaSeverityMax: string | null;
  senderTxFrequency: number;
  senderUniqueTargets24h: number;
  senderAvgValue24h: number;
  senderMaxValue24h: number;
  senderAgeBlocks: number;
  dataFreshnessS: number;
  enrichmentTimeMs: number;
}

/** Address risk assessment. */
export interface AddressRisk {
  address: string;
  chain: string;
  riskLevel: RiskLevel;
  riskScore: number;
  isContract: boolean;
  isVerified: boolean;
  isProxy: boolean;
  isSanctioned: boolean;
  sanctionLists: string[];
  fortaAlertsCount: number;
  knownExploitInvolvement: boolean;
  exploitNames: string[];
  totalTxCount: number;
  clusterSize: number;
}

/** Alert from CIRO's detection pipeline. */
export interface CiroAlert {
  alertId: string;
  source: string;
  severity: string;
  chain: string;
  timestamp: string;
  addresses: string[];
  txHash: string | null;
  name: string;
  description: string;
}

/** Data lake statistics. */
export interface DataLakeStats {
  totalTransactions: number;
  labeledTransactions: number;
  labelDistribution: Record<string, number>;
  lastUpdated: string;
  fortaBotsActive: number;
  addressesIndexed: number;
  sanctionedAddresses: number;
}

export class CiroClient {
  private baseUrl: string;
  private apiKey: string;
  private org: string;
  private timeout: number;

  constructor(config: CiroConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.apiKey = config.apiKey;
    this.org = config.org ?? "obelyzk";
    this.timeout = config.timeout ?? 10000;
  }

  private get apiBase(): string {
    return `${this.baseUrl}/api/singularity/${this.org}/blockchain`;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.apiBase}${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
      "X-Client": "obelyzk-sdk/1.0",
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      if (!response.ok) {
        const error = await response
          .json()
          .catch(() => ({ error: response.statusText }));
        throw new Error(
          `CIRO API error (${response.status}): ${(error as Record<string, string>).error || response.statusText}`
        );
      }

      return (await response.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Enrich a transaction with CIRO intelligence.
   * Returns target risk, sanctions status, Forta alerts, and behavioral context.
   */
  async enrichTransaction(params: {
    target: string;
    sender?: string;
    value?: string;
    selector?: string;
  }): Promise<EnrichmentResult> {
    const raw = await this.request<Record<string, unknown>>(
      "POST",
      "/transactions/enrich",
      {
        target: params.target,
        sender: params.sender,
        value: params.value ?? "0",
        selector: params.selector ?? "0x0",
        chain: "starknet",
      },
    );

    return {
      targetRisk: (raw.target_risk as RiskLevel) ?? "unknown",
      targetRiskScore: (raw.target_risk_score as number) ?? 0,
      targetVerified: (raw.target_verified as boolean) ?? false,
      targetIsProxy: (raw.target_is_proxy as boolean) ?? false,
      targetHasSource: (raw.target_has_source as boolean) ?? false,
      targetInteractionCount: (raw.target_interaction_count as number) ?? 0,
      targetUniqueCallers: (raw.target_unique_callers as number) ?? 0,
      targetFirstSeenBlocksAgo:
        (raw.target_first_seen_blocks_ago as number) ?? 0,
      isSanctioned: (raw.is_sanctioned as boolean) ?? false,
      sanctionLists: (raw.sanction_lists as string[]) ?? [],
      fortaAlerts24h: (raw.forta_alerts_24h as number) ?? 0,
      fortaSeverityMax: (raw.forta_severity_max as string) ?? null,
      senderTxFrequency: (raw.sender_tx_frequency as number) ?? 0,
      senderUniqueTargets24h:
        (raw.sender_unique_targets_24h as number) ?? 0,
      senderAvgValue24h: (raw.sender_avg_value_24h as number) ?? 0,
      senderMaxValue24h: (raw.sender_max_value_24h as number) ?? 0,
      senderAgeBlocks: (raw.sender_age_blocks as number) ?? 0,
      dataFreshnessS: (raw.data_freshness_s as number) ?? 0,
      enrichmentTimeMs: (raw.enrichment_time_ms as number) ?? 0,
    };
  }

  /**
   * Get risk assessment for a specific address.
   */
  async getAddressRisk(address: string): Promise<AddressRisk> {
    const raw = await this.request<Record<string, unknown>>(
      "GET",
      `/addresses/${address}/risk`,
    );

    return {
      address: (raw.address as string) ?? address,
      chain: (raw.chain as string) ?? "starknet",
      riskLevel: (raw.risk as RiskLevel) ?? "unknown",
      riskScore: (raw.risk_score as number) ?? 0,
      isContract: (raw.is_contract as boolean) ?? false,
      isVerified: (raw.is_verified as boolean) ?? false,
      isProxy: (raw.is_proxy as boolean) ?? false,
      isSanctioned: (raw.is_sanctioned as boolean) ?? false,
      sanctionLists: (raw.sanction_lists as string[]) ?? [],
      fortaAlertsCount: (raw.forta_alerts_count as number) ?? 0,
      knownExploitInvolvement:
        (raw.known_exploit_involvement as boolean) ?? false,
      exploitNames: (raw.exploit_names as string[]) ?? [],
      totalTxCount: (raw.total_tx_count as number) ?? 0,
      clusterSize: (raw.cluster_size as number) ?? 0,
    };
  }

  /**
   * Get recent alerts from CIRO's detection pipeline.
   */
  async getRecentAlerts(params?: {
    severity?: string;
    limit?: number;
  }): Promise<CiroAlert[]> {
    const query = new URLSearchParams();
    if (params?.severity) query.set("severity", params.severity);
    if (params?.limit) query.set("limit", String(params.limit));

    const queryStr = query.toString();
    const path = `/alerts/recent${queryStr ? `?${queryStr}` : ""}`;

    const raw = await this.request<Record<string, unknown>>("GET", path);
    const alerts = (raw.alerts as Record<string, unknown>[]) ?? [];

    return alerts.map((a) => ({
      alertId: (a.alert_id as string) ?? "",
      source: (a.source as string) ?? "",
      severity: (a.severity as string) ?? "INFO",
      chain: (a.chain as string) ?? "starknet",
      timestamp: (a.timestamp as string) ?? "",
      addresses: (a.addresses as string[]) ?? [],
      txHash: (a.tx_hash as string) ?? null,
      name: (a.name as string) ?? "",
      description: (a.description as string) ?? "",
    }));
  }

  /**
   * Get data lake statistics.
   */
  async getStats(): Promise<DataLakeStats> {
    const raw = await this.request<Record<string, unknown>>("GET", "/stats");

    return {
      totalTransactions: (raw.total_transactions as number) ?? 0,
      labeledTransactions: (raw.labeled_transactions as number) ?? 0,
      labelDistribution:
        (raw.label_distribution as Record<string, number>) ?? {},
      lastUpdated: (raw.last_updated as string) ?? "",
      fortaBotsActive: (raw.forta_bots_active as number) ?? 0,
      addressesIndexed: (raw.addresses_indexed as number) ?? 0,
      sanctionedAddresses: (raw.sanctioned_addresses as number) ?? 0,
    };
  }
}
