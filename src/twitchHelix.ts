/** Twitch Helix helpers using an app access token (client credentials). */

export type HelixCredentials = {
  clientId: string;
  clientSecret: string;
};

type CachedToken = {
  accessToken: string;
  /** Refresh a bit before expiry. */
  expiresAtMs: number;
};

const TOKEN_SKEW_MS = 60_000;

let cached: CachedToken | null = null;

export async function getAppAccessToken(
  creds: HelixCredentials,
): Promise<string> {
  const now = Date.now();
  if (cached && cached.expiresAtMs > now + TOKEN_SKEW_MS) {
    return cached.accessToken;
  }

  const body = new URLSearchParams({
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    grant_type: "client_credentials",
  });
  const tokenRes = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    throw new Error(
      `Twitch app token failed: ${tokenRes.status} ${text}`,
    );
  }
  const json = (await tokenRes.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!json.access_token) {
    throw new Error("Twitch app token response missing access_token");
  }
  const expiresInSec = json.expires_in ?? 3600;
  cached = {
    accessToken: json.access_token,
    expiresAtMs: now + expiresInSec * 1000,
  };
  return cached.accessToken;
}

/** Clear cached token (tests / forced refresh). */
export function clearAppAccessTokenCache(): void {
  cached = null;
}

/**
 * Return the subset of `logins` that are currently live on Twitch.
 * Helix allows up to 100 `user_login` query params per request.
 */
export async function fetchLiveLogins(
  creds: HelixCredentials,
  logins: string[],
): Promise<Set<string>> {
  const live = new Set<string>();
  const unique = [
    ...new Set(logins.map((l) => l.trim().toLowerCase()).filter(Boolean)),
  ];
  if (unique.length === 0) return live;

  const accessToken = await getAppAccessToken(creds);
  const chunkSize = 100;

  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    const url = new URL("https://api.twitch.tv/helix/streams");
    for (const login of chunk) {
      url.searchParams.append("user_login", login);
    }
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Client-Id": creds.clientId,
      },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Helix streams failed: ${res.status} ${text}`);
    }
    const json = (await res.json()) as {
      data?: Array<{ user_login?: string }>;
    };
    for (const stream of json.data ?? []) {
      const login = stream.user_login?.toLowerCase();
      if (login) live.add(login);
    }
  }

  return live;
}
