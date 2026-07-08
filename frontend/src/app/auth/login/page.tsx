"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { Mail, Lock, ArrowRight, Github } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: Connect to FastAPI backend for login
    console.log('Logging in with:', email);
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

        <button type="submit" className="btn-submit">
          Sign In <ArrowRight size={18} style={{ marginLeft: '8px', verticalAlign: 'middle', display: 'inline-block' }} />
        </button>
      </form>

      <div className="auth-divider">or continue with</div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <button type="button" className="btn-oauth">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Sign in with Google
        </button>
        
        <button type="button" className="btn-oauth">
          <Github size={20} />
          Sign in with GitHub
        </button>
      </div>

      <div style={{ textAlign: 'center', marginTop: '24px', fontSize: '14px', color: 'var(--text-med)' }}>
        Don't have an account?{' '}
        <Link href="/auth/register" style={{ color: 'white', fontWeight: 600 }}>
          Create one now
        </Link>
      </div>
    </div>
  );
}
