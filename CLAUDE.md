# Nimbus

Self-hosted, open-source alternative to Google Drive + Google Photos.
Solo/student project — built to migrate ~90GB off a lapsing Google One
subscription and to own the infrastructure long-term ("own your cloud, own
your data" — see [README.md](README.md)).

**The backend is live and deployed.** This is no longer a scaffold.

## Tech stack

- **Backend**: FastAPI (Python 3.13) + **Mangum**, one **AWS Lambda**
  (`nimbus-api`) behind an **API Gateway** HTTP API, in `ap-south-1`.
- **Database**: **MongoDB Atlas M0** (`Cluster0`, ap-south-1, permanently
  free) — Lambda is stateless, so the DB lives outside it.
- **File storage**: **AWS S3**, private bucket, SSE-S3. The browser
  uploads/downloads directly via presigned URLs; **Lambda never proxies
  file bytes**.
- **Thumbnails**: S3 `ObjectCreated` on `users/` → `nimbus-thumbnailer`
  Lambda (Pillow) → 512px JPEG under `thumbnails/`.
- **Frontend**: Next.js 16, **static export** (`output: "export"`).
  Client-rendered; talks to API Gateway. **Not yet deployed** — see
  "Open items".
- **Auth**: JWT (HS256, 24h), bcrypt. Token held in React state only.
- **IaC**: plain CloudFormation in `infra/nimbus-backend.yaml`.
- **CI/CD**: GitHub Actions. CI on every PR; deploy on merge to `main`
  (or manual dispatch) via **GitHub OIDC** — no AWS keys stored.

**Note:** `docs/Initial Architecture` describes the *original*
single-FastAPI-process design, superseded by the serverless architecture
above. `requirements.md` has the cost math and rationale.

## Hard constraints — read before making architecture or dependency choices

- **Budget ceiling: ~₹200/month (~$2), forever.** That is the true floor
  cost of S3 for ~90GB and the only recurring cost the architecture should
  incur. The user is a student who explicitly cannot afford ~₹1,000/month.
  Treat as a hard limit when proposing any new service.
- **No EC2, no always-on compute.** Rejected because it bills per hour
  regardless of usage. This is also why **Kubernetes and anything needing
  a cluster (ArgoCD etc.) is out** — a control plane costs more per month
  than the entire budget.
- **No Route 53, no Secrets Manager, no paid tiers.** Secrets live in
  Lambda environment variables (KMS-encrypted, free) and GitHub Actions
  secrets.
- **Never create, modify or deploy cloud resources without the user
  explicitly saying so for that specific action, in that moment.** A
  general "go ahead" on coding does not extend to infrastructure.
- **"Production-grade" is the floor.** bcrypt, per-user JWT scoping,
  presigned URLs, least-privilege IAM.
- **Quote costs in INR (₹).** The user is India-based.

## Current state

The original tasks 1–7 are **done and deployed**, and a large dashboard
feature push (the "dashboard PRD") has since shipped on top — the app is
a full-featured file manager, not a mockup.

| Area | State |
|---|---|
| Auth | register / login / me / forgot-password (stub, no mail provider); Google + GitHub OAuth; **session management** (list/revoke signed-in devices); **login-activity log** |
| Files | paginated list, folders, upload, download, preview, move, rename, trash, restore, permanent delete, search (+ filters & saved searches), photos, videos, recent, usage; **duplicate detection & photo stacks**, **map view (GPS EXIF)**, **file versioning** (bounded retention), **sharing** (public/expiring/named-recipient links + folder shares), **multipart + folder upload**, **activity feed** |
| Thumbnails | automatic on every S3 upload (image dHash + GPS metadata piggybacked); **video-frame thumbnails are wired but inert** until an ffmpeg Lambda-layer ARN is supplied (`FfmpegLayerArn` param, empty by default) |
| Migration | `scripts/migrate_takeout.py` — resumable, sidecar-aware |
| Frontend | landing, auth, dashboard (infinite scroll, lightbox with zoom/slideshow/cast/in-browser photo editing, multi-select, drag-move, right-click menu, undo toasts, bulk rename, client-side ZIP download), docx preview + side-by-side compare, Settings (profile/storage/security/preferences), **light/dark theme**, **partial i18n (English/Hindi)** |
| Tests | 242 backend tests; `tsc`/eslint/`next build` clean |

### Dashboard PRD batches (shipped, each its own merged PR)

Delivered incrementally as batches, each backend-verified (`pytest`) and
frontend-verified (`tsc` + `eslint` + `next build`) before merge:

1–7 quick wins, starred/grid/colored folders, search filters + saved
searches, duplicate detection + photo stacks, map view (GPS EXIF),
in-browser photo editing, slideshow + cast · **8** video thumbnails
(code only — needs an ffmpeg layer + a deploy decision to activate) ·
**9** sharing · **10** office-doc (docx) preview + compare · **11**
folder upload + multipart/chunked large uploads · **12** file versioning
(bounded to 10/file) · **13** bulk ops (rename, ZIP download, drag-move,
context menu, undo) · **14** activity + login-activity logs · **15**
storage-almost-full banner · **16** light/dark theme + i18n foundation ·
**18** session management.

Not done: **17 (2FA/TOTP) — dropped by the owner.** Remaining/queued:
**19** account export, **20** locked folder, **21** accessibility, **22**
offline read-only cache, **23** "free up space" flow, **24** owner cost
transparency. Deliberately excluded (per-call AI cost, format/audience
mismatch, or platform limits): AI-organize/semantic-search/face-grouping,
realtime collab, watermarking/DLP, desktop sync, camera-roll auto-backup,
client-side E2E encryption (deferred to its own security-critical pass).

**Notes for future work:**
- Two new client dependencies were added and vetted: `mammoth` (docx
  preview) and `jszip` (client-side ZIP). `xlsx` (SheetJS) was
  **evaluated and rejected** — unpatched high-severity CVEs, risky given
  public share links; xlsx/pptx preview fall back to download.
- i18n coverage is intentionally **partial** (nav + Settings translated;
  dialogs/landing still English). The Hindi strings want a native-speaker
  review before a Hindi-first launch.
- `npm audit` flags pre-existing high-severity advisories in Next.js
  framework transitive deps (sharp/postcss/brace-expansion/js-yaml) —
  untouched by feature work; worth a standalone `next` bump PR.

**Getting the live URL** (don't hardcode it — read it from the stack):
```bash
aws cloudformation describe-stacks --stack-name nimbus-backend --region ap-south-1 \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiUrl`].OutputValue' --output text
```

## Traps — things already hit, don't rediscover them

- **`passlib` is incompatible with `bcrypt` 5.x.** It crashed on *every*
  password hash. `utils/security.py` uses `bcrypt` directly now. Do not
  reintroduce passlib. Passwords are capped at 72 bytes (bcrypt's limit).
- **boto3 signs against the global S3 endpoint by default**, which
  307-redirects for `ap-south-1` and drops the signature — browser uploads
  fail silently. `s3_storage.py` pins the regional endpoint with SigV4.
  Keep it.
- **Never bundle `boto3`/`botocore` in the Lambda zip** — the runtime
  provides them, and they added ~40MB. `scripts/package_lambda.sh` prunes
  them. `requirements.txt` uses plain `fastapi`, not `fastapi[standard]`,
  for the same reason.
- **Deploying via SAM does not work here.** It needs
  `cloudformation:CreateChangeSet` on the AWS-owned transform ARN, outside
  the `NimbusDeploy` policy's `stack/nimbus-*` scope. `template.yaml`
  exists **only** for `sam build`; deployment uses
  `infra/nimbus-backend.yaml`. Keep Handler/Runtime/CodeUri in step.
- **A single missing IAM permission rolls back the whole stack.** This has
  happened twice (`logs:`, then `events:`). When adding a resource type,
  check the deploy policy grants it first.
- **In CloudShell, `export AWS_PAGER=""` first** and pass
  `--region ap-south-1`. A pager has silently swallowed command output
  more than once, including an `attach-role-policy` that appeared to
  succeed and had not.
- **`.env` is gitignored and untracked** — it was previously committed.
  Never re-add it. `.env.example` is the committed template.
- **The local dev frontend's `.env.local` points at the live deployed
  backend**, not a local one. So testing an unmerged batch's new
  endpoints/fields in the browser shows stale/missing data (a new route
  404/405s) until it deploys — this is expected, not a bug. First
  hypothesis for any "my new field isn't showing locally" confusion.
- **The React Compiler lint is strict** (`react-hooks/set-state-in-effect`,
  `react-hooks/refs`, `react-hooks/immutability`). Don't call a state
  setter synchronously as an effect's first statement (use a lazy
  `useState(() => readLocalStorage())` initializer, or set it in an
  event handler / after an async boundary); don't read/write `ref.current`
  during render; don't assign `window.location.href` (use
  `.assign(...)`). These fail the CI build, not just the editor.
- **Deletion is soft.** `DELETE` trashes; only `/files/delete-permanently`
  and the purge remove S3 objects. Trashed items still cost storage, which
  is why usage reports them separately.

## Open items

1. **`EnablePurgeSchedule` is `false`.** The EventBridge rule needs
   `events:*`, which the deploy policy lacks — and that gap rolled back a
   deploy. Until it is granted and the parameter flipped, **trash never
   purges and keeps costing storage**.
2. **Log retention is "never expire"** — needs `logs:PutRetentionPolicy`.
3. **Frontend is not deployed.** Decision made to use **Vercel** (native
   Next.js, already connected) rather than Cloudflare Pages as
   `requirements.md` §4 says. Import the repo with **Root Directory
   `frontend`** — there is no `package.json` at the repo root, so leaving
   this at `./` is the failure everyone hits — and set
   `NEXT_PUBLIC_API_BASE_URL` before the first build, since it is
   compiled into the client bundle rather than read at runtime.
   PR #6 must merge first or Vercel builds the pre-redesign frontend.
4. **`CORS_ORIGINS` is still `http://localhost:3000`** — in the
   CloudFormation parameter *and* the GitHub repo variable. The deployed
   frontend cannot call the API until both point at its real origin.
5. **Reloading the page signs the user out.** Deliberate: the token is in
   memory only (requirements §5). Fixing it needs an httpOnly refresh
   cookie, which is cross-site here and so needs `SameSite=None` plus CSRF
   protection. Explicitly deferred until the frontend has a domain.
6. **Failed uploads leave `pending` items forever.** They are excluded
   from listings and usage, but nothing cleans them up. A stale-pending
   sweep belongs in the purge job.
7. **Branch protection is not enabled** on `main` — confirmed, no
   rulesets exist. Required approvals must be `0`, or a solo maintainer
   cannot merge their own PR.

## Planned: EC2 for the migration only

The no-EC2 rule stands for *serving* anything. One deliberate exception
is agreed: running the 90GB Takeout migration on a temporary instance in
`ap-south-1`, then terminating it.

This is the case where a server is genuinely the right tool. Uploading
90GB from a home connection could take days and resumes badly; an
instance in the same region as the bucket pulls the Takeout archives
over AWS's network and uploads in-region, where transfer is free. The
data never touches the home link.

Rules for it: use an **IAM instance role**, never pasted access keys;
run the job under `tmux` so an SSH drop does not kill it; **terminate
the instance** when the migration finishes. It is burst compute for a
bounded job, not hosting.

Credit math that drove the decision — ~$120 of credits buys either
~12 months of a t3.micro, or ~4.75 years of S3 storage for 90GB. The
credits are reserved for storage.

## Working style for this project

A project-scoped skill exists at
[.claude/skills/nimbus-work-session/SKILL.md](.claude/skills/nimbus-work-session/SKILL.md)
— it triggers at the start of a work session, figures out what is next
from this file and the task list, and offers concrete options rather than
open-ended questions.

Verify against reality rather than trusting this file: run the tests, hit
the live health endpoint, read the stack outputs. Several bugs in this
project were only caught by actually exercising the deployed system —
CI passing and CloudFormation reporting success both proved insufficient
on their own.
