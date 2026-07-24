/**
 * Client side of the OAuth flow.
 *
 * The browser bounces the user to the provider, then the provider returns
 * to /auth/callback with a `code`. The code is exchanged server-side (the
 * client secret never reaches the browser), so all this file does is:
 * build the authorize URL, guard against login-CSRF with a `state`, and
 * read the callback back out.
 *
 * Client IDs are public by design — they appear in the authorize URL the
 * browser navigates to — so they live in NEXT_PUBLIC_ vars. A button is
 * shown only when its client ID is configured at build time; the backend
 * independently gates the exchange on its secret.
 */

export type OAuthProvider = "google" | "github";

interface ProviderSpec {
  clientId: string | undefined;
  authorizeUrl: string;
  scope: string;
  /** Extra provider-specific query params. */
  extra?: Record<string, string>;
}

const PROVIDERS: Record<OAuthProvider, ProviderSpec> = {
  google: {
    clientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    scope: "openid email profile",
    // Let the user pick an account instead of silently reusing one.
    extra: { access_type: "online", prompt: "select_account" },
  },
  github: {
    clientId: process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID,
    authorizeUrl: "https://github.com/login/oauth/authorize",
    scope: "read:user user:email",
  },
};

const STATE_KEY = "nimbus_oauth";

/** True when this provider is configured and its button should show. */
export function oauthEnabled(provider: OAuthProvider): boolean {
  return Boolean(PROVIDERS[provider].clientId);
}

export function anyOAuthEnabled(): boolean {
  return oauthEnabled("google") || oauthEnabled("github");
}

function redirectUri(): string {
  // Must exactly match a URI registered with the provider and allowed by
  // the backend. Derived from the live origin so localhost and the
  // deployed domain each use their own.
  return `${window.location.origin}/auth/callback`;
}

/** Begin sign-in: store a state nonce, then navigate to the provider. */
export function startOAuth(provider: OAuthProvider): void {
  const spec = PROVIDERS[provider];
  if (!spec.clientId) throw new Error(`${provider} sign-in is not configured.`);

  // 32 bytes of CSPRNG, hex-encoded. Bound to this browser via
  // sessionStorage and checked on return, so a forged callback (login
  // CSRF) is rejected.
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const state = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

  sessionStorage.setItem(STATE_KEY, JSON.stringify({ state, provider }));

  const params = new URLSearchParams({
    client_id: spec.clientId,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: spec.scope,
    state,
    ...spec.extra,
  });
  window.location.assign(`${spec.authorizeUrl}?${params.toString()}`);
}

export interface OAuthCallback {
  provider: OAuthProvider;
  code: string;
  redirectUri: string;
}

/**
 * Read and validate the callback the provider redirected back with.
 * Throws with a user-facing message on any mismatch — a wrong or missing
 * state means the flow did not originate here and must be refused.
 */
export function readOAuthCallback(search: string): OAuthCallback {
  const params = new URLSearchParams(search);

  const providerError = params.get("error");
  if (providerError) {
    // e.g. the user clicked "Cancel" on the consent screen.
    throw new Error(
      providerError === "access_denied"
        ? "Sign-in was cancelled."
        : "The sign-in provider returned an error."
    );
  }

  const code = params.get("code");
  const returnedState = params.get("state");
  const stored = sessionStorage.getItem(STATE_KEY);
  sessionStorage.removeItem(STATE_KEY); // single use

  if (!code || !returnedState || !stored) {
    throw new Error("This sign-in link is incomplete. Please try again.");
  }

  let parsed: { state: string; provider: OAuthProvider };
  try {
    parsed = JSON.parse(stored);
  } catch {
    throw new Error("Could not verify the sign-in. Please try again.");
  }

  if (parsed.state !== returnedState) {
    // The state we issued is not the state that came back — reject.
    throw new Error("Sign-in verification failed. Please try again.");
  }

  return { provider: parsed.provider, code, redirectUri: redirectUri() };
}
