import { createPlayAudio, type AudioEngine } from "@/audio";
import { getHostRuntimeStore } from "@/runtime/host-runtime";
import { getPluginClientApi } from "./client-state/api";
import type { PluginClientOpenPanelOptions } from "@getpaseo/plugin/client";
import { subscribePluginRpc } from "@getpaseo/plugin/client/host";
import {
  createPluginAgentActionContext,
  createPluginCapabilities,
  createPluginWorkspaceActionContext,
} from "./actions";
import { createPluginClientStateSource } from "./client-state/source";
import type { PluginClientRuntime } from "./evaluate";
import { createPluginNavigation } from "./navigation";
import { pluginButtonStore } from "./buttons";
import type { InstalledPlugin } from "./types";

export function createPluginClientRuntime(
  installation: InstalledPlugin,
  audio: Pick<AudioEngine, "play">,
): PluginClientRuntime {
  const capabilities = createPluginCapabilities(
    installation,
    createPluginNavigation({ serverId: installation.serverId, workspaceId: null }),
  );
  return {
    ...capabilities,
    i18n: installation.i18n,
    playAudio: createPlayAudio(audio, installation.lifetime.signal),
    hosts: getPluginClientApi(installation).hosts,
    addComposerPill(contribution) {
      return pluginButtonStore.addComposerPill(installation, contribution);
    },
    addHeaderButton(contribution) {
      return pluginButtonStore.addHeaderButton(installation, contribution);
    },
    openPanel(panelId, options) {
      openClientPanel({ installation, panelId, options });
    },
    subscribe: (contract, input, onEvent, options) =>
      subscribePluginRpc(contract, installation.subscribe, input, onEvent, options),
  };
}

function openClientPanel(input: {
  installation: InstalledPlugin;
  panelId: string;
  options: PluginClientOpenPanelOptions;
}): void {
  const { installation, panelId, options } = input;
  const workspaceId = options.workspaceId.trim();
  const agentId = options.agentId?.trim();
  // The workspace may live on another configured host; the panel still renders from this plugin.
  const serverId = options.serverId?.trim() || installation.serverId;
  if (
    !getHostRuntimeStore()
      .getHosts()
      .some((host) => host.serverId === serverId)
  )
    throw new Error(`Unknown Paseo host: ${serverId}`);
  const state = createPluginClientStateSource(serverId);
  const navigation = createPluginNavigation({
    serverId,
    workspaceId,
    pluginServerId: installation.serverId,
  });
  const action = agentId
    ? createPluginAgentActionContext({
        plugin: installation,
        navigation,
        state,
        workspaceId,
        agentId,
      })
    : createPluginWorkspaceActionContext({
        plugin: installation,
        navigation,
        state,
        workspaceId,
      });
  if (!action) throw new Error("Plugin panel context is unavailable");
  action.openPanel(panelId, { location: options.location });
}
