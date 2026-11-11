import type { AudioEngine } from "@/audio";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import type { PluginRegistry } from "./registry";
import { pluginSettingsKey, pluginSettingsPrefix } from "./settings/query";

interface CatalogSyncInput {
  serverId: string;
  client: DaemonClient;
  audio: Pick<AudioEngine, "play"> | null;
  connected: boolean;
  supported: boolean;
  registry: Pick<
    PluginRegistry,
    "installCatalog" | "getSnapshot" | "removeHost" | "setCatalogStatus"
  >;
  trust: CatalogTrust;
}

/** What catalog sync needs from the plugin approval gate. */
export interface CatalogTrust {
  /** sha256 of a client bundle; computed here, never taken from the daemon. */
  hashBundle(clientBundle: string): Promise<string>;
  hydrate(): Promise<void>;
  /** Fires when an approval is granted, revoked or loaded. */
  subscribe(listener: () => void): () => void;
}

export function syncPluginCatalog({
  serverId,
  client,
  audio,
  connected,
  supported,
  registry,
  trust,
}: CatalogSyncInput): () => void {
  if (!supported || !audio) {
    registry.removeHost(serverId);
    registry.setCatalogStatus(serverId, "ready");
    return () => {};
  }
  // A dropped socket reconnects on the same client, so installations keep rendering offline.
  if (!connected) return () => {};
  registry.setCatalogStatus(serverId, "loading");
  const installationOptions = { client, audio };
  let cancelled = false;
  let refreshQueue = Promise.resolve();
  function refresh(replacePluginId?: string) {
    refreshQueue = refreshQueue.then(() => {
      if (cancelled) return undefined;
      registry.setCatalogStatus(serverId, "loading");
      return client
        .getPluginCatalog()
        .then(async (catalog) => {
          // The approval gate keys on sha256(clientBundle); hash each bundle before
          // handing the catalog to the synchronous registry.
          const hashes: Record<string, string> = {};
          await Promise.all(
            catalog.map(async (entry) => {
              if (entry.clientBundle) hashes[entry.id] = await trust.hashBundle(entry.clientBundle);
            }),
          );
          if (!cancelled) {
            registry.installCatalog(serverId, catalog, {
              ...installationOptions,
              replacePluginId,
              hashes,
            });
            registry.setCatalogStatus(serverId, "ready");
          }
          return undefined;
        })
        .catch((error) => {
          if (!cancelled) {
            registry.setCatalogStatus(serverId, "error");
            console.warn(`[Plugins] Failed to load catalog for ${serverId}`, error);
          }
          return undefined;
        });
    });
    return refreshQueue;
  }
  // An approval granted or revoked in the UI changes what may evaluate, so re-run the
  // catalog through the gate whenever trust changes or hydrates.
  void trust.hydrate();
  const unsubscribeTrust = trust.subscribe(() => {
    void refresh();
  });
  const observation = client.observeEvents([
    "status.plugin_catalog_changed",
    "status.plugin_settings_changed",
  ]);
  observation.subscribe({
    snapshot: () => {
      void refresh().then(() => {
        if (cancelled) return undefined;
        // Retained replicas miss offline writes and do not refetch when a screen mounts.
        for (const plugin of registry.getSnapshot()) {
          if (plugin.serverId !== serverId) continue;
          void plugin.queryClient.invalidateQueries({
            queryKey: pluginSettingsPrefix,
            refetchType: "all",
          });
        }
        return undefined;
      });
    },
    update: (message) => {
      if (message.type !== "status") return;
      if (message.payload.status === "plugin_settings_changed") {
        const { pluginId, settingsId } = message.payload;
        if (typeof settingsId === "string") {
          const plugin = registry
            .getSnapshot()
            .find((item) => item.serverId === serverId && item.id === pluginId);
          void plugin?.queryClient.invalidateQueries({ queryKey: pluginSettingsKey(settingsId) });
        }
      }
      if (message.payload.status === "plugin_catalog_changed") {
        const pluginId = message.payload.pluginId;
        if (typeof pluginId === "string") void refresh(pluginId);
      }
    },
  });
  return () => {
    cancelled = true;
    unsubscribeTrust();
    void observation
      .release()
      .catch((error) => console.warn("[Plugins] Failed to release catalog", error));
  };
}
