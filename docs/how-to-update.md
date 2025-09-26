# Updating Data in the EO Event Log

This guide shows how to express common “updates” in the event-oriented (EO) carrier used by the Secure Chat workspace. Because the storage is an append-only log, updating means **adding a new event** that describes what changed and letting downstream views compute the latest truth.

Each event has the structure:

```json
{ "id": "E/123", "s": "U/alex", "p": "posts", "o": "M/0007", "at": "2025-09-26T14:05:00Z", "ground": ["GND/sprint-18"], "meta": { "text": "hello" } }
```

Key fields:

- `s` (subject), `p` (predicate), and `o` (object) describe the fact.
- `at` records when the fact happened, while `recorded_at` (added automatically) captures when it was stored.
- `ground` carries contextual tags such as sprint, policy, or environment identifiers.
- `meta` holds structured JSON data that complements the fact.

## Core Rules

1. **Never edit or delete old events.** Every change is a new append.
2. **Track two timestamps:**
   - `at` for the real-world time of the fact.
   - `recorded_at` for when the system stored it (useful for late arrivals).
3. **Make events idempotent** by including a `nonce` or `source_event_id` in `meta` so retries do not duplicate work.
4. **Materialize the latest state in views** using `GROUP BY` + `MAX(at)` over the relevant key.

## 1. Create Something (message, task, membership)

**Create message**

```json
{ "id":"E/9001","s":"U/alex","p":"posts","o":"M/0042","at":"2025-09-26T15:00:00Z","meta":{"text":"Draft v2"} }
{ "id":"E/9002","s":"M/0042","p":"addresses","o":"C/design","at":"2025-09-26T15:00:00Z" }
```

**Create task**

```json
{ "id":"E/9010","s":"K/T-30","p":"title","o":"Design review v2","at":"2025-09-26T15:05:00Z" }
{ "id":"E/9011","s":"K/T-30","p":"status","o":"todo","at":"2025-09-26T15:05:00Z" }
{ "id":"E/9012","s":"K/T-30","p":"assigned_to","o":"U/sam","at":"2025-09-26T15:05:00Z" }
```

## 2. Update Text / Edit a Message

Emit a new `text_edit` event instead of mutating the original message.

```json
{ "id":"E/9050","s":"M/0042","p":"text_edit","o":"v2","at":"2025-09-26T15:07:00Z","meta":{"text":"Draft v2 (final wording)"} }
```

**View rule:**

1. If a `text_edit` exists, take the latest by `at`.
2. Otherwise, fall back to the `posts.meta.text` value.

**SQLite sketch:**

```sql
WITH bodies AS (
  SELECT o AS msg, meta->>'text' AS body, at
  FROM events WHERE p='posts'
  UNION ALL
  SELECT s AS msg, meta->>'text' AS body, at
  FROM events WHERE p='text_edit'
),
latest AS (
  SELECT msg, body, MAX(at) AS at
  FROM bodies GROUP BY msg
)
SELECT * FROM latest;
```

## 3. Change Task Status

Add another status event.

```json
{ "id":"E/9100","s":"K/T-30","p":"status","o":"in_review","at":"2025-09-26T15:20:00Z","meta":{"reason":"awaiting design signoff"} }
```

**View rule:** latest `status` per task wins.

```sql
SELECT s AS task, o AS status
FROM events
WHERE p='status' AND s LIKE 'K/%'
QUALIFY ROW_NUMBER() OVER (PARTITION BY s ORDER BY at DESC) = 1;
```

## 4. Reassign a Task

Emit a new `assigned_to` event.

```json
{ "id":"E/9110","s":"K/T-30","p":"assigned_to","o":"U/lee","at":"2025-09-26T15:30:00Z" }
```

**View rule:** latest assignment by `MAX(at)`.

## 5. Add or Remove Participants (DM/group)

**Add user**

```json
{ "id":"E/9200","s":"G/triad","p":"includes","o":"U/alex","at":"2025-09-26T14:00:00Z" }
```

**Remove user**

```json
{ "id":"E/9201","s":"G/triad","p":"excludes","o":"U/alex","at":"2025-09-26T16:00:00Z" }
```

**View rule:** members = `includes` minus later `excludes` for the same subject/object pair.

```sql
WITH inc AS (
  SELECT s AS thread, o AS user, MAX(at) AS at
  FROM events WHERE p='includes'
  GROUP BY 1,2
),
exc AS (
  SELECT s AS thread, o AS user, MAX(at) AS at
  FROM events WHERE p='excludes'
  GROUP BY 1,2
)
SELECT inc.thread, inc.user
FROM inc
LEFT JOIN exc
  ON exc.thread = inc.thread
 AND exc.user   = inc.user
 AND exc.at     > inc.at
WHERE exc.user IS NULL;
```

## 6. Re-route a Message (move from #design to #general)

Add another `addresses` event rather than changing the original.

```json
{ "id":"E/9300","s":"M/0042","p":"addresses","o":"C/general","at":"2025-09-26T16:10:00Z","meta":{"reason":"broader visibility"} }
```

**View choices:**

- **Current location:** take the latest `addresses` by `at`.
- **Audit:** list all `addresses` events ordered by `at`.

## 7. Delete / Undo

### Tombstone Event

```json
{ "id":"E/9400","s":"M/0042","p":"tombstone","o":"deleted","at":"2025-09-26T16:30:00Z","meta":{"by":"U/alex"} }
```

Views drop any message with a later tombstone.

### Supersede Event

```json
{ "id":"E/9401","s":"M/0042","p":"superseded_by","o":"M/0043","at":"2025-09-26T16:31:00Z" }
```

Views redirect consumers to `M/0043`.

## 8. Correct Bad Data (late arrival or wrong value)

Keep the erroneous event and add a correction with the true `at`.

```json
{ "id":"E/9500","s":"K/T-30","p":"status_correction","o":"in_review","at":"2025-09-26T15:20:00Z","meta":{"fixes":"E/9100"} }
```

**View rule:** prefer `status_correction` where the `meta.fixes` points to an earlier event or the `at` matches.

## 9. Context (ground) Changes

Retag context by emitting a new ground mapping rather than rewriting history.

```json
{ "id":"E/9600","s":"GND/sprint-19","p":"includes_events_from","o":"GND/sprint-18","at":"2025-10-01","meta":{"range":"2025-09-30..2025-10-03"} }
```

Views that filter by ground can follow these mappings.

## 10. Useful Indexes

Create the following indexes for responsive queries:

- `(p, o, at)` — locate everything addressing a channel/thread.
- `(s, p, at)` — read the latest status, title, or assignment per subject.
- `(ground, at)` — filter by sprint/policy/time window.
- Optional: unique index on `meta->>'nonce'` for idempotency guarantees.

## 11. SQLite Schema

A minimal schema that supports the event log today:

```sql
CREATE TABLE events (
  id          TEXT PRIMARY KEY,
  s           TEXT NOT NULL,
  p           TEXT NOT NULL,
  o           TEXT NOT NULL,
  at          TEXT NOT NULL,
  recorded_at TEXT NOT NULL DEFAULT (datetime('now')),
  ground      TEXT,
  meta        TEXT
);

CREATE INDEX idx_spa ON events (s, p, at);
CREATE INDEX idx_poa ON events (p, o, at);
CREATE INDEX idx_at  ON events (at);
```

**Insert = Update**

```sql
INSERT OR IGNORE INTO events (id, s, p, o, at, ground, meta)
VALUES (
  'E/9100',
  'K/T-30',
  'status',
  'in_review',
  '2025-09-26T15:20:00Z',
  '["GND/sprint-18"]',
  '{"reason":"awaiting design"}'
);
```

## 12. Materializing Current State

Keep baseline logic in SQL views and materialize when necessary for speed.

```sql
CREATE VIEW current_task_status AS
SELECT s AS task, o AS status
FROM events
WHERE p='status'
QUALIFY ROW_NUMBER() OVER (PARTITION BY s ORDER BY at DESC) = 1;
```

For heavier workloads, schedule a job that hydrates a `task_state` table (task, status, assigned_to, updated_at) from the event stream.

## 13. Practical Testing Checklist

1. **Idempotency:** inserting the same logical update twice should not duplicate state.
2. **Ordering:** replay events out of order and ensure views pick the correct `MAX(at)` record.
3. **Late events:** send an older `at` after a newer one and confirm the views surface the latest truth.
4. **Soft delete:** verify tombstoned content is hidden from primary views but retained for history.
5. **Ground filters:** add/remove context tags and confirm scoping logic works.

---

Start in SQLite with this EO carrier. When queries need deeper graph traversal or advanced analytics, project the same events into another read model (search index, graph store, etc.) without changing the append-only log.
