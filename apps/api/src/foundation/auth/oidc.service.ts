import { Injectable, type OnModuleInit } from "@nestjs/common";
import { Issuer, generators, type Client, type TokenSet } from "openid-client";
import { ConfigService } from "../config/config.service.js";

export interface AuthRequest {
  url: string;
  state: string;
  codeVerifier: string;
}

/**
 * OIDC relying-party using openid-client. Wraps discovery, the Authorization-Code
 * + PKCE flow, and refresh. Discovery is lazy + retried so a briefly-unavailable IdP
 * doesn't block API boot.
 */
@Injectable()
export class OidcService implements OnModuleInit {
  private client?: Client;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.ensureClient();
    } catch {
      // IdP not reachable at boot — will retry on first auth request.
    }
  }

  private async ensureClient(): Promise<Client> {
    if (this.client) return this.client;
    const issuer = await Issuer.discover(this.config.get("OIDC_ISSUER"));
    this.client = new issuer.Client({
      client_id: this.config.get("OIDC_CLIENT_ID"),
      client_secret: this.config.get("OIDC_CLIENT_SECRET"),
      redirect_uris: [this.config.get("OIDC_REDIRECT_URI")],
      response_types: ["code"],
    });
    return this.client;
  }

  /** Build the IdP authorization URL with PKCE + state to store in the session. */
  async createAuthRequest(): Promise<AuthRequest> {
    const client = await this.ensureClient();
    const state = generators.state();
    const codeVerifier = generators.codeVerifier();
    const codeChallenge = generators.codeChallenge(codeVerifier);
    const url = client.authorizationUrl({
      scope: this.config.get("OIDC_SCOPES"),
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    });
    return { url, state, codeVerifier };
  }

  /** Exchange the authorization code for tokens, validating state + PKCE. */
  async handleCallback(
    params: Record<string, string | undefined>,
    state: string,
    codeVerifier: string,
  ): Promise<TokenSet> {
    const client = await this.ensureClient();
    return client.callback(this.config.get("OIDC_REDIRECT_URI"), params, {
      state,
      code_verifier: codeVerifier,
    });
  }

  /** Renew tokens with a refresh token. */
  async refresh(refreshToken: string): Promise<TokenSet> {
    const client = await this.ensureClient();
    return client.refresh(refreshToken);
  }
}
