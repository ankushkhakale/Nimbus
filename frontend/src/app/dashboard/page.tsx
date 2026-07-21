import React from 'react';

import { UserMenu } from '@/components/UserMenu';

export default function Home() {
  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      
      {/* Sidebar */}
      <aside 
        className="glass-panel" 
        style={{ 
          width: 'var(--sidebar-width)', 
          height: '100%', 
          display: 'flex', 
          flexDirection: 'column',
          padding: 'var(--spacing-base) 16px',
          borderRight: '1px solid var(--border-glow)'
        }}
      >
        <div style={{ padding: '24px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 15px var(--primary-hover)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
            </svg>
          </div>
          <h1 style={{ fontSize: '20px', margin: 0, fontWeight: 700 }}>Nimbus</h1>
        </div>

        <nav style={{ flex: 1, marginTop: '24px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {['My Cloud', 'Recent', 'Favorites', 'Shared', 'Trash'].map((item, i) => (
            <a 
              key={item}
              href="#"
              className="animate-hover"
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '12px 16px',
                borderRadius: 'var(--radius-sm)',
                background: i === 0 ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
                color: i === 0 ? 'var(--text-high)' : 'var(--text-med)',
                fontWeight: i === 0 ? 600 : 500,
                borderLeft: i === 0 ? '3px solid var(--primary)' : '3px solid transparent',
              }}
            >
              {item}
            </a>
          ))}
        </nav>

        {/* Storage Widget */}
        <div className="glass-panel" style={{ padding: '20px', borderRadius: 'var(--radius-md)', marginTop: 'auto', marginBottom: '24px' }}>
          <h3 style={{ fontSize: '14px', marginBottom: '8px', color: 'var(--text-high)' }}>Storage</h3>
          <div style={{ background: 'rgba(255,255,255,0.1)', height: '6px', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{ background: 'var(--primary)', width: '65%', height: '100%', boxShadow: '0 0 10px var(--primary)' }} />
          </div>
          <p style={{ fontSize: '12px', marginTop: '8px', color: 'var(--text-med)' }}>65 GB of 100 GB used</p>
        </div>
      </aside>

      {/* Main Content Area */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
        
        {/* Header */}
        <header style={{ height: 'var(--header-height)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 40px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <div className="glass-panel" style={{ display: 'flex', alignItems: 'center', padding: '8px 16px', borderRadius: '24px', width: '400px' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-med)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '8px' }}>
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input 
              type="text" 
              placeholder="Search in Nimbus..." 
              style={{ background: 'transparent', border: 'none', color: 'var(--text-high)', width: '100%', outline: 'none', fontSize: '14px' }} 
            />
          </div>
          <UserMenu />
        </header>

        {/* Dashboard Grid */}
        <div style={{ padding: '40px', maxWidth: '1600px', margin: '0 auto', width: '100%' }}>
          <h2 style={{ fontSize: '24px', marginBottom: '24px', fontWeight: 600 }}>Quick Access</h2>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '24px', marginBottom: '48px' }}>
            {['Design Assets', 'Documents', 'Photos 2026', 'Invoices'].map((folder) => (
              <div key={folder} className="glass-panel-elevated animate-hover" style={{ padding: '24px', borderRadius: 'var(--radius-xl)', cursor: 'pointer' }}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="var(--primary)" fillOpacity="0.2" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '16px' }}>
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                </svg>
                <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-high)' }}>{folder}</h3>
                <p style={{ fontSize: '13px', color: 'var(--text-med)', marginTop: '4px' }}>12 items</p>
              </div>
            ))}
          </div>

          <h2 style={{ fontSize: '24px', marginBottom: '24px', fontWeight: 600 }}>Recent Files</h2>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {[
              { name: 'Q3_Financial_Report.pdf', type: 'PDF', size: '2.4 MB', date: '2 hours ago' },
              { name: 'Brand_Guidelines_v2.fig', type: 'Design', size: '14.1 MB', date: 'Yesterday' },
              { name: 'IMG_8942.jpg', type: 'Image', size: '4.8 MB', date: 'Aug 14' }
            ].map((file) => (
              <div key={file.name} className="glass-panel animate-hover" style={{ display: 'flex', alignItems: 'center', padding: '16px 24px', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text-med)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                  </svg>
                  <span style={{ fontWeight: 500 }}>{file.name}</span>
                </div>
                <div style={{ flex: 1, color: 'var(--text-med)', fontSize: '14px' }}>{file.date}</div>
                <div style={{ flex: 1, color: 'var(--text-med)', fontSize: '14px', textAlign: 'right' }}>{file.size}</div>
              </div>
            ))}
          </div>

        </div>
      </main>
    </div>
  );
}
