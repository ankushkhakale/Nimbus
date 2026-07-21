"use client";

/**
 * Authentication state for the app.
 *
 * The access token is held in React state only — never localStorage or
 * sessionStorage. Anything readable from JavaScript is readable by an
 * XSS payload, and a stolen 24-hour token is a full account takeover.
 *
 * The cost of that choice: a full page reload drops the token and the
 * user must sign in again. Fixing it properly means an httpOnly refresh
 * cookie issued by the backend (plus CSRF protection), which is
 * deliberately out of scope for the MVP — see requirements.md §5.
 */

import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

import { ApiError, auth as authApi, User } from "./api";

type Status = "unauthenticated" | "authenticating" | "authenticated";

interface AuthContextValue {
  user: User | null;
  token: string | null;
  status: Status;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, fullName: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("unauthenticated");

  const login = useCallback(async (email: string, password: string) => {
    setStatus("authenticating");
    try {
      const { access_token } = await authApi.login(email, password);
      // Confirm the token works and get the profile before declaring
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

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    setStatus("unauthenticated");
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      status,
      isAuthenticated: status === "authenticated" && token !== null,
      login,
      register,
      logout,
    }),
    [user, token, status, login, register, logout]
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
