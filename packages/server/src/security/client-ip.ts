import { isIP } from "node:net";

export interface ClientIpInput {
  /** The address of the TCP connection: the last proxy, or the client itself. */
  remoteAddress?: string | undefined;
  /** The raw X-Forwarded-For value. */
  forwardedFor?: string | undefined;
  /** How many proxies we run or trust in front of the server. */
  trustedProxyHops: number;
}

/**
 * Finds the address of the caller. Each trusted proxy appends the address it
 * saw to X-Forwarded-For, so the client sits `trustedProxyHops` entries from
 * the right of that chain plus the connection itself. Everything to its left
 * was written by the client and is never read. When the chain does not fit
 * (a request that skipped a proxy, an unreadable entry) the connection is the
 * only address that can be vouched for.
 */
export function resolveClientIp(input: ClientIpInput): string | undefined {
  const { remoteAddress, forwardedFor, trustedProxyHops } = input;
  if (remoteAddress === undefined) return undefined;
  if (trustedProxyHops === 0 || forwardedFor === undefined) {
    return remoteAddress;
  }
  const chain = [...forwardedFor.split(","), remoteAddress].map((entry) =>
    entry.trim(),
  );
  const candidate = chain[chain.length - 1 - trustedProxyHops];
  return candidate !== undefined && isIP(candidate) !== 0
    ? candidate
    : remoteAddress;
}

type Bindings = Record<string, unknown>;

const isBindings = (value: unknown): value is Bindings =>
  typeof value === "object" && value !== null;

/** Reads the connection address Node gives Hono, which the Hono helper cannot do without a real socket. */
export function remoteAddressOf(env: unknown): string | undefined {
  if (!isBindings(env)) return undefined;
  const bindings = isBindings(env.server) ? env.server : env;
  const incoming = bindings.incoming;
  if (!isBindings(incoming)) return undefined;
  const socket = incoming.socket;
  if (!isBindings(socket)) return undefined;
  const address = socket.remoteAddress;
  return typeof address === "string" ? address : undefined;
}
