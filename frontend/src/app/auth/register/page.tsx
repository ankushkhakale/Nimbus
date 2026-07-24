"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Mail, Lock, User, ArrowRight } from 'lucide-react';

import { useAuth, errorMessage } from '@/lib/auth-context';
import { FormError } from '@/components/FormError';
import { OAuthButtons } from '@/components/OAuthButtons';

// Mirrors the backend's own rule: bcrypt cannot hash more than 72 bytes,
// so the API rejects anything longer.
const MIN_PASSWORD = 8;
const MAX_PASSWORD = 72;

export default function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { register } = useAuth();
  const router = useRouter();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Checked here too so the user gets the message instantly rather
    // than after a round trip.
    if (password.length < MIN_PASSWORD) {
      setError(`Password must be at least ${MIN_PASSWORD} characters.`);
      return;
    }
    if (new TextEncoder().encode(password).length > MAX_PASSWORD) {
      setError(`Password must be at most ${MAX_PASSWORD} bytes.`);
      return;
    }

    setSubmitting(true);
    try {
      await register(email, name, password);
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
        <h1 style={{ fontSize: '32px', marginBottom: '8px' }}>Create an account</h1>
        <p style={{ color: 'var(--text-med)', fontSize: '15px' }}>
          Start securing your digital life today
        </p>
      </div>

      <form onSubmit={handleRegister}>
        <FormError message={error} />
        <div className="form-group">
          <label className="form-label" htmlFor="name">Full name</label>
          <div style={{ position: 'relative' }}>
            <User size={18} color="var(--text-low)" style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)' }} />
            <input 
              id="name"
              type="text" 
              className="form-input" 
              placeholder="John Doe"
              style={{ paddingLeft: '44px' }}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
        </div>

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

        <div className="form-group" style={{ marginBottom: '24px' }}>
          <label className="form-label" htmlFor="password">Password</label>
          <div style={{ position: 'relative', marginBottom: '12px' }}>
            <Lock size={18} color="var(--text-low)" style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)' }} />
            <input 
              id="password"
              type="password" 
              className="form-input" 
              placeholder="Create a strong password"
              style={{ paddingLeft: '44px' }}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {/* Simple password hint */}
          <div style={{ fontSize: '12px', color: 'var(--text-low)' }}>
            Must be at least 8 characters long and contain a number or symbol.
          </div>
        </div>

        <button type="submit" className="btn-submit" disabled={submitting}>
          {submitting ? 'Creating account…' : (
            <>
              Create Account <ArrowRight size={18} style={{ marginLeft: '8px', verticalAlign: 'middle', display: 'inline-block' }} />
            </>
          )}
        </button>
      </form>

      <OAuthButtons verb="Sign up" />

      <div style={{ textAlign: 'center', marginTop: '24px', fontSize: '14px', color: 'var(--text-med)' }}>
        Already have an account?{' '}
        <Link href="/auth/login" style={{ color: 'white', fontWeight: 600 }}>
          Sign in
        </Link>
      </div>
    </div>
  );
}
