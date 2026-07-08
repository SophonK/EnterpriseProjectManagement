import { Controller, Get, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { AppError, type DomainEvent } from "@epm/shared";
import { Public } from "./decorators.js";
import { OidcService } from "./oidc.service.js";
import { InProcessEventBus } from "../events/event-bus.js";

const TEN_MIN = 10 * 60 * 1000;

@Controller("auth")
export class AuthController {
  constructor(
    private readonly oidc: OidcService,
    private readonly bus: InProcessEventBus,
  ) {}

  /** Start the OIDC flow — redirect to the IdP with PKCE + state stored in cookies. */
  @Public()
  @Get("login")
  async login(@Res() res: Response): Promise<void> {
    const { url, state, codeVerifier } = await this.oidc.createAuthRequest();
    setCookie(res, "epm_state", state, TEN_MIN);
    setCookie(res, "epm_verifier", codeVerifier, TEN_MIN);
    res.redirect(url);
  }

  /** IdP redirect target — exchange the code for tokens and set session cookies. */
  @Public()
  @Get("callback")
  async callback(@Req() req: Request, @Res() res: Response): Promise<void> {
    const state = req.cookies?.epm_state as string | undefined;
    const codeVerifier = req.cookies?.epm_verifier as string | undefined;
    if (!state || !codeVerifier) throw AppError.unauthenticated("missing auth state");

    const tokens = await this.oidc.handleCallback(
      req.query as Record<string, string | undefined>,
      state,
      codeVerifier,
    );
    res.clearCookie("epm_state");
    res.clearCookie("epm_verifier");
    setSessionCookies(res, tokens.access_token, tokens.refresh_token);

    // Announce a successful login so units (identity-access) can JIT-provision the user.
    await this.publishLogin(tokens.claims());

    res.redirect("/");
  }

  private async publishLogin(claims: {
    sub: string;
    email?: unknown;
    name?: unknown;
  }): Promise<void> {
    const event: DomainEvent<{ subject: string; email: string | null; name: string | null }> = {
      eventId: randomUUID(),
      eventType: "auth.login.succeeded",
      occurredAt: new Date().toISOString(),
      source: "foundation",
      data: {
        subject: claims.sub,
        email: typeof claims.email === "string" ? claims.email : null,
        name: typeof claims.name === "string" ? claims.name : null,
      },
    };
    await this.bus.publish(event);
  }

  /** Renew the access token from the refresh cookie. */
  @Public()
  @Post("refresh")
  async refresh(@Req() req: Request, @Res() res: Response): Promise<void> {
    const refreshToken = req.cookies?.epm_refresh as string | undefined;
    if (!refreshToken) throw AppError.unauthenticated("no refresh token");
    const tokens = await this.oidc.refresh(refreshToken);
    setSessionCookies(res, tokens.access_token, tokens.refresh_token);
    res.json({ expiresIn: tokens.expires_in ?? null });
  }

  /** Clear the session. */
  @Public()
  @Post("logout")
  logout(@Res() res: Response): void {
    res.clearCookie("epm_access");
    res.clearCookie("epm_refresh");
    res.status(204).send();
  }
}

function setCookie(res: Response, name: string, value: string, maxAge: number): void {
  res.cookie(name, value, { httpOnly: true, secure: true, sameSite: "lax", maxAge });
}

function setSessionCookies(res: Response, access?: string, refresh?: string): void {
  if (access) setCookie(res, "epm_access", access, TEN_MIN);
  if (refresh) setCookie(res, "epm_refresh", refresh, 30 * 24 * 60 * 60 * 1000);
}
