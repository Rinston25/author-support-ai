-- Money is stored as whole rupees (integer): the dataset has no paise.
-- Author and book ids are the dataset's own text ids (AUTH001, BK001).

CREATE TABLE authors (
  id          text PRIMARY KEY,
  name        text NOT NULL,
  email       text NOT NULL UNIQUE,
  phone       text,
  city        text,
  joined_date date,
  -- anything in the dataset we don't model explicitly
  metadata    jsonb NOT NULL DEFAULT '{}'
);

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL UNIQUE CHECK (email = lower(email)),
  password_hash text NOT NULL,
  role          text NOT NULL CHECK (role IN ('author', 'admin')),
  name          text NOT NULL,
  author_id     text REFERENCES authors(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  -- authors must be linked to an author record, admins must not be
  CHECK ((role = 'author') = (author_id IS NOT NULL))
);

CREATE TABLE books (
  id                       text PRIMARY KEY,
  author_id                text NOT NULL REFERENCES authors(id),
  title                    text NOT NULL,
  isbn                     text,
  genre                    text,
  publication_date         date,          -- null while in production
  status                   text NOT NULL, -- original dataset string, e.g. 'In Production - Cover Design'
  production_stage         text,          -- parsed from status, null once published
  mrp                      integer,       -- null while in production
  author_royalty_per_copy  integer,
  total_copies_sold        integer NOT NULL DEFAULT 0,
  total_royalty_earned     integer NOT NULL DEFAULT 0,
  royalty_paid             integer NOT NULL DEFAULT 0,
  royalty_pending          integer NOT NULL DEFAULT 0,
  last_royalty_payout_date date,
  print_partner            text,
  available_on             text[] NOT NULL DEFAULT '{}',
  metadata                 jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX books_author_idx ON books (author_id);

CREATE TABLE tickets (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id             text NOT NULL REFERENCES authors(id),
  book_id               text REFERENCES books(id), -- null = General / Account Level
  subject               text NOT NULL,
  description           text NOT NULL,
  status                text NOT NULL DEFAULT 'open'
                        CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  -- category and priority stay null until the classifier (or fallback) finishes
  category              text CHECK (category IN (
                          'royalty_payments', 'isbn_metadata', 'printing_quality',
                          'distribution_availability', 'book_status_production', 'general_inquiry')),
  priority              text CHECK (priority IN ('critical', 'high', 'medium', 'low')),
  classification_status text NOT NULL DEFAULT 'pending'
                        CHECK (classification_status IN ('pending', 'done', 'fallback')),
  category_source       text CHECK (category_source IN ('ai', 'fallback', 'admin')),
  priority_source       text CHECK (priority_source IN ('ai', 'fallback', 'admin')),
  ai_reasoning          text,
  assigned_to           uuid REFERENCES users(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  first_response_at     timestamptz,
  resolved_at           timestamptz
);
-- Indexes for the admin queue and the author's own list
CREATE INDEX tickets_queue_idx    ON tickets (status, priority, created_at);
CREATE INDEX tickets_author_idx   ON tickets (author_id, created_at);
CREATE INDEX tickets_assignee_idx ON tickets (assigned_to);

CREATE TABLE ticket_messages (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id      uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  sender_user_id uuid NOT NULL REFERENCES users(id),
  sender_role    text NOT NULL CHECK (sender_role IN ('author', 'admin')),
  body           text NOT NULL,
  ai_assisted    boolean NOT NULL DEFAULT false, -- admin sent an (edited) AI draft
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ticket_messages_ticket_idx ON ticket_messages (ticket_id, created_at);

-- Never returned by any author endpoint
CREATE TABLE internal_notes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id     uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  admin_user_id uuid NOT NULL REFERENCES users(id),
  body          text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX internal_notes_ticket_idx ON internal_notes (ticket_id, created_at);

-- One cached draft per ticket. based_on_message_id lets us tell when it is stale.
CREATE TABLE ai_drafts (
  ticket_id           uuid PRIMARY KEY REFERENCES tickets(id) ON DELETE CASCADE,
  body                text NOT NULL,
  model               text NOT NULL,
  based_on_message_id uuid REFERENCES ticket_messages(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- Metadata only; actual file upload is out of scope
CREATE TABLE ticket_attachments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id  uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  file_name  text NOT NULL,
  mime_type  text NOT NULL,
  size_bytes integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Cost awareness: one row per AI call
CREATE TABLE ai_usage_log (
  id                bigserial PRIMARY KEY,
  ticket_id         uuid REFERENCES tickets(id) ON DELETE SET NULL,
  purpose           text NOT NULL CHECK (purpose IN ('classify', 'draft')),
  model             text NOT NULL,
  input_tokens      integer,
  output_tokens     integer,
  cache_read_tokens integer,
  latency_ms        integer,
  success           boolean NOT NULL,
  error_code        text,
  created_at        timestamptz NOT NULL DEFAULT now()
);
