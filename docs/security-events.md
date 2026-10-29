# Security events

Core can tell a receiver what it saw of every API request, without telling it what the request carried. A receiver, such as the hosted offer, turns those events into fraud signals. Core only emits: it has no rules, no alerts and no blocking.

> Status: slice 0. Only the HTTP-level event `request` and the gap marker `events_dropped` exist. Login attempts, AI calls and quotas will add their own event types in their slices, through the same interface.

## Plug a receiver

A receiver implements `SecurityEventSink` and is passed to `startServer`. Core never asks whether it runs hosted or self-hosted: the host program decides.

```ts
import { startServer, parseEnv, type SecurityEventSink } from "@rin-language/core-server";

const sink: SecurityEventSink = {
  emit(event) {
    // write to a queue, a table, a file...
  },
};

await startServer(parseEnv(process.env), { securityEventSink: sink });
```

Without a receiver nothing is measured, queued or built: a self-hosted server pays nothing for a feature it does not use.

`emit` may return a promise. It is called one event at a time, in order, in the background. It should not throw; if it does, the event counts as lost (see [Delivery](#delivery)).

## The `request` event

One event per API request, emitted once the response is ready.

| Field | Meaning |
|---|---|
| `type` | `"request"`. |
| `occurredAt` | ISO 8601 time the request started. |
| `requestId` | The `X-Request-Id` the client received, also in the server logs. |
| `method` | HTTP method. |
| `route` | The route pattern, such as `/v1/limits`, or `unmatched` for a path that matches no route. Never the path the client sent. |
| `status` | HTTP status sent. |
| `durationMs` | Milliseconds from the start of the request to its response. |
| `requestBytes` | Bytes of body the server **read**. 0 for a request whose body it did not read, such as a GET or a body refused as too large. The `Content-Length` header is not used, since the client can lie in it. |
| `responseBytes` | Bytes of the response body. |
| `clientKind` | `browser`, `script`, `declared_bot` or `none`. See [Client kind](#client-kind). |
| `userId` | The authenticated user. Absent for an anonymous request. |
| `errorCode` | The `ApiError` code of a failed request, such as `unauthorized`, `not_found`, `payload_too_large`, `rate_limited`. Absent when the request succeeded. |
| `ipFingerprint` | `{ keyId, value }`, see [Network fingerprint](#network-fingerprint). Absent without a key or without a readable address. |

```json
{
  "type": "request",
  "occurredAt": "2026-10-30T10:15:02.113Z",
  "requestId": "9d2c6b7e-5a0e-4f4e-9d87-1f6c3c6b8a10",
  "method": "GET",
  "route": "/v1/limits",
  "status": 200,
  "durationMs": 3,
  "requestBytes": 0,
  "responseBytes": 64,
  "clientKind": "browser",
  "ipFingerprint": { "keyId": "2026-10", "value": "3f9a0c5d7e1b4a68c2d09e7f51b3a4c6" }
}
```

An authenticated request also has `userId`, and a failed one `errorCode`.

### What is never recorded

The body, the text a user wrote, the query string, any header (including `Authorization`, `Cookie` and `User-Agent`), the raw path, the address, an email. Tests check these cases with marker strings.

### What is left out

- Routes marked `isProbe: true`, such as `/health`: monitoring polls them all day and they would drown the averages.
- The interactive documentation and the web client files: they are not API traffic.

Everything else is emitted, including unknown paths (`unmatched`), refused bodies and preflight requests, since scans and abuse show up there.

## Client kind

The `User-Agent` is read, reduced to a coarse kind, and dropped. A script and a browser tell a fraud rule something; the exact version only singles a person out when combined with an address.

Rules are applied in this order, on the first 512 characters, ignoring case:

1. missing or blank: `none`
2. contains a `declaredBot` fragment: `declared_bot`
3. contains a `script` fragment: `script`
4. contains a `browser` fragment: `browser`
5. anything else: `script` (a program that does not look like a browser)

The order matters: crawlers and headless browsers also say `Mozilla/`. The fragments are in `securityEvents.clientKinds` of `config/app.json`; the defaults are in the code. It is a hint, not proof, since a script can write `Mozilla/`.

## Network fingerprint

An address is turned into a keyed hash of its network, so an event never carries the address and nobody without the key can recover it from the small IPv4 space.

- HMAC-SHA256 of the network, truncated to 128 bits (32 hexadecimal characters).
- The network is the address for IPv4 and the `/64` for IPv6, since one household or phone is handed a whole `/64`. `::ffff:1.2.3.4` is read as `1.2.3.4`.
- The key comes from `APP_IP_FINGERPRINT_KEY` (at least 32 characters) and is named by `APP_IP_FINGERPRINT_KEY_ID`. Both are set or neither. The key is a secret: never put it in `app.json`.
- `keyId` is in every fingerprint. Two fingerprints are comparable only when their `keyId` is the same. Core never rotates the key; the operator does, and a rotation cuts the link between old and new events on purpose.
- This is **pseudonymisation**, not anonymisation. Whoever holds the key can recompute the fingerprint of a known address, which is also what makes it possible to block a fingerprint without keeping addresses. It remains personal data under the GDPR: keep it for a short time and mention it in the privacy policy.

### Where the address comes from

By default the address of the TCP connection, and `X-Forwarded-For` is ignored, since a client can write anything in it. When proxies of yours sit in front of the server (a CDN, a platform router), set `securityEvents.trustedProxyHops` to how many. The address is then taken that many entries from the **right** of `X-Forwarded-For` (the connection is the last proxy), and what is to the left is never read.

If the chain is shorter than that (a request that skipped a proxy) or the entry is not an IP address, the connection address is used, which is the only address that can be vouched for.

Behind such proxies the server should only accept traffic from them, or a client can reach it directly and write the header itself.

## Delivery

Events never slow a request and never break one.

- A request only appends its event to an in-memory queue. A background task hands events to the receiver one at a time, in order.
- The queue holds at most `securityEvents.queueSize` events (1000 by default). Past that, new events are dropped, so memory stays bounded.
- A drop is never silent. Once the receiver answers again, core emits `events_dropped`:

| Field | Meaning |
|---|---|
| `type` | `"events_dropped"`. |
| `occurredAt` | When this notice was emitted. |
| `count` | How many events are missing. |
| `since` | When the first missing event happened. |

  A gap is itself a signal: an attacker who floods a slow receiver to hide requests leaves this trace with the exact window. Events whose delivery failed (the receiver threw or rejected) count as missing too.
- Logs: one warning when the queue overflows, one error line when the receiver starts failing and one when it recovers, one line with the count when a gap is reported. Never one line per event, and never an event's content.
- Closing the server delivers what is still queued and reports any gap before the database closes.
- A failure while building or publishing an event is logged and never reaches the client.

Limits to know: a receiver that never answers blocks the delivery task, so the queue fills and losses are counted; closing the server then waits for it. The rate limiting of slice 8 applies independently of events.

## Configuration

`config/app.json`, key `securityEvents`:

| Key | Default | Meaning |
|---|---|---|
| `trustedProxyHops` | `0` | Proxies in front of the server whose `X-Forwarded-For` entry can be trusted. |
| `queueSize` | `1000` | Events held back while the receiver is slow. |
| `clientKinds` | see code | `declaredBot`, `script` and `browser`: lists of lowercase fragments of the `User-Agent`. |

Environment variables:

| Variable | Meaning |
|---|---|
| `APP_IP_FINGERPRINT_KEY` | Secret key, 32 characters or more. |
| `APP_IP_FINGERPRINT_KEY_ID` | Label of the key, 1 to 32 letters, digits, `-` or `_`. |

A key without a receiver only logs a warning at startup.

## Test it

The test-kit has `FakeSecurityEventSink`, which records events, can be held shut with `hold()` and `release()`, and can be made to fail with `failNext()`.

## Not in core

The rules that turn events into alerts, the alert channels, the retention of events and any blocking of a fingerprint or an account belong to the receiver. Core gives the receiver what it needs: the same fingerprint for the same network under the same key, so a fingerprint can be blocked without ever storing an address.
