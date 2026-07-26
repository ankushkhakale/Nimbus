import Link from "next/link";
import {
  ArrowRight,
  Boxes,
  Cloud,
  Heart,
  Image as ImageIcon,
  Lock,
  Search,
  Share2,
  ShieldCheck,
  Star,
  Upload,
} from "lucide-react";

/*
 * Landing page.
 *
 * A server component — nothing here needs client-side state.
 *
 * Copy rule: every claim on this page is something the product actually
 * does. Nimbus is a free, hosted, open-source Drive/Photos alternative —
 * you sign up and use it; there is nothing to install. Do not re-add the
 * old "deploy it into your own AWS account" framing (that path is planned,
 * not shipped), and do not list already-shipped features (sharing,
 * versioning, search) as "not built".
 */

const GITHUB_URL = "https://github.com/ankushkhakale/Nimbus";

export default function LandingPage() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <SiteHeader />

      <main style={{ flex: 1 }}>
        <Hero />
        <StatBand />
        <HowItWorks />
        <WhatItDoes />
        <AboutMaker />
        <Roadmap />
        <CtaBand />
      </main>

      <SiteFooter />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function SiteHeader() {
  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        height: "var(--header-height)",
        background: "var(--canvas)",
        borderBottom: "1px solid var(--hairline)",
      }}
    >
      <div
        className="container"
        style={{
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 24,
        }}
      >
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Cloud size={22} color="var(--primary)" strokeWidth={2.5} />
          <span
            style={{
              fontSize: 17,
              fontWeight: 700,
              letterSpacing: "-0.02em",
              color: "var(--text-high)",
            }}
          >
            Nimbus
          </span>
        </Link>

        <nav
          className="nav-links"
          style={{ display: "flex", gap: 28, fontSize: 14, fontWeight: 500 }}
        >
          <a href="#how" style={{ color: "var(--text-med)" }}>How it works</a>
          <a href="#features" style={{ color: "var(--text-med)" }}>Features</a>
          <a href="#maker" style={{ color: "var(--text-med)" }}>About</a>
          <a href={GITHUB_URL} target="_blank" rel="noreferrer" style={{ color: "var(--text-med)" }}>
            GitHub
          </a>
        </nav>

        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <Link
            href="/auth/login"
            style={{ fontSize: 14, fontWeight: 600, color: "var(--text-high)" }}
          >
            Sign in
          </Link>
          <Link href="/auth/register" className="btn-primary">
            Get started
          </Link>
        </div>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ */

function Hero() {
  return (
    <section className="container section" style={{ paddingBottom: 0 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
          gap: 56,
          alignItems: "center",
        }}
      >
        <div className="animate-fade-in-up">
          <span className="badge" style={{ marginBottom: 24 }}>
            <ShieldCheck size={14} color="var(--primary)" />
            Free to use · Open source
          </span>

          <h1
            style={{
              fontSize: "clamp(40px, 6.4vw, 72px)",
              lineHeight: 1.05,
              letterSpacing: "-0.045em",
              marginBottom: 24,
            }}
          >
            Your files.
            <br />
            Your photos.
            <br />
            <span style={{ color: "var(--primary)" }}>Free cloud storage.</span>
          </h1>

          <p
            style={{
              fontSize: 18,
              lineHeight: 1.6,
              color: "var(--text-body)",
              maxWidth: 520,
              marginBottom: 32,
            }}
          >
            Nimbus is a clean, fast alternative to Google Drive and Photos —
            free to use, with nothing to install. Create an account, upload your
            files and photos, and get them back on any device. No subscription,
            no credit card, no company mining your library. And it&rsquo;s fully
            open source.
          </p>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link href="/auth/register" className="btn-primary btn-lg" style={{ height: 48, padding: "0 26px", fontSize: 15 }}>
              Get started free <ArrowRight size={17} />
            </Link>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              className="btn-secondary"
              style={{ height: 48, padding: "0 26px", fontSize: 15 }}
            >
              <Star size={16} /> Star on GitHub
            </a>
          </div>
        </div>

        <AppShot />
      </div>
    </section>
  );
}

/** A real screenshot of the app, not an invented mockup. */
function AppShot() {
  return (
    <div
      className="animate-fade-in-up delay-200"
      style={{
        borderRadius: "var(--radius-lg)",
        border: "1px solid var(--hairline-strong)",
        overflow: "hidden",
        boxShadow: "0 24px 60px rgba(0,0,0,0.4)",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/nimbus-app.png"
        alt="The Nimbus dashboard — files, folders, and storage"
        width={1200}
        height={640}
        style={{ display: "block", width: "100%", height: "auto" }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */

const STATS = [
  { value: "₹0", label: "to sign up and use — no subscription, no card" },
  { value: "Open", label: "source under Apache 2.0 — read every line" },
  { value: "AES-256", label: "encryption at rest; private by default" },
  { value: "0", label: "ads or trackers mining your library" },
];

function StatBand() {
  return (
    <section className="container section">
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
          gap: 32,
          paddingTop: 40,
          borderTop: "1px solid var(--hairline)",
        }}
      >
        {STATS.map((stat) => (
          <div key={stat.label}>
            <div className="stat">{stat.value}</div>
            <p style={{ marginTop: 10, fontSize: 14, color: "var(--text-med)", maxWidth: 220 }}>
              {stat.label}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */

const STEPS = [
  {
    title: "Create your account",
    body: "Sign up in seconds with email and a password, or continue with Google or GitHub. Every file and folder is scoped to you — accounts never see each other.",
  },
  {
    title: "Upload anything",
    body: "Drag files or whole folders right onto the page. Big files upload in resilient chunks, and a dropped connection pauses and resumes on its own.",
  },
  {
    title: "Organize, share, find",
    body: "Folders, stars, and colors; a photo timeline; share links when you need them; and search, Recent, and an activity feed to find anything fast.",
  },
];

function HowItWorks() {
  return (
    <section id="how" className="container section" style={{ paddingTop: 0 }}>
      <p className="eyebrow" style={{ marginBottom: 16 }}>How it works</p>
      <h2
        style={{
          fontSize: "clamp(30px, 4vw, 40px)",
          letterSpacing: "-0.035em",
          maxWidth: 620,
          marginBottom: 48,
        }}
      >
        Three steps, and there&rsquo;s nothing to install.
      </h2>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 24,
        }}
      >
        {STEPS.map((step, index) => (
          <div key={step.title} className="card" style={{ padding: 32 }}>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 13,
                color: "var(--primary)",
                marginBottom: 20,
              }}
            >
              0{index + 1}
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 600, letterSpacing: 0, marginBottom: 10 }}>
              {step.title}
            </h3>
            <p style={{ fontSize: 15, color: "var(--text-body)" }}>{step.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */

const FEATURES = [
  {
    icon: Upload,
    title: "Uploads that finish",
    body: "Files or whole folders, in resilient multipart chunks. A Drive-style tray lets you pause, resume, and cancel — and network drops auto-resume when you're back online.",
  },
  {
    icon: ImageIcon,
    title: "Photos, done right",
    body: "A date-ordered photo timeline with a full-screen lightbox — zoom, slideshow, cast to a TV — plus in-browser editing and automatic thumbnails.",
  },
  {
    icon: Share2,
    title: "Share on your terms",
    body: "Public, expiring, or named-recipient links for any file or folder. Send what you want, to whom you want, for as long as you want.",
  },
  {
    icon: Search,
    title: "Find it fast",
    body: "Search with filters and saved searches, a Recent view, duplicate detection, and an activity feed that remembers everything you've done.",
  },
  {
    icon: Lock,
    title: "Private by default",
    body: "Your files are isolated per account, encrypted at rest with AES-256, and reachable only through short-lived signed URLs. No ads, no tracking.",
  },
  {
    icon: Boxes,
    title: "Bring your old life",
    body: "Import a Google Takeout export — resumable, and it restores real photo capture dates from Takeout's metadata so your timeline is right.",
  },
];

function WhatItDoes() {
  return (
    <section id="features" className="container section" style={{ paddingTop: 0 }}>
      <p className="eyebrow" style={{ marginBottom: 16 }}>What it does</p>
      <h2
        style={{
          fontSize: "clamp(30px, 4vw, 40px)",
          letterSpacing: "-0.035em",
          maxWidth: 620,
          marginBottom: 48,
        }}
      >
        Everything below is built and running today.
      </h2>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          gap: 24,
        }}
      >
        {FEATURES.map(({ icon: Icon, title, body }) => (
          <div key={title} className="card" style={{ padding: 32 }}>
            <Icon size={20} color="var(--primary)" strokeWidth={2} />
            <h3
              style={{
                fontSize: 18,
                fontWeight: 600,
                letterSpacing: 0,
                margin: "18px 0 10px",
              }}
            >
              {title}
            </h3>
            <p style={{ fontSize: 15, color: "var(--text-body)" }}>{body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */

function AboutMaker() {
  return (
    <section id="maker" className="container section" style={{ paddingTop: 0 }}>
      <div
        className="card"
        style={{
          padding: "clamp(32px, 5vw, 56px)",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 40,
          alignItems: "center",
        }}
      >
        <div>
          <p className="eyebrow" style={{ marginBottom: 16 }}>About</p>
          <h2 style={{ fontSize: "clamp(26px, 3.5vw, 34px)", letterSpacing: "-0.03em", marginBottom: 18 }}>
            Built with <Heart size={26} color="var(--primary)" fill="var(--primary)" style={{ verticalAlign: "-3px" }} /> by Ankush Khakale
          </h2>
          <p style={{ fontSize: 16, lineHeight: 1.65, color: "var(--text-body)", marginBottom: 16 }}>
            I&rsquo;m a student and developer who got tired of watching free
            cloud credits go to waste while good storage stayed locked behind
            subscriptions. So I built the alternative — in the open, one
            reviewed pull request at a time.
          </p>
          <p style={{ fontSize: 16, lineHeight: 1.65, color: "var(--text-body)", marginBottom: 24 }}>
            Nimbus is the result: a real, working Drive and Photos replacement
            that anyone can use for free and anyone can read, learn from, or
            contribute to. If it&rsquo;s useful to you, a star means a lot.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <a
              href="https://github.com/ankushkhakale"
              target="_blank"
              rel="noreferrer"
              className="btn-primary"
              style={{ height: 44, padding: "0 22px", fontSize: 14 }}
            >
              <Star size={16} /> @ankushkhakale
            </a>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              className="btn-secondary"
              style={{ height: 44, padding: "0 22px", fontSize: 14 }}
            >
              Star the project
            </a>
          </div>
        </div>

        <div
          aria-hidden
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: 180,
          }}
        >
          <Cloud size={120} color="var(--primary)" strokeWidth={1.4} style={{ opacity: 0.9 }} />
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */

const ROADMAP = [
  "Connect your own cloud — run on your own AWS free credits (planned)",
  "A native mobile app — the web UI is already responsive",
  "Offline read-only access (service worker cache)",
  "Password-reset email delivery",
];

function Roadmap() {
  return (
    <section className="container section" style={{ paddingTop: 0 }}>
      <div className="card" style={{ padding: 40 }}>
        <p className="eyebrow" style={{ marginBottom: 16 }}>Roadmap</p>
        <h2 style={{ fontSize: 24, letterSpacing: "-0.02em", marginBottom: 20 }}>
          What&rsquo;s next for Nimbus
        </h2>
        <ul
          style={{
            listStyle: "none",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: "12px 32px",
          }}
        >
          {ROADMAP.map((item) => (
            <li
              key={item}
              style={{
                display: "flex",
                gap: 12,
                fontSize: 15,
                color: "var(--text-body)",
              }}
            >
              <span aria-hidden style={{ color: "var(--text-low)" }}>—</span>
              {item}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */

function CtaBand() {
  return (
    <section className="container" style={{ paddingBottom: "var(--section)" }}>
      <div
        className="card-yellow"
        style={{
          padding: "clamp(40px, 6vw, 64px)",
          display: "flex",
          flexWrap: "wrap",
          gap: 32,
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div>
          <h2
            style={{
              fontSize: "clamp(28px, 4vw, 40px)",
              letterSpacing: "-0.035em",
              marginBottom: 12,
            }}
          >
            Start in seconds.
          </h2>
          <p style={{ fontSize: 16, color: "rgba(10,10,10,0.75)", maxWidth: 460 }}>
            Create a free account and move your files and photos into a cloud
            that doesn&rsquo;t charge you or mine your data.
          </p>
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Link
            href="/auth/register"
            className="btn"
            style={{
              height: 48,
              padding: "0 26px",
              fontSize: 15,
              background: "var(--on-primary)",
              color: "var(--primary)",
            }}
          >
            Get started free <ArrowRight size={17} />
          </Link>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            className="btn"
            style={{
              height: 48,
              padding: "0 26px",
              fontSize: 15,
              background: "transparent",
              color: "var(--on-primary)",
              border: "1px solid rgba(10,10,10,0.3)",
            }}
          >
            GitHub
          </a>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */

function SiteFooter() {
  return (
    <footer style={{ borderTop: "1px solid var(--hairline)", padding: "40px 0" }}>
      <div
        className="container"
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 20,
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Cloud size={18} color="var(--primary)" strokeWidth={2.5} />
          <span style={{ fontWeight: 700, color: "var(--text-high)" }}>Nimbus</span>
          <span style={{ color: "var(--text-low)", fontSize: 14 }}>· Apache 2.0</span>
        </div>

        <span style={{ color: "var(--text-med)", fontSize: 14, display: "flex", alignItems: "center", gap: 6 }}>
          Made with <Heart size={13} color="var(--primary)" fill="var(--primary)" /> by Ankush Khakale
        </span>

        <div style={{ display: "flex", gap: 24, fontSize: 14, color: "var(--text-med)" }}>
          <a href="#how">How it works</a>
          <a href="#features">Features</a>
          <a href={GITHUB_URL} target="_blank" rel="noreferrer">GitHub</a>
        </div>
      </div>
    </footer>
  );
}
