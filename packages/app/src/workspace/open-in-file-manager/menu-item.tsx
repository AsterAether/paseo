import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { FolderOpen } from "lucide-react-native";
import { withUnistyles } from "react-native-unistyles";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { ContextMenuItem } from "@/components/ui/context-menu";
import { getIsElectron } from "@/constants/platform";
import { useToast } from "@/contexts/toast-context";
import { useIsLocalDaemon } from "@/hooks/use-is-local-daemon";
import type { Theme } from "@/styles/theme";
import { openDesktopTarget, useDesktopOpenTargets } from "@/workspace/desktop-open-targets";

interface OpenInFileManagerMenuItemProps {
  path?: string | null;
  /**
   * The host that reported this path. Open-folder hands the path to the host
   * OS, so offer it only for the local daemon: a remote/untrusted daemon could
   * report a path that maps to a file on this machine. When the host is unknown
   * (serverId not wired at the call site) the action stays available.
   */
  serverId?: string | null;
  testID: string;
  surface?: "context" | "dropdown";
}

const ThemedFolderOpen = withUnistyles(FolderOpen);

const foregroundMutedColorMapping = (theme: Theme) => ({
  color: theme.colors.foregroundMuted,
});

const leadingIcon = <ThemedFolderOpen size={14} uniProps={foregroundMutedColorMapping} />;

export function OpenInFileManagerMenuItem({
  path,
  serverId,
  testID,
  surface = "dropdown",
}: OpenInFileManagerMenuItemProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const isElectron = getIsElectron();
  const workspacePath = path?.trim() ?? "";
  const normalizedServerId = serverId?.trim() ?? "";
  const isLocalDaemon = useIsLocalDaemon(normalizedServerId);
  const hostAllowsOpen = normalizedServerId.length === 0 || isLocalDaemon;
  const { targets } = useDesktopOpenTargets({
    isLocalExecution: isElectron && workspacePath.length > 0,
  });
  const fileManagerTarget = targets.find((target) => target.kind === "file-manager");

  const openInFileManager = useCallback(() => {
    if (!fileManagerTarget || workspacePath.length === 0) return;
    void openDesktopTarget({
      editorId: fileManagerTarget.id,
      workspacePath,
    }).catch((error) => {
      console.warn("[open-in-file-manager] open failed", error);
      toast.error(t("sidebar.project.actions.openFolderFailed"));
    });
  }, [fileManagerTarget, t, toast, workspacePath]);

  if (!isElectron || !fileManagerTarget || workspacePath.length === 0 || !hostAllowsOpen) {
    return null;
  }

  const label = t("sidebar.project.actions.openFolder");
  if (surface === "context") {
    return (
      <ContextMenuItem testID={testID} leading={leadingIcon} onSelect={openInFileManager}>
        {label}
      </ContextMenuItem>
    );
  }
  return (
    <DropdownMenuItem testID={testID} leading={leadingIcon} onSelect={openInFileManager}>
      {label}
    </DropdownMenuItem>
  );
}
