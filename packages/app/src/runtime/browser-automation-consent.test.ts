import { describe, expect, it } from "vitest";
import {
  BrowserAutomationConsentStore,
  type BrowserAutomationConsentStorage,
} from "./browser-automation-consent";
import { shouldEnableBrowserAutomation } from "./host-runtime";

function createMemoryStorage(
  entries: Record<string, string> = {},
): BrowserAutomationConsentStorage {
  const values = new Map(Object.entries(entries));
  return {
    getItem: async (key) => values.get(key) ?? null,
    setItem: async (key, value) => {
      values.set(key, value);
    },
    removeItem: async (key) => {
      values.delete(key);
    },
  };
}

const CONSENT_KEY = "@paseo:browser-automation-hosts";

describe("shouldEnableBrowserAutomation", () => {
  it("advertises and mounts only when the browser is available and the host is consented", () => {
    expect(shouldEnableBrowserAutomation({ available: true, consented: true })).toBe(true);
  });

  it("stays off for a host without consent even when the browser is available", () => {
    expect(shouldEnableBrowserAutomation({ available: true, consented: false })).toBe(false);
  });

  it("stays off when the browser is unavailable regardless of consent", () => {
    expect(shouldEnableBrowserAutomation({ available: false, consented: true })).toBe(false);
  });
});

describe("BrowserAutomationConsentStore", () => {
  it("defaults to not allowed for an unknown host", () => {
    const store = new BrowserAutomationConsentStore(createMemoryStorage());
    expect(store.isAllowed("srv_a")).toBe(false);
  });

  it("allows a host synchronously and persists the grant", async () => {
    const storage = createMemoryStorage();
    const store = new BrowserAutomationConsentStore(storage);
    await store.allow("srv_a");
    expect(store.isAllowed("srv_a")).toBe(true);

    const rehydrated = new BrowserAutomationConsentStore(storage);
    await rehydrated.hydrate();
    expect(rehydrated.isAllowed("srv_a")).toBe(true);
  });

  it("revokes a host and persists the removal", async () => {
    const storage = createMemoryStorage({ [CONSENT_KEY]: JSON.stringify([]) });
    const store = new BrowserAutomationConsentStore(storage);
    await store.allow("srv_a");
    await store.disallow("srv_a");
    expect(store.isAllowed("srv_a")).toBe(false);

    const rehydrated = new BrowserAutomationConsentStore(storage);
    await rehydrated.hydrate();
    expect(rehydrated.isAllowed("srv_a")).toBe(false);
  });

  it("hydrates persisted grants and notifies subscribers", async () => {
    const storage = createMemoryStorage({
      [CONSENT_KEY]: JSON.stringify([{ serverId: "srv_a", allowedAt: new Date(0).toISOString() }]),
    });
    const store = new BrowserAutomationConsentStore(storage);
    let notifications = 0;
    store.subscribe(() => {
      notifications += 1;
    });
    expect(store.isAllowed("srv_a")).toBe(false);
    await store.hydrate();
    expect(store.isAllowed("srv_a")).toBe(true);
    expect(notifications).toBeGreaterThan(0);
  });

  it("notifies subscribers on allow and disallow", async () => {
    const store = new BrowserAutomationConsentStore(createMemoryStorage());
    const seen: boolean[] = [];
    store.subscribe(() => {
      seen.push(store.isAllowed("srv_a"));
    });
    await store.allow("srv_a");
    await store.disallow("srv_a");
    expect(seen).toEqual([true, false]);
  });
});
