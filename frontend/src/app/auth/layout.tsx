import React from 'react';
import Link from 'next/link';
import { Cloud } from 'lucide-react';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="auth-container">
      {/* Background Ambient Orbs for Auth */}
      <div style={{
        position: 'absolute', top: '10%', left: '10%', width: '400px', height: '400px',
        background: 'radial-gradient(circle, rgba(99,102,241,0.15) 0%, rgba(0,0,0,0) 70%)',
        borderRadius: '50%', filter: 'blur(50px)', zIndex: 0, pointerEvents: 'none'
      }}></div>
      <div style={{
        position: 'absolute', bottom: '10%', right: '10%', width: '500px', height: '500px',
        background: 'radial-gradient(circle, rgba(236,72,153,0.1) 0%, rgba(0,0,0,0) 70%)',
        borderRadius: '50%', filter: 'blur(60px)', zIndex: 0, pointerEvents: 'none'
      }}></div>

      {/* Auth Content */}
      <div style={{ position: 'relative', zIndex: 10, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px' }}>
        
        {/* Simple Logo Header */}
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '40px' }} className="animate-fade-in-up">
          <div style={{ 
            width: '32px', height: '32px', borderRadius: '8px', 
            background: 'linear-gradient(135deg, var(--primary) 0%, var(--primary-hover) 100%)', 
            display: 'flex', alignItems: 'center', justifyContent: 'center', 
            boxShadow: '0 0 20px rgba(99,102,241,0.5)' 
          }}>
            <Cloud size={18} color="white" strokeWidth={2.5} />
          </div>
          <span style={{ fontSize: '24px', fontWeight: 800, letterSpacing: '-0.03em' }}>Nimbus</span>
        </Link>

        {children}

      </div>
    </div>
  );
}
