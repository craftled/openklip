// Trust boundary guard for the local-only OpenKlip server.
//
// The server has no auth layer: it is designed to be reached only from the
// machine it runs on, over loopback. Two things keep that true:
//   1. `openklip serve`/`dev` binds Next's dev server to 127.0.0.1 by default
//      (src/cli.ts), so the OS itself refuses connections from other hosts.
//   2. This module rejects any request that carries positive browser
//      evidence of being off-device or cross-site (DNS rebinding to a public
//      hostname, or a cross-origin fetch/form-post from a real website),
//      even though the OS-level bind already blocks most of that traffic.
//      This is defense in depth for the case where OPENKLIP_HOST is
//      overridden to something non-loopback, or a proxy sits in front.
//
// Policy is permissive by default: a header is only used to reject when it
// is PRESENT and carries positive evidence of an untrusted origin. Missing
// headers never cause a rejection, so non-browser clients (CLI, curl, MCP
// stdio bridges) that omit Origin/Sec-Fetch-Site keep working, and existing
// same-origin browser calls (which send a loopback Host and no cross-site
// signal) keep working too.
//
// Server Actions (app/actions.ts) are NOT threaded through this guard: Next
// already enforces same-origin for Server Actions (an Origin/Host check) by
// default, which combined with loopback binding covers that mutation
// surface at the network layer without touching the direct-call unit tests
// in tests/server-actions.test.ts. If next.config.ts grows a `serverActions`
// block, pin `allowedOrigins` to loopback hosts there rather than disabling
// Next's built-in Server Action CSRF protection.
//
// A future LAN opt-in (reachable from other devices on the same network)
// must not simply widen this policy: it needs a per-launch token checked on
// every mutating request, not a header-based allowlist. Out of scope here.

const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

function stripBrackets(host: string): string {
  if (host.startsWith("[") && host.endsWith("]")) {
    return host.slice(1, -1);
  }
  return host;
}

// Strips a trailing ":<port>" from a Host-header-shaped value. IPv6 literals
// in a Host header are always bracketed ("[::1]:4399"), so it is safe to
// split on the last colon once brackets are handled first.
function stripPort(host: string): string {
  if (host.startsWith("[")) {
    // Bracketed IPv6 literal, e.g. "[::1]" or "[::1]:4399".
    return stripBrackets(host.slice(0, host.indexOf("]") + 1));
  }
  // A bare (unbracketed) IPv6 literal like "::1" contains more than one
  // colon; there is no way to unambiguously split off a port from that
  // shape, so leave it as-is rather than misreading a hextet as a port.
  const colonCount = (host.match(/:/g) ?? []).length;
  if (colonCount !== 1) {
    return host;
  }
  const lastColon = host.lastIndexOf(":");
  const maybePort = host.slice(lastColon + 1);
  if (/^\d+$/.test(maybePort)) {
    return host.slice(0, lastColon);
  }
  return host;
}

export function isLoopbackHost(hostHeader: string | null): boolean {
  // No host to judge: treat as trusted. This is the non-browser-client case
  // (bare CLI/curl requests built without a Host header at all); the
  // caller-level policy still applies Origin / Sec-Fetch-Site checks.
  if (hostHeader === null) {
    return true;
  }
  const bare = stripPort(hostHeader.trim().toLowerCase());
  if (LOOPBACK_HOSTNAMES.has(bare)) {
    return true;
  }
  // Any 127.0.0.0/8 address is loopback, not just 127.0.0.1.
  return /^127(\.\d{1,3}){3}$/.test(bare);
}

/**
 * Core trust policy: allow unless a browser header proves the request is
 * off-device or cross-site. See the module doc comment for the full
 * rationale; each check below only rejects on POSITIVE evidence.
 */
export function isTrustedRequest(req: Request): boolean {
  const host = req.headers.get("host");
  if (host !== null && !isLoopbackHost(host)) {
    return false;
  }

  const origin = req.headers.get("origin");
  if (origin !== null) {
    let originHost: string | null;
    try {
      originHost = new URL(origin).hostname;
    } catch {
      // Unparseable Origin header: fail closed rather than let a malformed
      // value slip past as "no evidence".
      return false;
    }
    if (!isLoopbackHost(originHost)) {
      return false;
    }
  }

  const secFetchSite = req.headers.get("sec-fetch-site");
  if (
    secFetchSite !== null &&
    secFetchSite !== "same-origin" &&
    secFetchSite !== "none"
  ) {
    return false;
  }

  return true;
}

/**
 * Route-handler guard: returns a 403 JSON Response when the request fails
 * the trust policy, or `null` when it should proceed. Callers do:
 *   const denied = trustGuard(req);
 *   if (denied) return denied;
 */
export function trustGuard(req: Request): Response | null {
  if (isTrustedRequest(req)) {
    return null;
  }
  return Response.json(
    { error: "forbidden: request did not pass the local trust check" },
    { status: 403 }
  );
}
