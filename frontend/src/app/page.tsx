import Link from "next/link";
import {
  ArrowRight,
  Boxes,
  Cloud,
  FolderTree,
  Image as ImageIcon,
  Lock,
  ShieldCheck,
  Upload,
} from "lucide-react";

/*
 * Landing page.
 *
 * A server component — nothing here needs client-side state. The previous
 * version was "use client" only to run a mouse-tracking glow.
 *
 * Copy rule: every claim on this page is something the code actually
 * does. The earlier version advertised zero-knowledge encryption (it is
 * SSE-S3, so AWS holds the keys), semantic AI search (cut in
 * requirements §6), collaboration (not built), and five fictional
 * customer logos.
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
        <CostBreakdown />
        <NotYetBuilt />
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
          <a href="#cost" style={{ color: "var(--text-med)" }}>Cost</a>
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
            Apache&nbsp;2.0 · runs in your own AWS account
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
            Your bucket.
            <br />
            <span style={{ color: "var(--primary)" }}>About ₹200 a month.</span>
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
            Nimbus is a self-hosted replacement for Drive and Photos. It deploys
            into an AWS account you control, and file contents travel straight
            from your browser to your S3 bucket — the API only ever handles
            metadata.
          </p>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link href="/auth/register" className="btn-primary btn-lg" style={{ height: 48, padding: "0 26px", fontSize: 15 }}>
              Get started <ArrowRight size={17} />
            </Link>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              className="btn-secondary"
              style={{ height: 48, padding: "0 26px", fontSize: 15 }}
            >
              Read the source
            </a>
          </div>
        </div>

        <TerminalCard />
      </div>
    </section>
  );
}

/**
 * Real output from scripts/migrate_takeout.py, not an invented mockup —
 * the migration is the thing Nimbus was built to do, so it is what the
 * hero should show.
 */
function TerminalCard() {
  return (
    <div className="code-window animate-fade-in-up delay-200">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "12px 16px",
          borderBottom: "1px solid var(--hairline)",
        }}
      >
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#3a3a3a" }} />
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#3a3a3a" }} />
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#3a3a3a" }} />
        <span
          style={{
            marginLeft: 8,
            fontSize: 12,
            color: "var(--text-low)",
            fontFamily: "var(--font-mono)",
          }}
        >
          migrate_takeout.py
        </span>
      </div>

      <pre>
        <span className="tok-comment"># Move a Google Takeout export into your own bucket</span>
        {"\n"}
        <span className="tok-cmd">$ python</span> scripts/migrate_takeout.py{" "}
        <span className="tok-dim">\</span>
        {"\n    "}
        <span className="tok-key">--email</span>{" "}
        <span className="tok-str">you@example.com</span>{" "}
        <span className="tok-dim">\</span>
        {"\n    "}
        <span className="tok-key">--source</span> <span className="tok-str">~/Takeout</span>
        {"\n\n"}
        <span className="tok-dim">Found 1,284 files to consider</span>
        {"\n"}
        Drive/Documents/notes.txt{"          "}
        <span className="tok-str">uploaded</span>
        {"\n"}
        Photos/Trip to Goa/IMG_001.jpg{"    "}
        <span className="tok-str">uploaded</span>{" "}
        <span className="tok-dim">taken 2023-06-17</span>
        {"\n"}
        Photos/2023/IMG_002.jpg{"          "}
        <span className="tok-str">uploaded</span>{" "}
        <span className="tok-dim">taken 2023-01-01</span>
        {"\n"}
        <span className="tok-dim">…</span>
        {"\n\n"}
        <span className="tok-comment">Done. uploaded=1284 skipped=0 failed=0</span>
        {"\n"}
        <span className="tok-comment">Capture times restored from sidecars.</span>
      </pre>
    </div>
  );
}

/* ------------------------------------------------------------------ */

const STATS = [
  { value: "₹200", label: "a month for 90 GB on S3 Standard" },
  { value: "₹0", label: "while idle — serverless bills per request" },
  { value: "11×9", label: "S3 object durability" },
  { value: "0", label: "servers to patch or keep running" },
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
    title: "Deploy it to your account",
    body: "One CloudFormation stack: a Lambda, an HTTP API, and an S3 bucket that blocks all public access. Nothing runs — or bills — while idle.",
  },
  {
    title: "Sign in",
    body: "Passwords are bcrypt-hashed and sessions are JWTs. Every file and folder query is scoped to your user id, so accounts cannot see each other.",
  },
  {
    title: "Move your files in",
    body: "Upload from the browser, or bulk-import a Google Takeout export. Either way the bytes go straight to S3 over a presigned URL.",
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
        Three steps, and the bytes never pass through a server you have to run.
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
    title: "Direct-to-S3 transfers",
    body: "The API issues a presigned URL and steps out of the way. File contents never pass through it, so uploads are not capped by a function's memory or timeout.",
  },
  {
    icon: ImageIcon,
    title: "Thumbnails, automatically",
    body: "Writing an object fires an S3 event that runs a Lambda and stores a 512px JPEG. A 370 KB photo becomes a 23 KB thumbnail.",
  },
  {
    icon: FolderTree,
    title: "Photos by real date",
    body: "A Takeout export's file timestamps are the export date. Nimbus reads the JSON sidecars instead, so the grid shows when photos were actually taken.",
  },
  {
    icon: Boxes,
    title: "Takeout migration",
    body: "A resumable bulk importer that preserves Drive's folder structure and Photos albums. Interrupt it and re-run; it skips what already landed.",
  },
  {
    icon: Lock,
    title: "Per-user isolation",
    body: "Queries are scoped by JWT and objects are prefixed with users/{id}/. Path traversal is rejected before a key is ever built.",
  },
  {
    icon: ShieldCheck,
    title: "Encrypted at rest",
    body: "SSE-S3 with AES-256, and the bucket blocks public access on all four settings. Objects are reachable only through short-lived signed URLs.",
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

const COST_ROWS: [string, string, string][] = [
  ["S3 Standard storage", "90 GB", "≈ ₹202"],
  ["Lambda", "1M requests + 400,000 GB-s free", "₹0"],
  ["API Gateway", "first 1M requests free", "₹0"],
  ["MongoDB Atlas M0", "512 MB, free tier", "₹0"],
  ["Internet egress", "first 100 GB/month free", "₹0"],
];

function CostBreakdown() {
  return (
    <section id="cost" className="container section" style={{ paddingTop: 0 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: 48,
          alignItems: "start",
        }}
      >
        <div>
          <p className="eyebrow" style={{ marginBottom: 16 }}>Cost</p>
          <h2
            style={{
              fontSize: "clamp(30px, 4vw, 40px)",
              letterSpacing: "-0.035em",
              marginBottom: 20,
            }}
          >
            Storage is the only line that costs anything.
          </h2>
          <p style={{ fontSize: 16, color: "var(--text-body)", maxWidth: 460 }}>
            Everything else fits inside a permanently free tier at personal
            scale. There is no subscription and no margin on top — you are
            paying AWS directly for durable storage, and nothing else.
          </p>
        </div>

        <div className="card" style={{ padding: 8 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14.5 }}>
            <tbody>
              {COST_ROWS.map(([service, detail, price]) => (
                <tr key={service} style={{ borderBottom: "1px solid var(--hairline)" }}>
                  <td style={{ padding: "16px 16px 16px 20px" }}>
                    <div style={{ color: "var(--text-high)", fontWeight: 500 }}>{service}</div>
                    <div style={{ color: "var(--text-med)", fontSize: 13, marginTop: 2 }}>
                      {detail}
                    </div>
                  </td>
                  <td
                    style={{
                      padding: "16px 20px 16px 16px",
                      textAlign: "right",
                      whiteSpace: "nowrap",
                      fontFamily: "var(--font-mono)",
                      color: price === "₹0" ? "var(--text-med)" : "var(--text-high)",
                    }}
                  >
                    {price}
                  </td>
                </tr>
              ))}
              <tr>
                <td style={{ padding: "18px 16px 18px 20px", fontWeight: 600, color: "var(--text-high)" }}>
                  Total
                </td>
                <td
                  style={{
                    padding: "18px 20px 18px 16px",
                    textAlign: "right",
                    fontFamily: "var(--font-mono)",
                    fontSize: 18,
                    fontWeight: 700,
                    color: "var(--primary)",
                  }}
                >
                  ≈ ₹202
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <p style={{ marginTop: 24, fontSize: 13, color: "var(--text-low)", maxWidth: 720 }}>
        Based on AWS ap-south-1 list prices at $0.023 per GB-month, converted at
        ₹96.3 to the dollar. Rates and exchange rates move; the bill arrives in
        your own account, so check it against current pricing.
      </p>
    </section>
  );
}

/* ------------------------------------------------------------------ */

const NOT_BUILT = [
  "Share links and multi-user collaboration",
  "A mobile app — the web UI is responsive, but that is all",
  "File versioning and a trash bin",
  "Full-text or semantic search across file contents",
];

/**
 * Stating the gaps plainly is worth more than padding the feature list.
 * The previous page advertised three of these four as if they shipped.
 */
function NotYetBuilt() {
  return (
    <section className="container section" style={{ paddingTop: 0 }}>
      <div className="card" style={{ padding: 40 }}>
        <p className="eyebrow" style={{ marginBottom: 16 }}>Not built yet</p>
        <h2 style={{ fontSize: 24, letterSpacing: "-0.02em", marginBottom: 20 }}>
          Things Nimbus does not do
        </h2>
        <ul
          style={{
            listStyle: "none",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: "12px 32px",
          }}
        >
          {NOT_BUILT.map((item) => (
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
            Run it yourself.
          </h2>
          <p style={{ fontSize: 16, color: "rgba(10,10,10,0.75)", maxWidth: 460 }}>
            Clone the repo, deploy the stack, point it at your bucket. No
            account with us, because there is no us.
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
            Get started <ArrowRight size={17} />
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

        <div style={{ display: "flex", gap: 24, fontSize: 14, color: "var(--text-med)" }}>
          <a href="#how">How it works</a>
          <a href="#features">Features</a>
          <a href="#cost">Cost</a>
          <a href={GITHUB_URL} target="_blank" rel="noreferrer">GitHub</a>
        </div>
      </div>
    </footer>
  );
}
