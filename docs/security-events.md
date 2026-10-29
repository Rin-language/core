# Security events

Core can tell a receiver what it saw of every API request, without telling it what the request carried. A receiver that you provide can turn those events into fraud signals or alerts. Core only emits: it has no rules, no alerts and no blocking.

Without a receiver nothing is measured, queued or built, so a server that does not use this pays nothing.

## What an event holds

One `request` event per API request, once its response is ready: the time, the request id, the method, the route pattern (never the path sent), the status, the duration, the bytes of body read and sent, a coarse client kind (`browser`, `script`, `declared_bot` or `none`), and when they exist the user, the `ApiError` code and a fingerprint of the caller's network. The exact fields and their meaning are the types in [`packages/server/src/ports/security-events.ts`](../packages/server/src/ports/security-events.ts).

**Never recorded:** the body, any text a user wrote, the query string, any header (`Authorization`, `Cookie` and `User-Agent` included), the raw path, the address, an email. A new event type must follow the same rule.

Left out: probe routes such as `/health`, the documentation and the web client files.

## Plug a receiver

A receiver implements `SecurityEventSink` and is passed to `startServer`. Core does not choose who receives the events: the program that starts it does.

```ts
import { parseEnv, startServer, type SecurityEventSink } from "@rin-language/core-server";

const sink: SecurityEventSink = {
  emit(event) {
    // write to a queue, a table, a file...
  },
};

await startServer(parseEnv(process.env), { securityEventSink: sink });
```

`emit` may return a promise. It is called one event at a time, in order, in the background, and should not throw: an event whose delivery fails counts as lost.

For tests, the test-kit has `FakeSecurityEventSink`, which records events, can be held shut with `hold()` and `release()` and made to fail with `failNext()`.

## Configuration

`securityEvents` in `config/app.json`:

| Key | Default | Meaning |
|---|---|---|
| `trustedProxyHops` | `0` | How many proxies of yours sit in front of the server. See below. |
| `queueSize` | `1000` | Events held back while the receiver is slow. |
| `clientKinds` | see code | Lowercase fragments of the `User-Agent` that make a `declaredBot`, a `script` or a `browser`. Only the kind is kept, never the `User-Agent`. |

Environment variables, both or neither:

| Variable | Meaning |
|---|---|
| `APP_IP_FINGERPRINT_KEY` | Secret key, 32 characters or more. Never put it in `app.json`. Without it events carry no fingerprint, and a key set without a receiver only logs a warning. |
| `APP_IP_FINGERPRINT_KEY_ID` | Label of the key (1 to 32 letters, digits, `-` or `_`), carried in every fingerprint. |

**The caller's address.** By default it is the address of the TCP connection, and `X-Forwarded-For` is ignored, since a client can write anything in it. If proxies of yours stand in front of the server, set `trustedProxyHops` to their number, and let the server accept traffic only from them: otherwise a client that reaches it directly writes the header itself.

**The fingerprint** is a keyed hash of the caller's network, so an event never carries an address. It is pseudonymised data, not anonymous: whoever holds the key can recompute the fingerprint of a known address. Keep events for a short time. Two fingerprints compare only when their `keyId` is the same, so a key rotation, which the operator does, cuts the link with older events on purpose.

## Delivery

Events never slow a request and never break one. A request only appends its event to a bounded in-memory queue and a background task hands the events to the receiver. Past `queueSize` new events are dropped, so memory stays bounded.

A drop is never silent. Once the receiver answers again, core emits an `events_dropped` event with the number of missing events and when the first one happened. A gap is a signal in itself: flooding a slow receiver to hide requests leaves this trace.

Logs show one warning when the queue overflows and one line per outage, never one per event and never an event's content. Closing the server delivers what is still queued, and waits for a receiver that never answers.
