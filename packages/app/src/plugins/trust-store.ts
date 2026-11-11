import AsyncStorage from "@react-native-async-storage/async-storage";
import { z } from "zod";
import { readValidatedJson, type ValidatedStorage } from "@/storage/validated-storage";

/**
 * A plugin's client bundle is evaluated through `globalThis.eval`, so a hostile
 * daemon that ships one runs arbitrary code inside the app. Evaluation is gated
 * on an explicit, client-side approval the user grants for one exact bundle on
 * one host. Approval is keyed on `(serverId, pluginId, sha256(clientBundle))`:
 * change the bundle's bytes and the old approval no longer applies.
 */
const TRUST_STORAGE_KEY = "@paseo:plugin-trust";

const ApprovalSchema = z.object({
  serverId: z.string(),
  pluginId: z.string(),
  /** sha256 of the exact client bundle this approval covers. */
  hash: z.string(),
  approvedAt: z.string(),
});

const ApprovalsSchema = z.array(ApprovalSchema);

export type PluginApproval = z.infer<typeof ApprovalSchema>;

export interface TrustStorage extends ValidatedStorage {
  setItem(key: string, value: string): Promise<void>;
}

/** The synchronous view the registry's evaluation gate reads on each install. */
export interface PluginTrustGate {
  /** True only when this exact bundle hash is the approved one for the pair. */
  isApproved(serverId: string, pluginId: string, hash: string): boolean;
  /** True when any hash was ever approved for the pair, regardless of which. */
  hasApprovalForPlugin(serverId: string, pluginId: string): boolean;
}

function approvalKey(serverId: string, pluginId: string): string {
  return `${serverId}\u0000${pluginId}`;
}

/**
 * In-memory, synchronously-queryable view of plugin approvals, hydrated from
 * `AsyncStorage`. `installCatalog` and `runPluginClientBundle` are synchronous,
 * so the gate cannot await storage; it reads this store's in-memory map.
 */
export class PluginTrustStore implements PluginTrustGate {
  /** Keyed `serverId\0pluginId` → the one approved bundle hash for that pair. */
  private approvals = new Map<string, PluginApproval>();
  private readonly listeners = new Set<() => void>();
  private hydrated = false;
  private hydration: Promise<void> | null = null;

  constructor(private readonly storage: TrustStorage = AsyncStorage) {}

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  isHydrated(): boolean {
    return this.hydrated;
  }

  /** Loads persisted approvals once. Idempotent; notifies subscribers when done. */
  hydrate(): Promise<void> {
    if (!this.hydration) {
      this.hydration = this.loadFromStorage();
    }
    return this.hydration;
  }

  private async loadFromStorage(): Promise<void> {
    try {
      const stored = await readValidatedJson(this.storage, TRUST_STORAGE_KEY, ApprovalsSchema);
      if (stored) {
        for (const approval of stored) {
          this.approvals.set(approvalKey(approval.serverId, approval.pluginId), approval);
        }
      }
    } catch (error) {
      console.warn("[Plugins] Failed to load plugin trust store", error);
    } finally {
      this.hydrated = true;
      this.notify();
    }
  }

  /** True only when this exact bundle hash is the approved one for the pair. */
  isApproved(serverId: string, pluginId: string, hash: string): boolean {
    return this.approvals.get(approvalKey(serverId, pluginId))?.hash === hash;
  }

  /** True when any hash was ever approved for the pair, regardless of which. */
  hasApprovalForPlugin(serverId: string, pluginId: string): boolean {
    return this.approvals.has(approvalKey(serverId, pluginId));
  }

  /**
   * Approves one exact bundle for a host. Updates memory synchronously so the
   * synchronous gate sees it immediately, then writes through to storage.
   */
  approve(serverId: string, pluginId: string, hash: string): Promise<void> {
    this.approvals.set(approvalKey(serverId, pluginId), {
      serverId,
      pluginId,
      hash,
      approvedAt: new Date().toISOString(),
    });
    this.notify();
    return this.persist();
  }

  /** Revokes the pair's approval. The bundle stops evaluating on next install. */
  revoke(serverId: string, pluginId: string): Promise<void> {
    if (!this.approvals.delete(approvalKey(serverId, pluginId))) return Promise.resolve();
    this.notify();
    return this.persist();
  }

  private persist(): Promise<void> {
    return this.storage
      .setItem(TRUST_STORAGE_KEY, JSON.stringify([...this.approvals.values()]))
      .catch((error) => console.warn("[Plugins] Failed to persist plugin trust store", error));
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}

export const pluginTrustStore = new PluginTrustStore();
