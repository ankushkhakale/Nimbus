"use client";

/**
 * Authentication state for the app.
 *
 * Two tokens with different jobs:
 *
 * - The **access token** lives in React state only — never localStorage
 *   or sessionStorage. Anything JavaScript can read, an XSS payload can
 *   read, and a stolen 24-hour token is a full account takeover.
 * - The **refresh token** lives in an httpOnly cookie, so it survives a
 *   reload but no script can touch it. On mount the app trades it for a
 *   fresh access token.
 *
 * That split is why reloading no longer signs you out, without putting a
 * long-lived credential anywhere a script can reach.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { ApiError, auth as authApi, User } from "./api";

/**
 * `restoring` is load-bearing. On first paint the app has no access
 * token yet but may well have a valid cookie, so anything that decides
 * "logged out" before the refresh resolves would bounce a signed-in user
 * to the login page on every reload.
 */
type Status = "restoring" | "unauthenticated" | "authenticating" | "authenticated";

interface AuthContextValue {
  user: User | null;
  token: string | null;
  status: Status;
  isAuthenticated: boolean;
  /** True until the initial refresh attempt has settled. */
  isRestoring: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, fullName: string, password: string) => Promise<void>;
  /** Finish an OAuth sign-in from the provider's code. */
  completeOAuth: (provider: string, code: string, redirectUri: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Overwrite the cached profile after Settings changes it server-side. */
  setUser: (user: User) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("restoring");

  // Restore a session from the refresh cookie on first load.
  useEffect(() => {
    let active = true;

    authApi
      .refresh()
      .then(async ({ access_token }) => {
        const profile = await authApi.me(access_token);
        if (!active) return;
        setToken(access_token);
        setUser(profile);
        setStatus("authenticated");
      })
      .catch(() => {
        // No cookie, expired, or revoked — all mean "not signed in".
        // Nothing to log: this is the normal path for a first visit.
        if (active) setStatus("unauthenticated");
      });

    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setStatus("authenticating");
    try {
      const { access_token } = await authApi.login(email, password);
      // Confirm the token works and fetch the profile before declaring
      // success, so the UI never shows a signed-in state it can't back up.
      const profile = await authApi.me(access_token);
      setToken(access_token);
      setUser(profile);
      setStatus("authenticated");
    } catch (error) {
      setToken(null);
      setUser(null);
      setStatus("unauthenticated");
      throw error;
    }
  }, []);

  const register = useCallback(
    async (email: string, fullName: string, password: string) => {
      await authApi.register(email, fullName, password);
      // Registration returns a profile, not a token; sign in to get one.
      await login(email, password);
    },
    [login]
  );

  const completeOAuth = useCallback(
    async (provider: string, code: string, redirectUri: string) => {
      setStatus("authenticating");
      try {
        const { access_token } = await authApi.oauthCallback(provider, code, redirectUri);
        const profile = await authApi.me(access_token);
        setToken(access_token);
        setUser(profile);
        setStatus("authenticated");
      } catch (error) {
        setToken(null);
        setUser(null);
        setStatus("unauthenticated");
        throw error;
      }
    },
    []
  );

  const logout = useCallback(async () => {
    // Clear locally first so the UI responds immediately even if the
    // network call is slow — but still call the server, because only it
    // can actually revoke the refresh token. Clearing the cookie alone
    // would leave a usable session on record.
    setToken(null);
    setUser(null);
    setStatus("unauthenticated");
    try {
      await authApi.logout();
    } catch {
      /* already signed out locally; nothing useful to surface */
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      status,
      isAuthenticated: status === "authenticated" && token !== null,
      isRestoring: status === "restoring",
      login,
      register,
      completeOAuth,
      logout,
      setUser,
    }),
    [user, token, status, login, register, completeOAuth, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === null) {
    throw new Error("useAuth must be used inside an <AuthProvider>.");
  }
  return context;
}

/** Turn an unknown thrown value into something worth showing a user. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong. Please try again.";
}
