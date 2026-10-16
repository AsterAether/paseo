import appPackage from "../../package.json";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { PluginRegistry } from "./registry";
import { PluginTrustStore, type TrustStorage } from "./trust-store";

vi.mock("./navigation", () => ({
  createPluginNavigation: () => ({}),
}));
vi.mock("./client-runtime", () => ({
  createPluginClientRuntime: () => ({}),
}));

// Spy on the one function that runs a bundle through `eval`. The gate's whole
// job is to keep this from being called for an unapproved bundle.
const { runBundleSpy } = vi.hoisted(() => ({ runBundleSpy: vi.fn() }));
vi.mock("./evaluate", () => ({ runPluginClientBundle: runBundleSpy }));

function evaluatedPlugin(id: string) {
  return {
    id,
    cleanup: async () => {},
    surfaces: [],
    settingsScreens: [],
    sidebarItems: { header: [], footer: [] },
    legacySidebarItems: [],
    filePanels: [],
    workspacePanels: [],
    commandCenterItems: [],
    clientSlashCommands: [],
    attachmentSources: [],
    themes: [],
    timelineTransformers: [],
    timelineRenderers: [],
  };
}

function createMemoryStorage(): TrustStorage {
  const entries = new Map<string, string>();
  return {
    getItem: (key) => Promise.resolve(entries.get(key) ?? null),
    setItem: (key, value) => {
      entries.set(key, value);
      return Promise.resolve();
    },
    removeItem: (key) => {
      entries.delete(key);
      return Promise.resolve();
    },
  };
}

const daemonClient = {} as DaemonClient;
const audio = { play: async () => 0 };
const SERVER = "host-a";
const PLUGIN = "example";

let trust: PluginTrustStore;
let registry: PluginRegistry;

function install(hash: string) {
  return registry.installCatalog(
    SERVER,
    [
      {
        id: PLUGIN,
        clientBundle: "CLIENT_BUNDLE_SOURCE",
        requirements: { paseo: `>=${appPackage.version}` },
      },
    ] as Parameters<PluginRegistry["installCatalog"]>[1],
    { client: daemonClient, audio, hashes: { [PLUGIN]: hash } },
  );
}

beforeEach(() => {
  runBundleSpy.mockReset();
  runBundleSpy.mockImplementation((id: string) => evaluatedPlugin(id));
  trust = new PluginTrustStore(createMemoryStorage());
  registry = new PluginRegistry({
    localeSource: { getLocale: () => "en", subscribe: () => () => {} },
    version: appPackage.version,
    createRuntime: () => ({}) as never,
    trust,
  });
});

afterEach(() => {
  registry.removeHost(SERVER);
});

describe("plugin client bundle approval gate", () => {
  it("does not evaluate an unapproved bundle and records it as pending", () => {
    install("hash-1");

    expect(runBundleSpy).not.toHaveBeenCalled();
    expect(registry.getSnapshot()).toEqual([]);
    expect(registry.getPendingApprovals()).toEqual([
      { serverId: SERVER, pluginId: PLUGIN, hash: "hash-1", changed: false },
    ]);
  });

  it("evaluates the bundle once the exact hash is approved", async () => {
    install("hash-1");
    expect(runBundleSpy).not.toHaveBeenCalled();

    await trust.approve(SERVER, PLUGIN, "hash-1");
    install("hash-1");

    expect(runBundleSpy).toHaveBeenCalledTimes(1);
    expect(registry.getSnapshot().map((plugin) => plugin.id)).toEqual([PLUGIN]);
    expect(registry.getPendingApprovals()).toEqual([]);
  });

  it("re-pends a changed bundle when only the old hash was approved", async () => {
    await trust.approve(SERVER, PLUGIN, "hash-1");

    install("hash-2");

    expect(runBundleSpy).not.toHaveBeenCalled();
    expect(registry.getSnapshot()).toEqual([]);
    expect(registry.getPendingApprovals()).toEqual([
      { serverId: SERVER, pluginId: PLUGIN, hash: "hash-2", changed: true },
    ]);
  });

  it("publishes when a pending plugin leaves the catalog", () => {
    install("hash-1");
    const listener = vi.fn();
    const unsubscribe = registry.subscribe(listener);

    registry.installCatalog(SERVER, [], { client: daemonClient, audio });

    expect(listener).toHaveBeenCalled();
    expect(registry.getPendingApprovals()).toEqual([]);
    unsubscribe();
  });
});
