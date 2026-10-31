import { useQuery } from "@tanstack/react-query";
import { getDesktopDaemonStatus, shouldUseDesktopDaemon } from "@/desktop/daemon/desktop-daemon";
import { useHostRuntimeActiveConnectionId } from "@/runtime/host-runtime";
import { connectionFromListen } from "@/types/host-connection";

const DESKTOP_DAEMON_SERVER_ID_QUERY_KEY = ["desktop-daemon-server-id"] as const;

interface DesktopDaemonServerIdResult {
  serverId: string | null;
  /** The connection the app uses for the desktop's own daemon, from its listen address. */
  connectionId: string | null;
}

async function loadDesktopDaemonServerId(): Promise<DesktopDaemonServerIdResult> {
  const status = await getDesktopDaemonStatus();
  const serverId = status.serverId.trim();
  return {
    serverId: serverId.length > 0 ? serverId : null,
    connectionId: status.listen ? (connectionFromListen(status.listen)?.id ?? null) : null,
  };
}

function useLocalDaemonServerIdQuery() {
  const isDesktopApp = shouldUseDesktopDaemon();

  return useQuery({
    queryKey: DESKTOP_DAEMON_SERVER_ID_QUERY_KEY,
    queryFn: loadDesktopDaemonServerId,
    enabled: isDesktopApp,
    staleTime: Infinity,
    gcTime: Infinity,
    refetchInterval: (activeQuery) =>
      activeQuery.state.data?.serverId && activeQuery.state.data.connectionId ? false : 1000,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    retry: false,
  });
}

export function useLocalDaemonServerId(): string | null {
  const isDesktopApp = shouldUseDesktopDaemon();
  const query = useLocalDaemonServerIdQuery();

  if (!isDesktopApp) {
    return null;
  }

  return query.data?.serverId ?? null;
}

export type LocalDaemonServerIdState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "resolved"; serverId: string | null };

export function useLocalDaemonServerIdState(): LocalDaemonServerIdState {
  const isDesktopApp = shouldUseDesktopDaemon();
  const query = useLocalDaemonServerIdQuery();

  if (!isDesktopApp) {
    return { status: "resolved", serverId: null };
  }
  if (query.isError) {
    return { status: "error" };
  }
  if (query.isSuccess) {
    return { status: "resolved", serverId: query.data.serverId };
  }
  return { status: "loading" };
}

/**
 * A host is the local daemon only while the app talks to it over the desktop
 * daemon's own listen connection. The server id alone is what a daemon reports
 * about itself, so a remote daemon could copy it; the connection is the app's
 * own knowledge.
 */
export function isLocalDaemonConnection(input: {
  serverId: string;
  activeConnectionId: string | null;
  local: { serverId: string | null; connectionId: string | null };
}): boolean {
  const serverId = input.serverId.trim();
  if (!serverId || !input.local.serverId || !input.local.connectionId) return false;
  return serverId === input.local.serverId && input.activeConnectionId === input.local.connectionId;
}

export function useIsLocalDaemon(serverId: string): boolean {
  const query = useLocalDaemonServerIdQuery();
  const activeConnectionId = useHostRuntimeActiveConnectionId(serverId.trim());
  if (!shouldUseDesktopDaemon()) return false;
  return isLocalDaemonConnection({
    serverId,
    activeConnectionId,
    local: {
      serverId: query.data?.serverId ?? null,
      connectionId: query.data?.connectionId ?? null,
    },
  });
}
