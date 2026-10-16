import { useVoiceAudioEngineOptional } from "@/contexts/voice-context";
import { useEffect } from "react";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { useHostFeature } from "@/runtime/host-features";
import { useHostRuntimeIsConnected } from "@/runtime/host-runtime";
import { pluginRegistry } from "./registry";
import { syncPluginCatalog, type CatalogTrust } from "./catalog-sync-model";
import { pluginTrustStore } from "./trust-store";
import { hashClientBundle } from "./bundle-hash";

const trust: CatalogTrust = {
  hashBundle: hashClientBundle,
  hydrate: () => pluginTrustStore.hydrate(),
  subscribe: pluginTrustStore.subscribe,
};

export function PluginCatalogSync({
  serverId,
  client,
}: {
  serverId: string;
  client: DaemonClient;
}) {
  const audio = useVoiceAudioEngineOptional();
  const connected = useHostRuntimeIsConnected(serverId);
  const supported = useHostFeature(serverId, "plugins");

  useEffect(
    () =>
      syncPluginCatalog({
        serverId,
        client,
        audio,
        connected,
        supported,
        registry: pluginRegistry,
        trust,
      }),
    [audio, client, connected, serverId, supported],
  );

  useEffect(() => () => pluginRegistry.removeHost(serverId), [serverId]);
  return null;
}
