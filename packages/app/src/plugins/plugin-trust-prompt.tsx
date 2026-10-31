import { useCallback } from "react";
import { Modal, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { Button } from "@/components/ui/button";
import { useHosts } from "@/runtime/host-runtime";
import { pluginRegistry, usePendingPluginApprovals, type PendingPluginApproval } from "./registry";
import { pluginTrustStore } from "./trust-store";

/**
 * Prompts the user to approve a plugin's client bundle before it runs. A plugin
 * ships JavaScript the app evaluates with full host access, so a connected
 * daemon the user has not vetted could otherwise run arbitrary code. Nothing
 * runs until the user approves this exact host and bundle; the default is deny.
 *
 * TODO(casket): minimal functional prompt — one host/plugin at a time, no
 * bundle diff or source preview, no settings surface to review past approvals.
 */
export function PluginTrustPrompt() {
  const pending = usePendingPluginApprovals();
  const hosts = useHosts();
  const entry = pending[0];
  if (!entry) return null;
  const label = hosts.find((host) => host.serverId === entry.serverId)?.label ?? entry.serverId;
  return <PendingApprovalDialog entry={entry} label={label} />;
}

function PendingApprovalDialog({ entry, label }: { entry: PendingPluginApproval; label: string }) {
  const approve = useCallback(() => {
    void pluginTrustStore.approve(entry.serverId, entry.pluginId, entry.hash);
  }, [entry.serverId, entry.pluginId, entry.hash]);
  const deny = useCallback(() => {
    pluginRegistry.dismissPending(entry.serverId, entry.pluginId, entry.hash);
  }, [entry.serverId, entry.pluginId, entry.hash]);

  return (
    <Modal transparent animationType="fade" visible onRequestClose={deny}>
      <View style={styles.backdrop}>
        <View style={styles.card} accessibilityRole="alert">
          <Text style={styles.title}>Run this plugin?</Text>
          <Text style={styles.body}>
            {label} wants to run the plugin {entry.pluginId}. Approving lets its code run inside the
            app on this host.
          </Text>
          <Text style={styles.detail}>
            {entry.changed
              ? "This plugin's code changed since you last approved it."
              : "You have not approved this plugin's code on this host before."}
          </Text>
          <View style={styles.actions}>
            <Button variant="outline" size="sm" onPress={deny}>
              Deny
            </Button>
            <Button size="sm" onPress={approve}>
              Approve
            </Button>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create((theme) => ({
  backdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: theme.spacing[4],
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  card: {
    width: "100%",
    maxWidth: 420,
    gap: theme.spacing[3],
    padding: theme.spacing[6],
    borderRadius: theme.borderRadius.lg,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
  title: {
    color: theme.colors.foreground,
    fontWeight: theme.fontWeight.medium,
    fontSize: theme.fontSize.lg,
  },
  body: {
    color: theme.colors.foreground,
  },
  detail: {
    color: theme.colors.foregroundMuted,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: theme.spacing[2],
    marginTop: theme.spacing[2],
  },
}));
