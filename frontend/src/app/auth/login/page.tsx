"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Mail, Lock, ArrowRight } from 'lucide-react';

import { useAuth, errorMessage } from '@/lib/auth-context';
import { FormError } from '@/components/FormError';
import { OAuthButtons } from '@/components/OAuthButtons';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { login } = useAuth();
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      router.push('/dashboard');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-card animate-fade-in-up">
      <div style={{ textAlign: 'center', marginBottom: '32px' }}>
        <h1 style={{ fontSize: '32px', marginBottom: '8px' }}>Welcome back</h1>
        <p style={{ color: 'var(--text-med)', fontSize: '15px' }}>
          Enter your credentials to access your vault
        </p>
      </div>

      <form onSubmit={handleLogin}>
        <FormError message={error} />

        <div className="form-group">
          <label className="form-label" htmlFor="email">Email address</label>
          <div style={{ position: 'relative' }}>
            <Mail size={18} color="var(--text-low)" style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)' }} />
            <input 
              id="email"
              type="email" 
              className="form-input" 
              placeholder="name@example.com"
              style={{ paddingLeft: '44px' }}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="form-group" style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <label className="form-label" htmlFor="password" style={{ marginBottom: 0 }}>Password</label>
            <Link href="/auth/forgot-password" style={{ fontSize: '13px', color: 'var(--primary)', fontWeight: 500 }}>
              Forgot password?
            </Link>
          </div>
          <div style={{ position: 'relative' }}>
            <Lock size={18} color="var(--text-low)" style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)' }} />
            <input 
              id="password"
              type="password" 
              className="form-input" 
              placeholder="••••••••"
              style={{ paddingLeft: '44px' }}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
        </div>

        <button type="submit" className="btn-submit" disabled={submitting}>
          {submitting ? 'Signing in…' : (
            <>
              Sign In <ArrowRight size={18} style={{ marginLeft: '8px', verticalAlign: 'middle', display: 'inline-block' }} />
            </>
          )}
        </button>
      </form>

      <OAuthButtons verb="Sign in" />

      <div style={{ textAlign: 'center', marginTop: '24px', fontSize: '14px', color: 'var(--text-med)' }}>
        Don&apos;t have an account?{' '}
        <Link href="/auth/register" style={{ color: 'white', fontWeight: 600 }}>
          Create one now
        </Link>
      </div>
    </div>
  );
}
