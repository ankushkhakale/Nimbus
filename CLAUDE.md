# Nimbus

Self-hosted, open-source alternative to Google Drive + Google Photos.
Solo/student project — built to migrate ~90GB off a lapsing Google One
subscription and to own the infrastructure long-term ("own your cloud, own
your data" — see [README.md](README.md)).

## Tech stack (current, post-serverless-pivot)

- **Frontend**: Next.js (React) + Tailwind, static-exported, hosted on
  **Cloudflare Pages** (not a Next.js server).
- **Backend**: FastAPI (Python 3.13), wrapped with **Mangum**, deployed as a
  single **AWS Lambda** function behind **API Gateway** (HTTP API).
- **Database**: **MongoDB Atlas M0** (permanently free, 512MB) — not
  self-hosted Mongo, since Lambda is stateless.
- **File storage**: **AWS S3**, accessed via presigned URLs — the browser
  uploads/downloads directly to/from S3, Lambda never proxies file bytes.
- **Thumbnails**: S3 `ObjectCreated` event → separate Lambda (Pillow).
- **Auth**: JWT (HS256, 24h expiry), bcrypt password hashing.
- **Local dev only**: `docker-compose.yml` still works for local iteration
  against a local Mongo, but production never runs on a persistent local
  server or EC2 box — deployment is Lambda + Cloudflare Pages, driven by
  CI/CD (GitHub Actions + SAM/Serverless Framework for backend, Cloudflare
  Pages auto-build for frontend), not manual steps from a laptop.

**Note:** `docs/Initial Architecture` describes the *original* single-FastAPI-
process design. That was superseded by the serverless architecture above —
see `requirements.md` and the plan file for why (cost).

## Hard constraints — read before making architecture or dependency choices

- **Budget ceiling: ~₹200/month (~$2), forever.** That's the true floor cost
  of S3 storage for ~90GB and is the only recurring cost the architecture
  should ever incur. The user is a student who explicitly cannot afford
  ~₹1,000/month — this is not a soft preference, treat it as a hard limit
  when proposing any new AWS/third-party service.
- **No EC2, no other always-on compute.** It was evaluated and rejected
  specifically because it bills per-hour regardless of usage. Don't
  reintroduce it, even for "just running things locally on a server."
- **No Route 53, no AWS Secrets Manager, no paid tiers of anything.** Use
  Cloudflare for DNS (free), Lambda environment variables (KMS-encrypted by
  default, free) for secrets instead.
- **Never touch real cloud/AWS/Cloudflare infrastructure or run anything
  that could incur billing without the user explicitly saying to proceed
  with that specific action, in that moment.** A general "go ahead" on a
  coding task does not authorize infra changes — Task #8 (deployment) is
  explicitly held for a separate, explicit go-ahead. Everything before that
  is local code with no cost or cloud dependency.
- **"Production-grade" is the floor, not a stretch goal.** Proper password
  hashing, per-user JWT scoping, presigned URLs (never proxy file bytes
  through Lambda), least-privilege IAM once infra is touched. Don't write
  local-only hacks that need to be rewritten later.
- **Currency: quote costs in INR (₹)** when discussing money with the user —
  they're India-based and think in rupees, not dollars.

## Current state (as of the serverless pivot)

This was audited file-by-file — treat this as accurate for the audit date
noted in `requirements.md`, but re-verify before relying on it if it's been
a while:

- **Frontend**: landing page ([page.tsx](frontend/src/app/page.tsx)) is
  fully built. Auth pages (login/register/forgot-password) are UI-complete
  but **not wired to any backend** — submit handlers are `console.log`
  stubs. [dashboard/page.tsx](frontend/src/app/dashboard/page.tsx) is
  **entirely hardcoded mock data** (fake folders, fake files, fake storage
  bar).
- **Backend**: [main.py](backend/app/main.py) and
  [mongodb.py](backend/app/database/mongodb.py) are solid and reusable.
  `models/`, `schemas/`, `repositories/`, `services/`, `storage/`,
  `middleware/`, `utils/` started as empty stubs and are being filled in
  per the task list below.

## Task list

Tracked live via the harness's TaskList — check that for current status.
As of this writing:

1. ✅ Backend deps (`python-jose`, `passlib[bcrypt]`, `boto3`, `mangum`)
2. 🔄 Backend user auth (register/login/me/forgot-password)
3. ⬜ S3 storage interface (presigned URLs)
4. ⬜ File/folder metadata models + endpoints
5. ⬜ Wire frontend auth pages to backend
6. ⬜ Replace dashboard mock data with real file/photo browser
7. ⬜ Google Takeout migration script
8. ⬜ Serverless deployment — **held until the user explicitly says go**

Full detail (cost math, architecture rationale, phased build-out) lives in
`requirements.md` and the plan file at
`~/.claude/plans/the-main-reason-of-shimmying-cocke.md`.

## Working style for this project

A project-scoped skill exists at
[.claude/skills/nimbus-work-session/SKILL.md](.claude/skills/nimbus-work-session/SKILL.md)
— it triggers at the start of a work session to ask which task to tackle
next and how deep to go, always with concrete recommended options rather
than open-ended questions. Use it rather than re-deriving "what should we do
next" from scratch each time.
