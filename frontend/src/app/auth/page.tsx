'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const router = useRouter();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Simulate auth
    router.push('/dashboard');
  };

  return (
    <div style={{ 
      minHeight: '100vh', 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      justifyContent: 'center',
      padding: '20px'
    }}>
      
      {/* Back to Home */}
      <div style={{ position: 'absolute', top: '40px', left: '40px' }}>
        <Link href="/" className="animate-hover" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-med)', fontWeight: 500 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"></line>
            <polyline points="12 19 5 12 12 5"></polyline>
          </svg>
          Back to Home
        </Link>
      </div>

      {/* Auth Card */}
      <div className="glass-panel-elevated" style={{ 
        width: '100%', 
        maxWidth: '420px', 
        padding: '48px 40px', 
        borderRadius: 'var(--radius-xl)' 
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 20px var(--primary-hover)' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
            </svg>
          </div>
        </div>

        <h2 style={{ fontSize: '28px', fontWeight: 700, textAlign: 'center', marginBottom: '8px' }}>
          {isLogin ? 'Welcome back' : 'Create an account'}
        </h2>
        <p style={{ color: 'var(--text-med)', textAlign: 'center', marginBottom: '32px' }}>
          {isLogin ? 'Enter your details to access your vault.' : 'Start your secure cloud journey today.'}
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-med)' }}>Email</label>
            <input 
              type="email" 
              required
              placeholder="you@example.com"
              style={{
                width: '100%',
                background: 'rgba(0,0,0,0.2)',
                border: '1px solid var(--border-glow)',
                padding: '12px 16px',
                borderRadius: 'var(--radius-md)',
                color: 'var(--text-high)',
                outline: 'none',
                transition: 'border-color 0.2s',
              }}
              onFocus={(e) => e.target.style.borderColor = 'var(--primary)'}
              onBlur={(e) => e.target.style.borderColor = 'var(--border-glow)'}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-med)' }}>Password</label>
            <input 
              type="password" 
              required
              placeholder="••••••••"
              style={{
                width: '100%',
                background: 'rgba(0,0,0,0.2)',
                border: '1px solid var(--border-glow)',
                padding: '12px 16px',
                borderRadius: 'var(--radius-md)',
                color: 'var(--text-high)',
                outline: 'none',
                transition: 'border-color 0.2s',
              }}
              onFocus={(e) => e.target.style.borderColor = 'var(--primary)'}
              onBlur={(e) => e.target.style.borderColor = 'var(--border-glow)'}
            />
          </div>

          <button type="submit" className="animate-hover" style={{
            background: 'var(--primary)',
            color: 'var(--on-primary)',
            border: 'none',
            padding: '14px',
            borderRadius: 'var(--radius-md)',
            fontWeight: 600,
            fontSize: '16px',
            cursor: 'pointer',
            marginTop: '8px'
          }}>
            {isLogin ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <div style={{ margin: '24px 0', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ flex: 1, height: '1px', background: 'var(--border-glow)' }} />
          <span style={{ color: 'var(--text-med)', fontSize: '12px', fontWeight: 500 }}>OR</span>
          <div style={{ flex: 1, height: '1px', background: 'var(--border-glow)' }} />
        </div>

        <button className="glass-panel animate-hover" style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px',
          color: 'var(--text-high)',
          padding: '12px',
          borderRadius: 'var(--radius-md)',
          fontWeight: 600,
          cursor: 'pointer'
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12.545,10.239v3.821h5.445c-0.712,2.315-2.647,3.972-5.445,3.972c-3.332,0-6.033-2.701-6.033-6.032s2.701-6.032,6.033-6.032c1.498,0,2.866,0.549,3.921,1.453l2.814-2.814C17.503,2.988,15.139,2,12.545,2C7.021,2,2.543,6.477,2.543,12s4.478,10,10.002,10c8.396,0,10.249-7.85,9.426-11.748L12.545,10.239z"/>
          </svg>
          Continue with Google
        </button>

        <div style={{ textAlign: 'center', marginTop: '24px' }}>
          <button 
            onClick={() => setIsLogin(!isLogin)} 
            style={{ 
              background: 'none', 
              border: 'none', 
              color: 'var(--text-med)', 
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            {isLogin ? "Don't have an account? " : "Already have an account? "}
            <span style={{ color: 'var(--primary)', fontWeight: 600 }}>
              {isLogin ? 'Create one' : 'Sign in'}
            </span>
          </button>
        </div>

      </div>
    </div>
  );
}
