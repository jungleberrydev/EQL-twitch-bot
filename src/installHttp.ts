import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import type { ChannelStore } from "./channels.js";
import { normalizeLogin } from "./channels.js";

export type InstallHttpConfig = {
  port: number;
  clientId: string;
  clientSecret: string;
  /** Full public callback URL registered with Twitch. */
  redirectUri: string;
  /** Where to send the browser after success/error (norrathroster.com/twitch-bot). */
  resultUrl: string;
};

export type ChannelActions = {
  join: (login: string) => Promise<"joined" | "already">;
  part: (login: string) => Promise<"left" | "absent">;
};

type PendingOAuth = {
  action: "install" | "remove";
  expiresAt: number;
};

const PENDING_TTL_MS = 10 * 60 * 1000;

function send(res: ServerResponse, status: number, body: string, contentType = "text/plain; charset=utf-8"): void {
  res.writeHead(status, { "Content-Type": contentType });
  res.end(body);
}

function redirect(res: ServerResponse, location: string): void {
  res.writeHead(302, { Location: location });
  res.end();
}

function readUrl(req: IncomingMessage, base = "http://localhost"): URL {
  return new URL(req.url ?? "/", base);
}

function resultRedirect(
  resultUrl: string,
  params: Record<string, string>,
): string {
  const url = new URL(resultUrl);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

async function exchangeCode(
  config: InstallHttpConfig,
  code: string,
): Promise<string> {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: config.redirectUri,
  });
  const tokenRes = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    throw new Error(`Twitch token exchange failed: ${tokenRes.status} ${text}`);
  }
  const json = (await tokenRes.json()) as { access_token?: string };
  if (!json.access_token) {
    throw new Error("Twitch token response missing access_token");
  }
  return json.access_token;
}

async function loginFromToken(
  config: InstallHttpConfig,
  accessToken: string,
): Promise<string> {
  const meRes = await fetch("https://api.twitch.tv/helix/users", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Client-Id": config.clientId,
    },
  });
  if (!meRes.ok) {
    throw new Error(`Twitch user fetch failed: ${meRes.status}`);
  }
  const json = (await meRes.json()) as {
    data?: Array<{ login?: string }>;
  };
  const login = json.data?.[0]?.login;
  if (!login) throw new Error("Twitch user response missing login");
  return normalizeLogin(login);
}

function twitchAuthorizeUrl(config: InstallHttpConfig, state: string): string {
  const url = new URL("https://id.twitch.tv/oauth2/authorize");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  // Helix /users with a user token returns the authed login (no special scopes).
  url.searchParams.set("state", state);
  url.searchParams.set("force_verify", "true");
  return url.toString();
}

/**
 * Small public HTTP surface (proxied via Caddy) for self-serve install/remove.
 * Paths are rooted at / (Caddy strips /api/twitch-bot prefix).
 */
export function startInstallHttp(
  config: InstallHttpConfig,
  store: ChannelStore,
  actions: ChannelActions,
): { close: () => Promise<void> } {
  const pending = new Map<string, PendingOAuth>();

  function prunePending(): void {
    const now = Date.now();
    for (const [key, value] of pending) {
      if (value.expiresAt <= now) pending.delete(key);
    }
  }

  const server = createServer((req, res) => {
    void handle(req, res);
  });

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const url = readUrl(req);
      const path = url.pathname.replace(/\/+$/, "") || "/";

      if (req.method === "GET" && path === "/health") {
        send(res, 200, "ok");
        return;
      }

      if (req.method === "GET" && path === "/status") {
        const channels = store.list();
        send(
          res,
          200,
          JSON.stringify({
            ok: true,
            channelCount: channels.length,
            channels,
          }),
          "application/json; charset=utf-8",
        );
        return;
      }

      if (req.method === "GET" && (path === "/install" || path === "/remove")) {
        prunePending();
        const action = path === "/remove" ? "remove" : "install";
        const state = randomBytes(16).toString("hex");
        pending.set(state, { action, expiresAt: Date.now() + PENDING_TTL_MS });
        redirect(res, twitchAuthorizeUrl(config, state));
        return;
      }

      if (req.method === "GET" && path === "/oauth/callback") {
        prunePending();
        const error = url.searchParams.get("error");
        if (error) {
          redirect(
            res,
            resultRedirect(config.resultUrl, {
              twitch: "denied",
            }),
          );
          return;
        }

        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const pendingOAuth = state ? pending.get(state) : undefined;
        if (state) pending.delete(state);

        if (!code || !state || !pendingOAuth) {
          redirect(
            res,
            resultRedirect(config.resultUrl, { twitch: "invalid" }),
          );
          return;
        }

        try {
          const accessToken = await exchangeCode(config, code);
          const login = await loginFromToken(config, accessToken);
          if (pendingOAuth.action === "remove") {
            const result = await actions.part(login);
            redirect(
              res,
              resultRedirect(config.resultUrl, {
                twitch: result === "left" ? "removed" : "absent",
                channel: login,
              }),
            );
            return;
          }
          const result = await actions.join(login);
          redirect(
            res,
            resultRedirect(config.resultUrl, {
              twitch: result === "joined" ? "added" : "already",
              channel: login,
            }),
          );
        } catch (err) {
          console.error("Twitch install OAuth failed:", err);
          redirect(
            res,
            resultRedirect(config.resultUrl, { twitch: "failed" }),
          );
        }
        return;
      }

      send(res, 404, "Not found");
    } catch (err) {
      console.error("Install HTTP error:", err);
      send(res, 500, "Internal error");
    }
  }

  server.listen(config.port, "0.0.0.0");
  console.log(`Install HTTP listening on 0.0.0.0:${config.port}`);

  return {
    close: () =>
      new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
