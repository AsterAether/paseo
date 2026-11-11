import { CryptoDigestAlgorithm, digestStringAsync } from "expo-crypto";

/**
 * sha256 of a plugin's client bundle, the hash that keys trust approvals. The
 * attacker controls the bundle, so this must be a cryptographic hash — a
 * non-crypto hash could be forced to collide with an already-approved bundle.
 */
export function hashClientBundle(bundle: string): Promise<string> {
  return digestStringAsync(CryptoDigestAlgorithm.SHA256, bundle);
}
