"use client";

import React, { useEffect } from 'react';
import Link from 'next/link';
import { 
  Cloud, Shield, Search, Zap, CheckCircle2, 
  ArrowRight, Smartphone, HardDrive, 
  Share2, ChevronRight, PlayCircle
} from 'lucide-react';

export default function LandingPage() {
  
  // Mouse tracking effect for glass cards
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      document.querySelectorAll('.glass-card').forEach((card) => {
        const rect = (card as HTMLElement).getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        (card as HTMLElement).style.setProperty('--mouse-x', `${x}px`);
        (card as HTMLElement).style.setProperty('--mouse-y', `${y}px`);
      });
    };
    
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', position: 'relative' }}>
      
      {/* Background Ambient Orbs */}
      <div style={{
        position: 'absolute', top: '-10%', left: '20%', width: '600px', height: '600px',
        background: 'radial-gradient(circle, rgba(99,102,241,0.15) 0%, rgba(0,0,0,0) 70%)',
        borderRadius: '50%', filter: 'blur(60px)', zIndex: -1, pointerEvents: 'none'
      }} className="animate-float"></div>
      
      <div style={{
        position: 'absolute', top: '40%', right: '-5%', width: '500px', height: '500px',
        background: 'radial-gradient(circle, rgba(236,72,153,0.1) 0%, rgba(0,0,0,0) 70%)',
        borderRadius: '50%', filter: 'blur(60px)', zIndex: -1, pointerEvents: 'none',
        animationDelay: '-3s'
      }} className="animate-float"></div>

      {/* Navbar */}
      <header style={{ 
        position: 'fixed', top: 0, left: 0, right: 0, height: 'var(--header-height)', 
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
        background: 'rgba(5, 8, 15, 0.7)', backdropFilter: 'blur(20px)',
        borderBottom: '1px solid var(--border-glow)'
      }}>
        <div className="container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ 
              width: '36px', height: '36px', borderRadius: '10px', 
              background: 'linear-gradient(135deg, var(--primary) 0%, var(--primary-hover) 100%)', 
              display: 'flex', alignItems: 'center', justifyContent: 'center', 
              boxShadow: '0 0 20px rgba(99,102,241,0.5)' 
            }}>
              <Cloud size={20} color="white" strokeWidth={2.5} />
            </div>
            <span style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.03em' }}>Nimbus</span>
          </Link>
          
          <nav style={{ display: 'flex', gap: '32px', alignItems: 'center' }}>
            <div style={{ display: 'none', gap: '32px' }} className="md-flex">
              <Link href="#features" style={{ color: 'var(--text-med)', fontWeight: 500, fontSize: '15px' }} className="hover-white">Features</Link>
              <Link href="#how-it-works" style={{ color: 'var(--text-med)', fontWeight: 500, fontSize: '15px' }} className="hover-white">How it Works</Link>
              <Link href="#pricing" style={{ color: 'var(--text-med)', fontWeight: 500, fontSize: '15px' }} className="hover-white">Pricing</Link>
            </div>
            
            <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
              <Link href="/auth/login" style={{ color: 'var(--text-high)', fontWeight: 600, fontSize: '15px' }}>Log in</Link>
              <Link href="/auth/register" className="btn-primary" style={{ padding: '10px 20px', fontSize: '15px' }}>
                Get Started
              </Link>
            </div>
          </nav>
        </div>
      </header>

      <main style={{ flex: 1, paddingTop: '160px', paddingBottom: '100px' }}>
        
        {/* Hero Section */}
        <section className="container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginBottom: '120px' }}>
          <div className="animate-fade-in-up" style={{ 
            display: 'inline-flex', alignItems: 'center', gap: '8px',
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
            padding: '6px 16px', borderRadius: 'var(--radius-full)',
            color: 'var(--text-high)', fontSize: '14px', fontWeight: 500, marginBottom: '32px',
            backdropFilter: 'blur(10px)'
          }}>
            <span style={{ display: 'flex', width: '8px', height: '8px', borderRadius: '50%', background: 'var(--tertiary)' }}></span>
            Nimbus v2.0 is now live in early access
            <ChevronRight size={14} style={{ color: 'var(--text-med)' }} />
          </div>
          
          <h1 className="animate-fade-in-up delay-100" style={{ fontSize: 'clamp(48px, 6vw, 72px)', maxWidth: '900px', marginBottom: '24px' }}>
            The intelligent home for your <br />
            <span className="gradient-text">entire digital life.</span>
          </h1>
          
          <p className="animate-fade-in-up delay-200" style={{ fontSize: 'clamp(18px, 2vw, 22px)', color: 'var(--text-med)', maxWidth: '650px', marginBottom: '48px', lineHeight: 1.6 }}>
            Store, organize, and retrieve your files instantly with AI. Total privacy through zero-knowledge encryption. Designed for humans.
          </p>
          
          <div className="animate-fade-in-up delay-300" style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', justifyContent: 'center' }}>
            <Link href="/auth" className="btn-primary" style={{ padding: '16px 36px', fontSize: '18px' }}>
              Start for free
              <ArrowRight size={20} />
            </Link>
            <Link href="#demo" className="btn-secondary" style={{ padding: '16px 36px', fontSize: '18px' }}>
              <PlayCircle size={20} />
              View Demo
            </Link>
          </div>
          
          {/* Dashboard Preview Mockup */}
          <div className="animate-fade-in-up delay-300" style={{ 
            marginTop: '80px', width: '100%', maxWidth: '1000px', 
            height: '500px', background: 'var(--surface-0)', 
            borderRadius: 'var(--radius-xl)', border: '1px solid rgba(255,255,255,0.05)',
            boxShadow: '0 30px 60px -10px rgba(0,0,0,0.8), 0 0 40px rgba(99,102,241,0.15)',
            position: 'relative', overflow: 'hidden'
          }}>
            {/* Mockup Window Header */}
            <div style={{ height: '40px', background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', padding: '0 20px', gap: '8px' }}>
              <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#ef4444' }}></div>
              <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#eab308' }}></div>
              <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#22c55e' }}></div>
            </div>
            {/* Mockup Body Content */}
            <div style={{ display: 'flex', height: 'calc(100% - 40px)' }}>
              <div style={{ width: '220px', borderRight: '1px solid rgba(255,255,255,0.05)', padding: '20px' }}>
                <div style={{ height: '30px', background: 'rgba(255,255,255,0.05)', borderRadius: '6px', marginBottom: '20px' }}></div>
                <div style={{ height: '20px', background: 'rgba(255,255,255,0.03)', borderRadius: '4px', marginBottom: '12px', width: '80%' }}></div>
                <div style={{ height: '20px', background: 'rgba(255,255,255,0.03)', borderRadius: '4px', marginBottom: '12px', width: '90%' }}></div>
                <div style={{ height: '20px', background: 'rgba(255,255,255,0.03)', borderRadius: '4px', marginBottom: '12px', width: '70%' }}></div>
              </div>
              <div style={{ flex: 1, padding: '30px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ display: 'flex', gap: '20px' }}>
                  <div style={{ flex: 2, height: '180px', background: 'rgba(99,102,241,0.05)', borderRadius: '12px', border: '1px solid rgba(99,102,241,0.1)' }}></div>
                  <div style={{ flex: 1, height: '180px', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}></div>
                </div>
                <div style={{ flex: 1, background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}></div>
              </div>
            </div>
            {/* Gradient overlay for blending */}
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '200px', background: 'linear-gradient(to bottom, transparent, var(--bg-deep))', pointerEvents: 'none' }}></div>
          </div>
        </section>

        {/* Social Proof */}
        <section className="container" style={{ marginBottom: '120px', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-low)', fontSize: '14px', textTransform: 'uppercase', letterSpacing: '2px', fontWeight: 600, marginBottom: '32px' }}>
            Trusted by teams at innovative companies
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '48px', flexWrap: 'wrap', opacity: 0.5, filter: 'grayscale(1)' }}>
            {/* Replace with actual logos in production */}
            <h3 style={{ fontSize: '24px', fontWeight: 700 }}>ACME Corp</h3>
            <h3 style={{ fontSize: '24px', fontWeight: 700 }}>Globex</h3>
            <h3 style={{ fontSize: '24px', fontWeight: 700 }}>Soylent</h3>
            <h3 style={{ fontSize: '24px', fontWeight: 700 }}>Initech</h3>
            <h3 style={{ fontSize: '24px', fontWeight: 700 }}>Umbrella</h3>
          </div>
        </section>

        {/* Bento Grid Features */}
        <section id="features" className="container" style={{ marginBottom: '160px' }}>
          <div style={{ textAlign: 'center', marginBottom: '64px' }}>
            <h2 style={{ fontSize: '48px', marginBottom: '16px' }}>Everything you need. <span className="gradient-text-alt">Nothing you don&apos;t.</span></h2>
            <p style={{ fontSize: '20px', color: 'var(--text-med)', maxWidth: '600px', margin: '0 auto' }}>
              We rebuilt cloud storage from the ground up to be smart, secure, and incredibly fast.
            </p>
          </div>

          <div className="bento-grid">
            {/* Feature 1 (Large) */}
            <div className="glass-card" style={{ gridColumn: 'span 8', padding: '48px', minHeight: '360px', display: 'flex', flexDirection: 'column' }}>
              <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: 'rgba(99,102,241,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '24px', border: '1px solid rgba(99,102,241,0.2)' }}>
                <Search size={28} color="var(--primary)" />
              </div>
              <h3 style={{ fontSize: '32px', marginBottom: '16px' }}>Semantic AI Search</h3>
              <p style={{ fontSize: '18px', color: 'var(--text-med)', maxWidth: '80%' }}>
                Don&apos;t remember the file name? Just describe what&apos;s inside it or what it looks like. Our embedded AI understands context and finds your files instantly.
              </p>
              <div style={{ marginTop: 'auto', alignSelf: 'flex-end', width: '80%', height: '100px', background: 'rgba(0,0,0,0.2)', borderRadius: '12px 12px 0 0', border: '1px solid rgba(255,255,255,0.05)', borderBottom: 'none' }}></div>
            </div>

            {/* Feature 2 (Medium) */}
            <div className="glass-card" style={{ gridColumn: 'span 4', padding: '48px', minHeight: '360px' }}>
              <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: 'rgba(20,184,166,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '24px', border: '1px solid rgba(20,184,166,0.2)' }}>
                <Shield size={28} color="var(--tertiary)" />
              </div>
              <h3 style={{ fontSize: '28px', marginBottom: '16px' }}>Zero-Knowledge</h3>
              <p style={{ fontSize: '16px', color: 'var(--text-med)' }}>
                Your data is encrypted locally before transmission. We never see your files, your keys, or your passwords. Total absolute privacy.
              </p>
            </div>

            {/* Feature 3 (Medium) */}
            <div className="glass-card" style={{ gridColumn: 'span 4', padding: '48px', minHeight: '360px' }}>
              <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: 'rgba(236,72,153,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '24px', border: '1px solid rgba(236,72,153,0.2)' }}>
                <Zap size={28} color="var(--secondary)" />
              </div>
              <h3 style={{ fontSize: '28px', marginBottom: '16px' }}>Blazing Fast</h3>
              <p style={{ fontSize: '16px', color: 'var(--text-med)' }}>
                Built on a modern edge network. Your files sync instantly across all devices, anywhere in the world.
              </p>
            </div>

            {/* Feature 4 (Large) */}
            <div className="glass-card" style={{ gridColumn: 'span 8', padding: '48px', minHeight: '360px', display: 'flex', flexDirection: 'column' }}>
              <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '24px', border: '1px solid rgba(255,255,255,0.1)' }}>
                <Share2 size={28} color="white" />
              </div>
              <h3 style={{ fontSize: '32px', marginBottom: '16px' }}>Secure Collaboration</h3>
              <p style={{ fontSize: '18px', color: 'var(--text-med)', maxWidth: '80%' }}>
                Generate expiring, password-protected links. Share folders with granular permissions, and track who accesses your data in real-time.
              </p>
              <div style={{ marginTop: 'auto', display: 'flex', gap: '12px' }}>
                <div style={{ padding: '12px 24px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)', fontSize: '14px' }}>project_assets.zip</div>
                <div style={{ padding: '12px 24px', background: 'rgba(99,102,241,0.2)', color: 'var(--primary)', borderRadius: '8px', border: '1px dashed var(--primary)', fontSize: '14px', fontWeight: 600 }}>Create Share Link</div>
              </div>
            </div>
          </div>
        </section>

        {/* How it Works Step-by-Step */}
        <section id="how-it-works" className="container" style={{ marginBottom: '160px' }}>
          <div style={{ textAlign: 'center', marginBottom: '80px' }}>
            <h2 style={{ fontSize: '48px', marginBottom: '16px' }}>How Nimbus Works</h2>
            <p style={{ fontSize: '20px', color: 'var(--text-med)' }}>Simplicity on the outside, advanced tech on the inside.</p>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '40px', maxWidth: '800px', margin: '0 auto', position: 'relative' }}>
            
            <div style={{ position: 'absolute', left: '28px', top: '40px', bottom: '40px', width: '2px', background: 'rgba(255,255,255,0.05)' }}></div>

            {[
              { title: "Upload & Encrypt", desc: "Drag and drop any file. We encrypt it locally in your browser using AES-256 before it ever touches our servers.", icon: <HardDrive /> },
              { title: "AI Analysis", desc: "Our on-device models generate semantic embeddings of your documents and images, keeping metadata private while enabling smart search.", icon: <Zap /> },
              { title: "Global Sync", desc: "Your encrypted chunks are distributed across edge nodes, ready to be instantly fetched by your authenticated devices.", icon: <Cloud /> },
              { title: "Access Anywhere", desc: "Log in from mobile, desktop, or web. Your private key decrypts the files seamlessly on the fly.", icon: <Smartphone /> }
            ].map((step, i) => (
              <div key={i} style={{ display: 'flex', gap: '32px', alignItems: 'flex-start' }}>
                <div style={{ width: '56px', height: '56px', minWidth: '56px', borderRadius: '50%', background: 'var(--bg-deep)', border: '2px solid var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10 }}>
                  <div style={{ color: 'var(--primary)' }}>{step.icon}</div>
                </div>
                <div className="glass-card" style={{ padding: '32px', flex: 1 }}>
                  <h3 style={{ fontSize: '24px', marginBottom: '12px' }}>{i+1}. {step.title}</h3>
                  <p style={{ fontSize: '16px', color: 'var(--text-med)', lineHeight: 1.6 }}>{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* CTA Section */}
        <section className="container" style={{ marginBottom: '80px' }}>
          <div style={{ 
            background: 'linear-gradient(135deg, rgba(99,102,241,0.2) 0%, rgba(236,72,153,0.1) 100%)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 'var(--radius-xl)',
            padding: '80px 40px',
            textAlign: 'center',
            position: 'relative',
            overflow: 'hidden'
          }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'radial-gradient(circle at 50% 0%, rgba(99,102,241,0.3), transparent 70%)', pointerEvents: 'none' }}></div>
            
            <h2 style={{ fontSize: '48px', marginBottom: '24px', position: 'relative', zIndex: 1 }}>Ready to take back your data?</h2>
            <p style={{ fontSize: '20px', color: 'var(--text-med)', maxWidth: '600px', margin: '0 auto 40px auto', position: 'relative', zIndex: 1 }}>
              Join thousands of users who have already switched to a smarter, more private cloud. Get 10GB free forever.
            </p>
            
            <div style={{ position: 'relative', zIndex: 1 }}>
              <Link href="/auth/register" className="btn-primary" style={{ padding: '18px 48px', fontSize: '18px' }}>
                Create Free Account
              </Link>
            </div>
            
            <p style={{ marginTop: '24px', fontSize: '14px', color: 'var(--text-low)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', position: 'relative', zIndex: 1 }}>
              <CheckCircle2 size={16} /> No credit card required. Cancel anytime.
            </p>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid var(--border-glow)', background: 'var(--surface-0)', padding: '80px 0 40px 0' }}>
        <div className="container">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '48px', marginBottom: '64px' }}>
            <div style={{ gridColumn: 'span 2' }}>
              <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                <Cloud size={24} color="var(--primary)" />
                <span style={{ fontSize: '24px', fontWeight: 800 }}>Nimbus</span>
              </Link>
              <p style={{ color: 'var(--text-med)', maxWidth: '300px', fontSize: '15px' }}>
                The intelligent, private cloud storage platform built for the future.
              </p>
            </div>
            
            <div>
              <h4 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '20px' }}>Product</h4>
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <li><Link href="#" style={{ color: 'var(--text-med)', fontSize: '15px' }}>Features</Link></li>
                <li><Link href="#" style={{ color: 'var(--text-med)', fontSize: '15px' }}>Pricing</Link></li>
                <li><Link href="#" style={{ color: 'var(--text-med)', fontSize: '15px' }}>Download App</Link></li>
                <li><Link href="#" style={{ color: 'var(--text-med)', fontSize: '15px' }}>Changelog</Link></li>
              </ul>
            </div>
            
            <div>
              <h4 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '20px' }}>Company</h4>
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <li><Link href="#" style={{ color: 'var(--text-med)', fontSize: '15px' }}>About</Link></li>
                <li><Link href="#" style={{ color: 'var(--text-med)', fontSize: '15px' }}>Blog</Link></li>
                <li><Link href="#" style={{ color: 'var(--text-med)', fontSize: '15px' }}>Careers</Link></li>
                <li><Link href="#" style={{ color: 'var(--text-med)', fontSize: '15px' }}>Contact</Link></li>
              </ul>
            </div>
            
            <div>
              <h4 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '20px' }}>Legal</h4>
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <li><Link href="#" style={{ color: 'var(--text-med)', fontSize: '15px' }}>Privacy Policy</Link></li>
                <li><Link href="#" style={{ color: 'var(--text-med)', fontSize: '15px' }}>Terms of Service</Link></li>
                <li><Link href="#" style={{ color: 'var(--text-med)', fontSize: '15px' }}>Security</Link></li>
              </ul>
            </div>
          </div>
          
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-low)', fontSize: '14px' }}>
            <p>© 2026 Nimbus Cloud Inc. All rights reserved.</p>
            <div style={{ display: 'flex', gap: '16px' }}>
              <span>X (Twitter)</span>
              <span>GitHub</span>
              <span>Discord</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
