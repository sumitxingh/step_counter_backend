# Step Counter API Reference

For frontend/app integration. Reflects the actual implementation as of this
writing — see `docs/design.md` for the rationale behind these choices and
`docs/postman/` for a runnable collection covering every case below.

## Conventions

- **Base URL**: `http://localhost:3000` in local dev (configurable via `PORT`).
- **All fields are `snake_case`** — on the wire, in request bodies, everywhere. No camelCase anywhere in this API.
- **Auth header**: every route except the four under `/auth/*` requires `Authorization: Bearer <access_token>`.
- **Content type**: send `Content-Type: application/json` on every request with a body.
- **Dates**: `created_at` / `updated_at` / `last_login_at` are ISO 8601 timestamps (`2026-08-21T16:12:25.796Z`). `entry_date` is a plain date string (`2026-08-21`), no time component.
- **Unknown fields are silently dropped**, not rejected — the API strips any field in a request body that isn't in that endpoint's schema rather than erroring. A typo'd field name won't produce a 400; it just won't be saved. Double-check field names against this doc if something isn't taking effect.
- **`password_hash` is never returned** on any user object, anywhere.
- **Pagination/window params** (`page`, `limit`, `days`) are query strings, not body fields, and are optional with the defaults noted per endpoint.

### Error shape

Every non-2xx response has this shape:

```jsonc
{
  "status_code": 400,
  "message": "Invalid credentials",       // string, or string[] for validation errors
  "error": "BAD_REQUEST"
}
```

Validation errors (`400`) return `message` as an **array** of human-readable strings, one per failed rule — e.g. `["email must be an email", "password must be longer than or equal to 8 characters"]`. Every other error returns `message` as a single string.

| status_code | error | when |
|---|---|---|
| 400 | `BAD_REQUEST` | request body failed validation |
| 401 | `UNAUTHORIZED` | missing/invalid/expired token, or wrong login credentials |
| 403 | `FORBIDDEN` | valid token but insufficient role (non-admin hitting `/admin/*`), or account `is_active = false` at login |
| 404 | `NOT_FOUND` | resource doesn't exist (e.g. `/admin/users/:id` for an unknown id) |
| 409 | `CONFLICT` | e.g. registering an email that's already in use |

---

## Auth

None of these need a token. `full_name`/`email`/`password` fields are required unless marked optional.

### `POST /auth/register`

**Request**
```json
{
  "full_name": "Jane Doe",
  "email": "jane@example.com",
  "password": "password123"
}
```
`password` must be ≥ 8 characters.

**Response** `201`
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "39d76e58-4557-45e8-8e54-fd6d1535e384",
    "full_name": "Jane Doe",
    "email": "jane@example.com",
    "age": null,
    "gender": null,
    "height_cm": null,
    "weight_kg": null,
    "daily_goal_steps": 8000,
    "role": "user",
    "is_active": true,
    "last_login_at": null,
    "created_at": "2026-08-21T16:12:25.796Z",
    "updated_at": "2026-08-21T16:12:25.796Z"
  }
}
```

**Errors**: `400` invalid payload · `409` email already registered

Store `access_token` (secure storage on mobile — e.g. `flutter_secure_storage`) and send it as `Authorization: Bearer <token>` on every subsequent request. Token expires in 7 days; there is no refresh flow — re-login when it expires.

---

### `POST /auth/login`

**Request**
```json
{
  "email": "jane@example.com",
  "password": "password123"
}
```

**Response** `201` — same shape as Register's response. `last_login_at` is stamped on every successful login.

**Errors**: `401` wrong email/password (same error for both — don't reveal which one was wrong) · `403` account disabled (`is_active = false`, admin-only action)

---

### `POST /auth/forgot-password`

**Request**
```json
{ "email": "jane@example.com" }
```

**Response** `201` — **always the same response, whether or not the email exists**, to avoid leaking which emails are registered:
```json
{ "message": "If that email exists, a reset link has been sent" }
```

If the email exists, a reset token is emailed to it (link/code — check with the email template once one exists) and expires after `RESET_TOKEN_TTL_MIN` (30 min in local dev). There's no way to check reset-token status from the client — the UI should just say "check your email" regardless of this response.

---

### `POST /auth/reset-password`

**Request**
```json
{
  "token": "the-token-from-the-email",
  "new_password": "newpassword123"
}
```
`new_password` must be ≥ 8 characters.

**Response** `201`
```json
{ "message": "Password reset successful" }
```

**Errors**: `401` token invalid, expired, or already used

---

## Users

All require `Authorization: Bearer <token>`. There is no `:id` param — these always act on the logged-in user, derived from the token.

### `GET /users/me`

**Response** `200` — full profile (same `user` shape as Register/Login, without the wrapping `access_token`/`user` keys — the object *is* the user):
```json
{
  "id": "39d76e58-4557-45e8-8e54-fd6d1535e384",
  "full_name": "Jane Doe",
  "email": "jane@example.com",
  "age": 28,
  "gender": "female",
  "height_cm": 165,
  "weight_kg": 60,
  "daily_goal_steps": 8000,
  "role": "user",
  "is_active": true,
  "last_login_at": "2026-08-21T16:13:57.321Z",
  "created_at": "2026-08-21T16:12:25.796Z",
  "updated_at": "2026-08-21T16:13:57.323Z"
}
```

---

### `PATCH /users/me`

Updates profile fields. All optional — send only what changed.

**Request**
```json
{
  "age": 28,
  "gender": "female",
  "height_cm": 165,
  "weight_kg": 60
}
```
`gender` is a free-text string — the API doesn't constrain it to an enum, so send whatever the app's picker uses.

**Response** `200` — full updated user object, same shape as `GET /users/me`.

**Errors**: `400` if `age`/`height_cm`/`weight_kg` are sent but aren't numbers

---

### `PATCH /users/me/goal`

**Request**
```json
{ "daily_goal_steps": 10000 }
```
Must be an integer ≥ 1.

**Response** `200` — full updated user object.

**Errors**: `400` if missing, non-integer, or < 1

> **Note:** there is no `/users/me/goal/recommended` endpoint. The "recommended daily steps from your height/weight/age" calculation is deliberately client-side — it's pure arithmetic the app already computes locally (per the design doc), so there's no server round-trip for it. Compute it on-device and `PATCH` the result here.

---

## Steps

All require `Authorization: Bearer <token>`, all act on the logged-in user.

### `GET /steps/today`

**Response** `200`
```json
{ "goal": 8000, "today": 4200 }
```
`goal` is the user's current `daily_goal_steps`. `today` is `0` if nothing has been synced yet today.

---

### `POST /steps/sync`

Upserts a step count for a given date — safe to call repeatedly for the same `entry_date` (e.g. the device pushing an updated running total every few minutes). The **latest value for a date always wins**; it does not add to the previous value.

**Request**
```json
{
  "entry_date": "2026-08-21",
  "step_count": 4200
}
```
`entry_date` must be `YYYY-MM-DD`. `step_count` must be an integer ≥ 0.

**Response** `201` — the resulting row:
```json
{
  "id": "2451c88d-3c60-41df-aa91-965227340385",
  "user_id": "39d76e58-4557-45e8-8e54-fd6d1535e384",
  "entry_date": "2026-08-21",
  "step_count": 4200,
  "created_at": "2026-08-21T16:12:25.941Z",
  "updated_at": "2026-08-21T16:12:25.941Z"
}
```
On a repeat sync for the same date, `id` and `created_at` stay the same; `step_count` and `updated_at` change.

**Errors**: `400` bad date format or negative step_count

---

### `GET /steps/history?days=30`

**Query params**: `days` (optional, default `30`) — how many days back to include, rolling window from today.

**Response** `200` — newest first:
```json
[
  { "entry_date": "2026-08-21", "step_count": 4200 },
  { "entry_date": "2026-08-20", "step_count": 6100 }
]
```
Only dates with a synced entry appear — no zero-filled gaps for missing days.

---

### `GET /steps/report?days=7`

Rolling-window summary — use `days=7` for "this week" and `days=30` for "this month" (or any custom window).

**Query params**: `days` (optional, default `7`)

**Response** `200`
```json
{
  "period_days": 7,
  "days_logged": 5,
  "total_steps": 28400,
  "avg_daily_steps": 5680
}
```
- `days_logged` — how many of the `period_days` actually have a synced entry (not the full window size).
- `avg_daily_steps` — `total_steps / days_logged`, rounded. This averages over days *with data*, not the full period, so it won't be dragged down by days with no sync.
- If nothing was synced in the window, `days_logged` and `total_steps` are `0` and `avg_daily_steps` is `0`.

---

## Notifications

Requires `Authorization: Bearer <token>`.

### `GET /notifications`

**Response** `200` — newest first:
```json
[
  {
    "id": "b1f2...",
    "user_id": "39d76e58-4557-45e8-8e54-fd6d1535e384",
    "title": "Goal reached!",
    "body": "You hit 10,000 steps today.",
    "type": "achievement",
    "created_at": "2026-08-21T09:00:00.000Z"
  }
]
```
`type` is one of `"achievement" | "reminder" | "summary"`.

> **Important for the app team:** nothing generates notification rows server-side yet — no cron job, no push, no automatic "goal reached" trigger. This endpoint will return `[]` for every user right now. It's wired up and ready, but there's no producer yet. Don't build UI that assumes a steady stream of notifications until that's in place — flag if this blocks a screen you're building.
>
> There's also no `created_at` → relative-time ("2h ago") formatting from the server — format that client-side from the ISO timestamp.

---

## Admin

Requires `Authorization: Bearer <token>` **where the token's user has `role: "admin"`**. There is no signup flow for admin accounts — they're promoted by hand in the database. A non-admin token gets `403` on every route below.

This is meant for an internal admin dashboard, not the consumer app — these endpoints return cross-user aggregate/list data, not anything scoped to "the current user".

### `GET /admin/overview`

**Response** `200`
```json
{
  "total_users": 1042,
  "new_users_today": 6,
  "new_users_7d": 41,
  "new_users_30d": 210,
  "active_users_7d": 388,
  "active_users_30d": 701,
  "total_steps_logged": 812345000,
  "avg_daily_steps_7d": 6210,
  "goal_completion_rate_7d": 0.34
}
```
- "Active" = synced at least one `step_entries` row in that window.
- `avg_daily_steps_7d` averages over logged entries in the last 7 days (across all users), not per-user.
- `goal_completion_rate_7d` — fraction (`0`–`1`) of (user, day) rows in the last 7 days that meet that user's **current** `daily_goal_steps` (there's no goal-history table, so a user who recently raised their goal will show past days as "missed" against the new, higher target).

---

### `GET /admin/users?page=1&limit=20&search=`

**Query params**: `page` (default `1`), `limit` (default `20`), `search` (optional — matches against `full_name` or `email`, case-insensitive substring)

**Response** `200`
```json
{
  "items": [ /* array of full user objects, same shape as GET /users/me */ ],
  "total": 1042,
  "page": 1,
  "limit": 20
}
```
Sorted newest-registered first.

---

### `GET /admin/users/:id`

**Response** `200` — the user's profile plus their last 30 days of step entries:
```json
{
  "id": "...",
  "full_name": "Jane Doe",
  "...": "...same fields as GET /users/me...",
  "step_entries": [
    { "entry_date": "2026-08-21", "step_count": 4200 }
  ]
}
```

**Errors**: `404` if `:id` doesn't exist

---

### `PATCH /admin/users/:id`

The only admin write. Enables/disables an account.

**Request**
```json
{ "is_active": false }
```

**Response** `200` — full updated user object.

Disabling a user does **not** invalidate their existing token — a token issued before disabling keeps working for any request until it expires (role/is_active aren't re-checked per-request, only at login). It does block their next `/auth/login` attempt with a `403`.

**Errors**: `404` if `:id` doesn't exist

---

### `GET /admin/stats/signups?days=30`

**Query params**: `days` (default `30`)

**Response** `200` — one entry per day that had ≥1 signup (no zero-filled gaps), oldest first:
```json
[
  { "date": "2026-08-20", "count": 3 },
  { "date": "2026-08-21", "count": 6 }
]
```

---

### `GET /admin/stats/steps?days=30`

**Query params**: `days` (default `30`)

**Response** `200` — one entry per day that had ≥1 sync (no zero-filled gaps), oldest first:
```json
[
  { "date": "2026-08-20", "total_steps": 812345, "active_users": 140 },
  { "date": "2026-08-21", "total_steps": 903221, "active_users": 152 }
]
```
`total_steps` sums `step_count` across all users for that date. `active_users` counts distinct users who synced that date.

---

## Quick reference

| Method | Path | Auth | Body |
|---|---|---|---|
| POST | `/auth/register` | – | `full_name, email, password` |
| POST | `/auth/login` | – | `email, password` |
| POST | `/auth/forgot-password` | – | `email` |
| POST | `/auth/reset-password` | – | `token, new_password` |
| GET | `/users/me` | user | – |
| PATCH | `/users/me` | user | `age?, gender?, height_cm?, weight_kg?` |
| PATCH | `/users/me/goal` | user | `daily_goal_steps` |
| GET | `/steps/today` | user | – |
| POST | `/steps/sync` | user | `entry_date, step_count` |
| GET | `/steps/history?days=` | user | – |
| GET | `/steps/report?days=` | user | – |
| GET | `/notifications` | user | – |
| GET | `/admin/overview` | admin | – |
| GET | `/admin/users?page=&limit=&search=` | admin | – |
| GET | `/admin/users/:id` | admin | – |
| PATCH | `/admin/users/:id` | admin | `is_active` |
| GET | `/admin/stats/signups?days=` | admin | – |
| GET | `/admin/stats/steps?days=` | admin | – |
