import AsyncStorage from "@react-native-async-storage/async-storage";
import { z } from "zod";
import { readValidatedJson, type ValidatedStorage } from "@/storage/validated-storage";

/**
 * Connecting to a daemon advertises a `browserHost` capability and mounts a
 * handler that lets THAT daemon drive the desktop app's built-in browser
 * (navigate, run JS, upload files). The daemon's own `browserTools.enabled`
 * switch lives in the daemon's config, so a hostile daemon can flip it on and
 * reach the user's logged-in browser and host files. The advertise and the
 * handler are therefore gated on a client-side, per-host opt-in the user
 * grants here — separate from plugin trust, which is a different concern.
 *
 * Default is OFF: a host not present in the store is not allowed. The desktop
 * browser being available is necessary but no longer sufficient.
 */
const CONSENT_STORAGE_KEY = "@paseo:browser-automation-hosts";

const ConsentSchema = z.object({
  serverId: z.string(),
  allowedAt: z.string(),
});

const ConsentsSchema = z.array(ConsentSchema);

export type BrowserAutomationConsent = z.infer<typeof ConsentSchema>;

export interface BrowserAutomationConsentStorage extends ValidatedStorage {
  setItem(key: string, value: string): Promise<void>;
}

/**
 * In-memory, synchronously-queryable view of per-host browser-automation
 * consent, hydrated from `AsyncStorage`. The advertise/mount decision runs
 * synchronously per connection, so it reads this store's in-memory map rather
 * than awaiting storage.
 */
export class BrowserAutomationConsentStore {
  /** Keyed by `serverId` → the host's consent record. */
  private allowed = new Map<string, BrowserAutomationConsent>();
  private readonly listeners = new Set<() => void>();
  private hydrated = false;
  private hydration: Promise<void> | null = null;

  constructor(private readonly storage: BrowserAutomationConsentStorage = AsyncStorage) {}

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  isHydrated(): boolean {
    return this.hydrated;
  }

  /** Loads persisted consent once. Idempotent; notifies subscribers when done. */
  hydrate(): Promise<void> {
    if (!this.hydration) {
      this.hydration = this.loadFromStorage();
    }
    return this.hydration;
  }

  private async loadFromStorage(): Promise<void> {
    try {
      const stored = await readValidatedJson(this.storage, CONSENT_STORAGE_KEY, ConsentsSchema);
      if (stored) {
        for (const consent of stored) {
          this.allowed.set(consent.serverId, consent);
        }
      }
    } catch (error) {
      console.warn("[BrowserAutomation] Failed to load consent store", error);
    } finally {
      this.hydrated = true;
      this.notify();
    }
  }

  /** True only when the user has opted this host into browser automation. */
  isAllowed(serverId: string): boolean {
    return this.allowed.has(serverId);
  }

  /**
   * Opts a host in. Updates memory synchronously so the advertise/mount gate
   * sees it immediately, then writes through to storage. A newly-granted host
   * advertises `browserHost` on its next connect; a live connection re-advertises
   * when it reconnects.
   */
  allow(serverId: string): Promise<void> {
    this.allowed.set(serverId, { serverId, allowedAt: new Date().toISOString() });
    this.notify();
    return this.persist();
  }

  /**
   * Opts a host out. The mounted handler tears down promptly (subscribers are
   * notified) and the capability is no longer advertised on the next connect.
   */
  disallow(serverId: string): Promise<void> {
    if (!this.allowed.delete(serverId)) return Promise.resolve();
    this.notify();
    return this.persist();
  }

  private persist(): Promise<void> {
    return this.storage
      .setItem(CONSENT_STORAGE_KEY, JSON.stringify([...this.allowed.values()]))
      .catch((error) => console.warn("[BrowserAutomation] Failed to persist consent store", error));
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}

export const browserAutomationConsentStore = new BrowserAutomationConsentStore();
