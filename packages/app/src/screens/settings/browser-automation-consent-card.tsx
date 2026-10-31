import React, { useCallback, useEffect, useSyncExternalStore } from "react";
import { Text, View } from "react-native";
import { Switch } from "@/components/ui/switch";
import { getIsElectron } from "@/constants/platform";
import { browserAutomationConsentStore } from "@/runtime/browser-automation-consent";
import { settingsStyles } from "@/styles/settings";

// TODO(casket): localize these strings (add i18n keys under
// settings.host.browserAutomation) once copy is settled.
const TITLE = "Let this host drive the desktop browser";
const HINT =
  "Off by default. When on, this host can navigate, run scripts in, and upload files to the desktop app's built-in browser. Only enable it for hosts you trust. Enabling takes effect the next time the host reconnects; turning it off stops access immediately.";

/**
 * Client-side, per-host opt-in for browser automation. The desktop app only
 * advertises the `browserHost` capability and mounts the handler for hosts the
 * user enables here; a daemon cannot grant itself this access. Only meaningful
 * in the desktop app, where the built-in browser exists.
 */
export function BrowserAutomationConsentCard({ serverId }: { serverId: string }) {
  useEffect(() => {
    void browserAutomationConsentStore.hydrate();
  }, []);

  const allowed = useSyncExternalStore(browserAutomationConsentStore.subscribe, () =>
    browserAutomationConsentStore.isAllowed(serverId),
  );

  const handleValueChange = useCallback(
    (next: boolean) => {
      if (next) {
        void browserAutomationConsentStore.allow(serverId);
      } else {
        void browserAutomationConsentStore.disallow(serverId);
      }
    },
    [serverId],
  );

  if (!getIsElectron()) return null;

  return (
    <View style={settingsStyles.card} testID="host-page-browser-automation-consent-card">
      <View style={settingsStyles.row}>
        <View style={settingsStyles.rowContent}>
          <Text style={settingsStyles.rowTitle}>{TITLE}</Text>
          <Text style={settingsStyles.rowHint}>{HINT}</Text>
        </View>
        <Switch
          value={allowed}
          onValueChange={handleValueChange}
          accessibilityLabel="Enable browser automation for this host"
          testID="host-page-browser-automation-consent-switch"
        />
      </View>
    </View>
  );
}
