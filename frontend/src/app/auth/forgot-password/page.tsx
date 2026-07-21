"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { Mail, ArrowLeft, Send } from 'lucide-react';

import { auth } from '@/lib/api';
import { errorMessage } from '@/lib/auth-context';
import { FormError } from '@/components/FormError';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await auth.forgotPassword(email);
      // The API answers identically whether or not the address is
      // registered, so this confirmation reveals nothing either way.
      setIsSubmitted(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-card animate-fade-in-up">
      <div style={{ textAlign: 'center', marginBottom: '32px' }}>
        <h1 style={{ fontSize: '32px', marginBottom: '8px' }}>Reset Password</h1>
        <p style={{ color: 'var(--text-med)', fontSize: '15px' }}>
          Enter your email and we&apos;ll send you a recovery link
        </p>
      </div>

      {!isSubmitted ? (
        <form onSubmit={handleResetPassword}>
          <FormError message={error} />
          <div className="form-group" style={{ marginBottom: '32px' }}>
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

          <button type="submit" className="btn-submit" disabled={submitting}>
            {submitting ? 'Sending…' : <>Send Recovery Link <Send size={16} style={{ marginLeft: '8px', verticalAlign: 'middle', display: 'inline-block' }} /></>}
          </button>
        </form>
      ) : (
        <div style={{ textAlign: 'center', padding: '16px 0' }}>
          <div style={{ 
            width: '64px', height: '64px', borderRadius: '50%', 
            background: 'rgba(20,184,166,0.1)', 
            display: 'flex', alignItems: 'center', justifyContent: 'center', 
            margin: '0 auto 24px auto', border: '1px solid rgba(20,184,166,0.2)' 
          }}>
            <Mail size={32} color="var(--tertiary)" />
          </div>
          <h3 style={{ fontSize: '20px', marginBottom: '12px' }}>Check your inbox</h3>
          <p style={{ color: 'var(--text-med)', fontSize: '15px', marginBottom: '32px' }}>
            If an account exists for <strong>{email}</strong>, we have sent a password recovery link.
          </p>
        </div>
      )}

      <div style={{ textAlign: 'center', marginTop: '32px' }}>
        <Link href="/auth/login" style={{ display: 'inline-flex', alignItems: 'center', color: 'var(--text-med)', fontSize: '14px', fontWeight: 500, transition: 'color 0.2s ease' }} className="hover-white">
          <ArrowLeft size={16} style={{ marginRight: '8px' }} />
          Back to Login
        </Link>
      </div>
    </div>
  );
}
