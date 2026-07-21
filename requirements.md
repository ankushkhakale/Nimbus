# Nimbus — Requirements

Revised requirements reflecting the goals and decisions confirmed during the
AWS-migration planning discussion. Supersedes the storage/compute assumptions
in the original `docs/Initial Architecture` doc where they conflict (noted
inline below).

## 1. Background & motivation

The user's Google One subscription is ending. ~90GB of data across Google
Drive and Google Photos needs to move somewhere else before it lapses. Rather
than buy another subscription, the goal is to build and own the replacement:
a self-hosted, open-source Drive+Photos alternative — consistent with the
project's original stated vision ("Own your cloud. Own your data.").

The user has an AWS Student Builder account with ~$100 (~₹9,630 at the
2026-07-21 mid-market rate of ₹96.3/USD) in credits, and access to GCP as
well, but is proceeding with AWS. They also have a separate AWS trial
component expiring in early October 2026 — this is **not** relied upon in
the architecture, since it doesn't remove the underlying cost problem once
it ends (see §3).

## 2. Goals

1. **Migrate** all Drive + Photos data (~90GB) to self-owned infrastructure
   before the Google One subscription lapses.
2. **Multi-user with auth** — support the primary user plus a handful of
   others (2-10 people total), each with isolated storage and login.
3. **Feature parity, minimum viable slice**: a Drive-style folder/file
   browser and a Photos-style date-grid view, both backed by real uploads/
   downloads — not a UI mockup.
4. **Zero-cost-beyond-floor**: total recurring cost must not exceed the true
   floor cost of durable cloud storage for the data volume in question.
   Explicitly ruled unaffordable: anything resembling the ~₹1,000/month range
   (confirmed by the user as a hard no — "costs half of Claude sub").
5. **Own the stack**: no BaaS platform (Supabase/Firebase) — auth, storage
   abstraction, and file APIs are built and owned by this project, not
   configured on top of a third party's managed product. (Trade-off
   accepted: more build effort than a BaaS shortcut, in exchange for no
   vendor lock-in and actually satisfying the project's own stated vision.)
6. **Production-grade, not a local demo**: nothing should be permanently
   local-only. Deployment is via CI/CD (GitHub Actions + Cloudflare Pages
   auto-build) to real (free-tier) cloud infrastructure — a laptop's only
   role is writing code and `git push`.

## 3. Cost requirement & the EC2 decision

Original plan assumed a single EC2 instance running the whole Docker Compose
stack. That was **rejected** after cost modeling showed it isn't reliably
free:

| Scenario | Monthly cost |
|---|---|
| EC2 + EBS, legacy free-tier account (pre-July 15, 2025) | Free (12 months), then real cost |
| EC2 + EBS, newer account (no legacy free tier) | ~$6-10/month (~₹580-965/month) |
| S3 storage alone, 90GB, any account | ~$2/month (~₹200/month) — the true floor |

EC2 bills per hour regardless of usage — idle time costs the same as active
use. The AWS trial expiring in October doesn't fix this: it only delays when
the same bill starts. **Decision: no EC2, no other always-on compute.**
Instead, the architecture uses serverless compute that bills per-request, so
idle time costs ₹0 (see §4). This leaves **~₹200/month (S3 storage only)**
as the permanent, floor-level recurring cost — confirmed acceptable.

## 4. Architecture (serverless)

| Layer | Choice | Why |
|---|---|---|
| Compute | FastAPI + **Mangum** on **AWS Lambda**, behind **API Gateway** (HTTP API) | Always-Free tier (1M requests + 400,000 GB-seconds/month) covers this project's scale indefinitely, regardless of AWS account age |
| Database | **MongoDB Atlas M0** (512MB, permanently free) | Lambda is stateless — DB must live outside it; Atlas's free tier has no time limit, unlike AWS's account-age-dependent free tier |
| File storage | **AWS S3** | Cheapest durable per-GB storage; matches the "S3 Storage Interface" abstraction already envisioned in `docs/Initial Architecture` |
| Uploads/downloads | **Presigned S3 URLs** issued by the FastAPI backend | Browser talks directly to S3 — keeps Lambda invocations short/cheap and avoids proxying large file bytes through a function with execution limits |
| Frontend hosting | Next.js **static export** on **Cloudflare Pages** | Free, HTTPS by default, no server to run |
| DNS/TLS | Cloudflare free subdomain | Avoids Route 53's ~$0.50/month hosted-zone charge |
| Thumbnails | S3 `ObjectCreated` event → separate Lambda (Pillow) | Stays within Lambda's Always-Free tier at this scale |
| Secrets | Lambda environment variables (KMS-encrypted by default) | AWS Secrets Manager costs ~$0.40/secret/month — skipped to hold the zero-cost line |
| CI/CD | GitHub Actions (backend, via SAM/Serverless Framework) + Cloudflare Pages auto-build (frontend) | Both free at this scale; ensures nothing is deployed manually from a laptop |
| Cost control | AWS Budgets alert at a low USD threshold (e.g. $5 / ~₹480) | Early warning if anything unexpectedly starts billing |

**Explicitly rejected alternatives and why:**
- **EC2** (any instance size) — per-hour billing regardless of usage; see §3.
- **Self-hosted MinIO on EC2** — more expensive per GB than S3 directly
  (EBS gp3 ~$0.08/GB-month vs. S3 Standard ~$0.023/GB-month), plus still
  carries the EC2 hourly cost.
- **Supabase / Firebase (BaaS)** — would satisfy cost and speed, but
  contradicts the "own your data" goal and reintroduces third-party lock-in
  (see §2.5). Documented as a legitimate fallback if effort ever needs to
  trump ownership, but not the chosen path.
- **AWS Secrets Manager, Route 53 hosted zones** — real per-month charges
  with free alternatives available; skipped entirely.

## 5. Auth model

- Registration: email + name + password → bcrypt-hashed, stored in Atlas.
- Login: verifies bcrypt hash → issues a JWT (HS256, 24-hour expiry).
- Every protected request: JWT decoded server-side (Lambda), user loaded
  from Atlas, and all file/folder queries scoped to that user's id — one
  user can never see another's files, folders, or presigned URLs.
- Token storage on the frontend: in-memory/React context, not
  `localStorage` (XSS exposure).
- No refresh-token flow in MVP — re-login after 24h. Addable later if
  needed; not worth the added complexity at this scale.
- Multi-user isolation is enforced via S3 key prefixing
  (`users/{user_id}/...`) in addition to the JWT scoping above.

## 6. Non-functional requirements

- **Security**: bcrypt password hashing, JWT-scoped authorization on every
  file/folder operation, least-privilege IAM (Lambda execution role limited
  to this project's one S3 bucket, not broad S3 access), CORS locked to the
  actual Cloudflare Pages frontend domain in production (not `*`), HTTPS
  everywhere (automatic via API Gateway + Cloudflare Pages).
- **Durability**: S3 provides the durability for file data. MongoDB Atlas
  metadata additionally needs a scheduled backup (e.g. periodic
  `mongodump` → S3) since Atlas's free M0 tier has no automated backups.
- **Scale target**: 2-10 users, ~90GB initial data, personal/light usage —
  explicitly not designed for public signup or high traffic. AWS's
  Always-Free 100GB/month internet egress comfortably covers this.
- **Out of scope for MVP** (deferred, may become "planned" features later):
  AI-powered semantic search/tagging (recurring LLM API cost), video
  transcoding, file versioning (multiplies storage cost). These were
  explicitly cut to protect the budget constraint in §3.

## 7. Migration requirements

- Source: Google Takeout export of Drive + Photos (~90GB, likely split into
  multiple archive parts).
- Google Photos items include `.json` sidecar files with the *actual*
  photo-taken timestamp — the extracted media file's mtime is the export
  time, not the real date. The migration tool must read sidecars and
  reapply correct timestamps, or the Photos-style date grid will be wrong.
- Must preserve Drive's folder structure and Google Photos' album groupings
  as Nimbus folder/metadata equivalents.
- Should be run as a one-time bulk job (direct `boto3` upload + Mongo writes
  is acceptable here, rather than routing through the per-file presigned-URL
  API meant for interactive use).

## 8. Task breakdown (build-out order)

Tracked live via the harness's task list; summarized here for durability:

1. **Backend deps** — `python-jose[cryptography]`, `passlib[bcrypt]`,
   `boto3`, `mangum` added to `backend/requirements.txt`. ✅ Done.
2. **Backend user auth** — user model/schema, bcrypt + JWT utils, user
   repository, auth service, `/register` `/login` `/me` `/forgot-password`
   endpoints, `get_current_user` dependency. 🔄 In progress (models,
   schemas, security utils, repository, service, and dependency are
   written; endpoints still need wiring into `api_router.py`).
3. **S3 storage interface** — presigned PUT/GET URL generation via `boto3`,
   per-user key prefixing.
4. **File/folder metadata API** — models, repository, service, and
   JWT-scoped endpoints (list/create-folder/request-upload-url/
   request-download-url/delete/move).
5. **Frontend auth wiring** — auth context for JWT storage, API fetch
   wrapper, real calls from the login/register/forgot-password pages,
   protected-route guard for `/dashboard`.
6. **Real dashboard** — replace all mock data with live file/folder calls,
   presigned-URL upload flow, folder navigation, Photos-style date grid.
7. **Google Takeout migration script** — per §7 above.
8. **Serverless deployment** — Atlas cluster, Lambda + API Gateway (SAM/
   Serverless Framework), Cloudflare Pages, S3 bucket + thumbnail Lambda,
   AWS Budgets alert. **Held: no cloud/infra action happens until the user
   explicitly says go for that specific step**, independent of approval
   given for code-level work.

## 9. Explicit non-goals (for now)

- Public/open signup — this is a private, invite-scale deployment for the
  user + a handful of people, not a public product.
- Any recurring paid feature (AI search, transcoding, versioning) — see §6.
- Reliance on any AWS free-tier window tied to account age or trial expiry
  as a load-bearing part of the cost model — the architecture must be
  affordable independent of those (see §3).
