import React from 'react';
import Link from 'next/link';

export default function LandingPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', overflowX: 'hidden' }}>
      
      {/* Navbar */}
      <header style={{ 
        position: 'fixed', 
        top: 0, 
        left: 0, 
        right: 0, 
        height: 'var(--header-height)', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between', 
        padding: '0 40px', 
        zIndex: 100,
        background: 'rgba(11, 14, 20, 0.6)',
        backdropFilter: 'blur(24px)',
        borderBottom: '1px solid var(--border-glow)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 15px var(--primary-hover)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
            </svg>
          </div>
          <h1 style={{ fontSize: '20px', margin: 0, fontWeight: 700 }}>Nimbus</h1>
        </div>
        
        <nav style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
          <Link href="#features" className="animate-hover" style={{ color: 'var(--text-med)', fontWeight: 500 }}>Features</Link>
          <Link href="#security" className="animate-hover" style={{ color: 'var(--text-med)', fontWeight: 500 }}>Security</Link>
          <Link href="/auth" className="animate-hover" style={{ color: 'var(--text-high)', fontWeight: 600 }}>Sign In</Link>
          <Link href="/auth" className="animate-hover" style={{
            background: 'var(--primary)',
            color: 'white',
            padding: '8px 20px',
            borderRadius: 'var(--radius-sm)',
            fontWeight: 600,
            boxShadow: '0 0 15px rgba(99, 102, 241, 0.4)'
          }}>
            Get Started
          </Link>
        </nav>
      </header>

      {/* Hero Section */}
      <main style={{ flex: 1, paddingTop: '120px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
        
        <div style={{ maxWidth: '800px', padding: '40px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ 
            background: 'rgba(99, 102, 241, 0.1)', 
            border: '1px solid rgba(99, 102, 241, 0.3)',
            padding: '6px 16px',
            borderRadius: '24px',
            color: 'var(--primary)',
            fontWeight: 600,
            fontSize: '14px',
            marginBottom: '24px'
          }}>
            Welcome to the future of personal storage
          </div>
          
          <h1 style={{ fontSize: '64px', lineHeight: '1.1', marginBottom: '24px', letterSpacing: '-0.03em' }}>
            Your Digital Vault,<br />
            <span style={{ 
              background: 'linear-gradient(90deg, #c0c1ff 0%, #6366f1 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent'
            }}>Reimagined by AI.</span>
          </h1>
          
          <p style={{ fontSize: '20px', color: 'var(--text-med)', maxWidth: '600px', marginBottom: '40px' }}>
            Store, organize, and interact with your files and photos using advanced AI. 
            Private by design, beautiful by nature.
          </p>

          <div style={{ display: 'flex', gap: '16px' }}>
            <Link href="/auth" className="animate-hover" style={{
              background: 'var(--primary)',
              color: 'white',
              padding: '16px 32px',
              borderRadius: 'var(--radius-md)',
              fontWeight: 600,
              fontSize: '18px',
              boxShadow: '0 0 30px rgba(99, 102, 241, 0.3)',
              border: '1px solid rgba(255,255,255,0.1)'
            }}>
              Start for Free
            </Link>
            <Link href="#features" className="glass-panel animate-hover" style={{
              color: 'var(--text-high)',
              padding: '16px 32px',
              borderRadius: 'var(--radius-md)',
              fontWeight: 600,
              fontSize: '18px',
            }}>
              Explore Features
            </Link>
          </div>
        </div>

        {/* Feature Highlights */}
        <section id="features" style={{ width: '100%', maxWidth: '1200px', padding: '80px 20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '32px' }}>
          
          {[
            {
              icon: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>,
              title: "Zero-Knowledge Privacy",
              desc: "Your data is encrypted before it leaves your device. Only you hold the keys."
            },
            {
              icon: <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>,
              title: "AI-Powered Organization",
              desc: "Nimbus automatically tags, categorizes, and searches the content inside your files and photos."
            },
            {
              icon: <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>,
              title: "Lightning Fast Sync",
              desc: "Changes propagate across all your devices instantly with our global edge network."
            }
          ].map((feature, idx) => (
            <div key={idx} className="glass-panel-elevated animate-hover" style={{ padding: '40px 32px', borderRadius: 'var(--radius-xl)' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(99, 102, 241, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '24px' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  {feature.icon}
                </svg>
              </div>
              <h3 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '12px' }}>{feature.title}</h3>
              <p style={{ color: 'var(--text-med)', lineHeight: '1.6' }}>{feature.desc}</p>
            </div>
          ))}
          
        </section>
      </main>

    </div>
  );
}
