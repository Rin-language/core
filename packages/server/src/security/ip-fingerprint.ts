import { createHmac } from "node:crypto";
import { isIPv4, isIPv6 } from "node:net";
import type { IpFingerprint } from "../ports/security-events.js";

/** Below this a key can be guessed, and every fingerprint with it could be reversed. */
export const MIN_FINGERPRINT_KEY_LENGTH = 32;
// 128 bits are plenty to tell addresses apart and cost nothing to store.
const FINGERPRINT_BYTES = 16;
const IPV6_GROUP_COUNT = 8;
// One household or one phone is handed a whole /64, so the network is the identity.
const IPV6_NETWORK_GROUPS = 4;
const MAPPED_GROUP_INDEX = 5;
const MAPPED_MARKER = 0xffff;

export interface FingerprintKey {
  key: string;
  keyId: string;
}

function ipv4TailToGroups(address: string): string {
  const lastColon = address.lastIndexOf(":");
  const tail = address.slice(lastColon + 1);
  if (!isIPv4(tail)) return address;
  const [a = 0, b = 0, c = 0, d = 0] = tail.split(".").map(Number);
  const high = ((a << 8) | b).toString(16);
  const low = ((c << 8) | d).toString(16);
  return `${address.slice(0, lastColon + 1)}${high}:${low}`;
}

function expandIpv6(address: string): number[] | undefined {
  const withoutZone = address.split("%")[0] ?? address;
  const converted = ipv4TailToGroups(withoutZone);
  const [head = "", tail, ...extra] = converted.split("::");
  if (extra.length > 0) return undefined;
  const headGroups = head === "" ? [] : head.split(":");
  const tailGroups = tail === undefined || tail === "" ? [] : tail.split(":");
  const missing = IPV6_GROUP_COUNT - headGroups.length - tailGroups.length;
  const groups =
    tail === undefined
      ? headGroups
      : [...headGroups, ...Array<string>(missing).fill("0"), ...tailGroups];
  const numbers = groups.map((group) => Number.parseInt(group, 16));
  return numbers.length === IPV6_GROUP_COUNT ? numbers : undefined;
}

/**
 * One text per network the address belongs to: the same for every form of an
 * address (compressed, expanded, IPv4-mapped), undefined for anything else.
 */
function networkOf(address: string): string | undefined {
  if (isIPv4(address)) return `v4:${address}`;
  if (!isIPv6(address)) return undefined;
  const groups = expandIpv6(address);
  if (groups === undefined) return undefined;
  const isMappedIpv4 =
    groups.slice(0, MAPPED_GROUP_INDEX).every((group) => group === 0) &&
    groups[MAPPED_GROUP_INDEX] === MAPPED_MARKER;
  if (isMappedIpv4) {
    const [high = 0, low = 0] = groups.slice(IPV6_GROUP_COUNT - 2);
    return `v4:${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`;
  }
  const network = groups
    .slice(0, IPV6_NETWORK_GROUPS)
    .map((group) => group.toString(16).padStart(4, "0"));
  return `v6:${network.join(":")}`;
}

/**
 * A keyed hash of the address, so an event never carries the address itself and
 * nobody without the key can recover it from the small IPv4 space.
 */
export function createIpFingerprinter({ key, keyId }: FingerprintKey) {
  if (key.length < MIN_FINGERPRINT_KEY_LENGTH) {
    throw new Error(
      `The IP fingerprint key must be at least ${MIN_FINGERPRINT_KEY_LENGTH} characters long`,
    );
  }
  return (address: string): IpFingerprint | undefined => {
    const network = networkOf(address);
    if (network === undefined) return undefined;
    const value = createHmac("sha256", key)
      .update(network)
      .digest()
      .subarray(0, FINGERPRINT_BYTES)
      .toString("hex");
    return { keyId, value };
  };
}
