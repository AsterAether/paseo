import { describe, expect, it } from "vitest";
import { isLocalDaemonConnection } from "./use-is-local-daemon";

const local = { serverId: "srv_local", connectionId: "socket:/run/paseo.sock" };

describe("isLocalDaemonConnection", () => {
  it("is local over the desktop daemon's own listen connection", () => {
    expect(
      isLocalDaemonConnection({
        serverId: "srv_local",
        activeConnectionId: "socket:/run/paseo.sock",
        local,
      }),
    ).toBe(true);
  });

  it("is not local when another connection reports the local server id", () => {
    for (const activeConnectionId of ["direct:localhost:7777", "via:srv_sandbox", null]) {
      expect(isLocalDaemonConnection({ serverId: "srv_local", activeConnectionId, local })).toBe(
        false,
      );
    }
  });

  it("is not local without a known local daemon", () => {
    expect(
      isLocalDaemonConnection({
        serverId: "srv_local",
        activeConnectionId: "socket:/run/paseo.sock",
        local: { serverId: "srv_local", connectionId: null },
      }),
    ).toBe(false);
    expect(
      isLocalDaemonConnection({
        serverId: "srv_other",
        activeConnectionId: "socket:/run/paseo.sock",
        local,
      }),
    ).toBe(false);
  });
});
