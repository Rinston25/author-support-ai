# BookLeaf Author Support & Communication Portal

An author portal and an admin portal for handling author support queries, with AI-assisted ticket classification and reply drafting.

Repository is public at BookLeaf HR's request.

## Quick start (local)

**Prerequisites:** Node 20+ and Docker.

```bash
# 1. Get the code
git clone https://github.com/Rinston25/author-support-ai.git
cd author-support-ai

# 2. Copy the bookleaf_sample_data.json provided by BookLeaf into the repo root.
#    It is deliberately not committed. (Or point SEED_DATA_PATH at it.)

# 3. Start Postgres (host port 5433, so it does not clash with a local install on 5432)
docker compose up -d

# 4. Backend: API on http://localhost:3001
cd backend
cp .env.example .env        # set JWT_SECRET to any long random string
npm install
npm run db:reset            # drop, migrate, seed; prints the test logins
npm run dev

# 5. Frontend: app on http://localhost:3000 (open a second terminal)
cd frontend
cp .env.example .env
npm install
npm run dev
```

Open http://localhost:3000 and sign in with a test account below. API health check: http://localhost:3001/api/health.

**`ANTHROPIC_API_KEY` is optional.** Without it the app works fully: new tickets are classified by keyword rules (and flagged "rules" in the admin queue), and the admin's draft panel shows "AI is temporarily unavailable" with an empty editor so replies are written manually. To turn the AI on, put a key in `backend/.env`. The key lives only there and is never sent to the browser.

Tests: `cd backend && npm test` (needs the `.env` file and the running Postgres; the AI client is always mocked, so no key is used).

## Test credentials

`db:reset` creates these users. **Every author uses `Author@123`; both admins use `Admin@123`.**

| Role | Email | What to look at |
|---|---|---|
| Admin | `admin@bookleaf.com` | Ticket queue, ticket detail, AI draft |
| Admin | `ops@bookleaf.com` | A second admin (assignment, notes) |
| Author | `kavita.deshmukh@email.com` | **Below the ₹1,000 threshold:** pending ₹850, so the rollover message shows. Also has a book **in production** (Typesetting) |
| Author | `sneha.kulkarni@email.com` | Book **in production** (Cover Design), plus two published books |
| Author | `ananya.reddy@email.com` | **BK005**: ₹2,546 pending, **never paid**; has an open "haven't received any royalty" ticket |
| Author | `priya.sharma@email.com` | Two published books, one fully paid, one with pending royalty |

The other authors are `rohit.kapoor`, `vikram.joshi`, `meera.nair`, `arjun.malhotra`, `farhan.sheikh` and `diya.chatterjee`, all `@email.com`.

The seed also creates 8 demo tickets covering every category and priority, so the queue is not empty on first load.

## Try the real-time flow

1. In one browser window sign in as **Priya** (`priya.sharma@email.com`) and, in another (or a private window), as **admin** (`admin@bookleaf.com`). Leave the admin window on the **Ticket queue**.
2. As Priya, open **My books**, click **Raise a query about this book** on a book, fill in the form and submit. You land on the ticket page.
3. In the admin window the new ticket appears **by itself**, within a second or two, with a category and a priority. A badge shows who decided: `AI`, `rules` (keyword fallback) or `admin`.
4. As admin, open the ticket. If an AI draft is available it appears in the editor; otherwise write a reply. Resolve any `[CONFIRM: ...]` placeholders (sending is blocked while any remain) and press **Send reply**.
5. In Priya's window, the reply appears on the ticket page **without a refresh**.
6. Reply as Priya; the admin sees "The author replied" immediately.

## Architecture

```
frontend/ (Nuxt 3 SPA)  ──REST + SSE──►  backend/ (Fastify 4)  ──SQL──►  PostgreSQL
                                              │
                                              └──► Anthropic API (only from the backend)
```

- **Backend:** each module follows routes → service → repository. Routes handle HTTP and validation (JSON Schema on every route), services hold the business rules, repositories hold all the SQL. No SQL in routes.
- **Auth:** email + password (bcryptjs), JWT in an `Authorization: Bearer` header. Authentication runs in `onRequest`, so a missing token is always a 401 before any body validation. `requireRole('author' | 'admin')` checks the token and role together.
- **Author data is always scoped by the `authorId` in the JWT**, in SQL, never from the client. Another author's ticket or book returns **404**, not 403. Admin routes return 403 to authors.
- **Errors:** one shape everywhere, `{ "error": { "code", "message", "details" } }`. Validation errors are `400 VALIDATION_ERROR` with per-field details. Stack traces are never sent.
- **Real-time:** Server-Sent Events at `GET /api/events?token=<jwt>` (EventSource cannot set headers, so this one route takes the token in the query string and verifies it the same way). Authors only receive events for their own tickets and never admin-only ones (internal notes, AI results). Events carry a tiny summary; the page refetches the ticket. A heartbeat comment is sent every 25 seconds. The event bus is an in-process `EventEmitter`.
- **Money** is stored as whole-rupee integers: the dataset has no paise, and integers avoid float rounding issues.
- **Migrations** are numbered `.sql` files run by a small script (`npm run db:migrate`). `npm run db:reset` drops, migrates and seeds, and is safe to run repeatedly.
- **Frontend:** Nuxt 3 in SPA mode (`ssr: false`), plain CSS, no UI kit. The JWT is kept in a cookie. A global route middleware keeps guests on `/login` and each role in its own area.

## AI integration

All AI calls go through one file, `backend/src/ai/aiClient.js`, the only place that imports the Anthropic SDK.

**Model and settings (exactly as in the code):**

| | Classification | Draft reply |
|---|---|---|
| Model | `AI_MODEL`, default `claude-haiku-5-5` | same |
| Output | forced tool call `record_classification` (`strict: true`, enum category and priority) | free text |
| `max_tokens` | 300 | 1500 |
| `output_config.effort` | `low` | `low` |
| `temperature` | not sent | not sent |

`temperature` is not sent because Claude Haiku 5.5 rejects any value other than its default. Consistent output comes from the enum-constrained tool call (classification) and from the prompt rules (drafts). `max_tokens` is higher than the output needs because thinking tokens count towards it.

**Classification** runs after the `201` response for a new ticket, so ticket creation never waits for the AI. The prompt contains only the subject, the description (cut to 1,500 characters) and the selected book's status, plus the category definitions, the priority rubric and 8 short examples. It gets no knowledge base and no history. The result is validated in code (allowed category and priority; reasoning cut to 25 words). If the AI call fails or the output is invalid, keyword rules (`fallbackClassifier.js`) classify the ticket and mark it `fallback` so admins see it was guessed. A category or priority set by an admin is never overwritten (except by an explicit `force` reclassify). Tickets left unclassified by a crash are classified again at server start.

**Draft replies** are built by `contextBuilder.js` when an admin opens a ticket:
- System prompt (the same for every ticket): role, output rules, `company.md`, `tone.md`. The rules require plain text, 90–180 words, greeting by first name, a concrete timeline, a sign-off, and `[CONFIRM: ...]` instead of guessing anything staff must check. Word count is requested in the prompt, not enforced in code.
- User message: only the knowledge-base section for the ticket's category plus 1–2 matching examples; a FACTS block built **in code from the database** (author, the selected book, royalty summary, next payout date computed in `royaltyCalendar.js`; missing values are left out); the subject, the original message and the last 4 follow-ups (older ones become "N earlier messages omitted"); and optional admin instructions on regenerate.
- The draft is saved in `ai_drafts` against the latest author message. Opening the ticket again reuses it with no AI call. A new author message deletes it. **Regenerate** always calls the AI (instructions capped at 300 characters).
- The editor shows the draft labelled "AI draft — review before sending". Placeholders are listed above it and **Send stays disabled while any `[CONFIRM: ...]` remains**; the API also rejects such a body with `400 UNRESOLVED_PLACEHOLDERS`.

**Reliability:** 15 s timeout per call (`AI_TIMEOUT_MS`); up to 2 retries only on 429, 5xx or network errors, with exponential backoff, jitter and `retry-after` respected; a circuit breaker opens for 60 s after 3 consecutive failed calls, then lets one trial call through. Breaker state is shown on `/api/health`. If anything fails, classification falls back to rules and the draft endpoint returns `200` with `status: "unavailable"`.

**Cost awareness:** every call is written to `ai_usage_log` (tokens, cache-read tokens, latency, success, error code; never prompts or the key). `GET /api/admin/ai/usage` totals it and estimates cost from `AI_PRICE_INPUT_PER_MTOK` / `AI_PRICE_OUTPUT_PER_MTOK`. Cost is kept down by sending only one knowledge-base section per draft, a truncated, history-free classification prompt, and reusing saved drafts. The system prompt is marked with `cache_control: ephemeral`; whether the provider actually serves it from cache has **not been verified** (check `cache_read_tokens` in `ai_usage_log` once a key is configured).

## API

All routes are under `/api`, JSON only. "Author" routes need an author token, "admin" routes an admin token.

| Method | Path | Who | Purpose |
|---|---|---|---|
| GET | `/health` | public | Database, AI configured, circuit state, model |
| POST | `/auth/login` | public | `{ email, password }` → `{ token, user }` |
| GET | `/auth/me` | any | Current user |
| GET | `/books` | author | Own books + royalty summary (`totalPending`, `nextPayoutDate`, `belowPayoutThreshold`) |
| GET | `/books/:bookId` | author | One own book |
| POST | `/tickets` | author | Raise a ticket (`201` at once; classified afterwards) |
| GET | `/tickets?status=` | author | Own tickets with latest-message preview |
| GET | `/tickets/:ticketId` | author | Ticket + public messages (no notes, no AI fields) |
| POST | `/tickets/:ticketId/messages` | author | Follow-up; reopens a resolved ticket; `409` if closed |
| GET | `/admin/tickets` | admin | Queue: `status`, `category`, `priority`, `assignee` (`me`/`unassigned`/id), `from`, `to`, `q`, `sort` (`urgency`/`oldest`/`newest`), `page`, `pageSize` |
| GET | `/admin/tickets/stats` | admin | Counts for the queue header |
| GET | `/admin/tickets/:ticketId` | admin | Everything: messages, internal notes, AI reasoning and sources, author panel and books |
| PATCH | `/admin/tickets/:ticketId` | admin | `{ status?, category?, priority?, assignedTo? }` |
| POST | `/admin/tickets/:ticketId/assign-to-me` | admin | Assign; an open ticket moves to in progress |
| POST | `/admin/tickets/:ticketId/responses` | admin | Reply `{ body, aiAssisted, newStatus? }` |
| POST | `/admin/tickets/:ticketId/notes` | admin | Internal note |
| POST | `/admin/tickets/:ticketId/reclassify` | admin | Re-run classification (`{ force?: boolean }`) |
| GET | `/admin/tickets/:ticketId/draft` | admin | Saved or newly generated AI draft; `200` with `status: "unavailable"` if the AI is down |
| POST | `/admin/tickets/:ticketId/draft/regenerate` | admin | New draft, optional `{ instructions }` |
| GET | `/admin/ai/usage` | admin | AI calls, tokens, latency, estimated cost |
| GET | `/admin/users` | admin | Admin users (assignee dropdown) |
| GET | `/events?token=` | any | SSE stream of ticket events |

Request and response schemas, with examples, are defined next to each route in `backend/src/modules/*/schemas.js`. There is no generated API documentation page yet.

## Data model

PostgreSQL, plain SQL, one migration (`backend/src/db/migrations/001_init.sql`).

- `authors`, `books`: from the dataset, with its text ids (`AUTH001`, `BK001`). Books have typed columns for royalty fields, `print_partner`, `available_on text[]` and a parsed `production_stage`.
- `users`: email, bcrypt hash, role (`author` | `admin`); authors link to an `authors` row.
- `tickets`: status (`open`, `in_progress`, `resolved`, `closed`), category and priority (nullable until classified, with CHECK constraints), `classification_status` (`pending`, `done`, `fallback`), `category_source` / `priority_source` (`ai`, `fallback`, `admin`), AI reasoning, assignee, and `created_at`, `updated_at`, `first_response_at`, `resolved_at`. `book_id` is null for "General / Account Level".
- `ticket_messages` (with `ai_assisted`), `internal_notes` (never returned by author endpoints), `ticket_attachments` (metadata only).
- `ai_drafts` (one cached draft per ticket, tied to the latest author message) and `ai_usage_log`.
- Indexes for the queue: `(status, priority, created_at)`, `(author_id, created_at)`, `(assigned_to)`.

## Edge cases handled

- **Books in production** (BK013, BK015): the author sees "In production — stage: X" with a stage stepper instead of zero sales; no payout date is shown.
- **Royalty below ₹1,000:** the minimum applies to the author's **total** pending across all books, not per book. Kavita (₹850 total) sees the rollover message; Priya (₹3,570) does not.
- **Zero payouts and nothing pending:** BK005 shows "None yet" for last payout; fully paid books show "nothing pending".
- **Next payout date** is computed from the policy: quarter ends (Mar 31, Jun 30, Sep 30, Dec 31) plus 45 days.
- **AI down, rate limited or not configured:** tickets are still created and classified by rules; drafts return "unavailable"; manual replies always work.
- **Admin overrides** are never overwritten by a later AI result.
- **A reply with an unchecked `[CONFIRM: ...]`** is rejected by both the UI and the API.
- **Closed tickets** reject new replies (`409`); an author follow-up reopens a resolved ticket.
- **Empty, loading and error states** exist on every page; the layout works at laptop width and stacks on mobile.

## Known limitations

- **Not deployed.** The app runs locally only.
- **The AI prompts have not yet been tested against the live Anthropic API.** The pipeline is tested with a mocked client, and the request shape follows the SDK documentation, but classification accuracy, draft quality and prompt caching are unmeasured.
- **No Swagger UI or generated API docs.** The endpoint table above is the reference.
- **Attachments are metadata only.** File names, types and sizes are stored; files are not uploaded.
- **The event bus is single-instance.** It is an in-process `EventEmitter`; several server instances would need Redis pub/sub behind the same `publishEvent` / `subscribeToEvents` interface.
- No security hardening beyond input validation, hashed passwords, JWT auth and role checks (no rate limiting).
