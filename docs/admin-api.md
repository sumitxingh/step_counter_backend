# Admin API — Frontend Integration Guide

For the internal **admin dashboard** (not the consumer app). Covers auth, every
`/admin/*` endpoint, the exact response shapes, the quirks that will bite during
integration, and a screen-by-screen mapping.

Companion to [`api.md`](./api.md) — conventions there (snake_case everywhere,
`Content-Type: application/json`, error shape, ISO timestamps) all apply here.

- **Base URL**: `http://localhost:3000` in local dev (`PORT` env).
- **CORS**: currently open to all origins.
- **Browsable reference**: the backend serves the full API doc at `GET /docs`.

---

## 1. Auth flow

There is **no admin signup**. An admin is a normal user row with `role: "admin"`,
promoted by hand in the DB (the seed creates one — see §7).

```
POST /auth/login  { "email", "password" }
      │
      ├─ 200/201 → { access_token, user }
      │             store access_token; check user.role === "admin"
      │             if not admin → sign out, show "not authorised" (do NOT send them to the app)
      │
      ├─ 401 → wrong email or password (same message for both)
      └─ 403 → account disabled (is_active = false)
```

- Send `Authorization: Bearer <access_token>` on **every** `/admin/*` request.
- Token is a JWT, **expires in 7 days, no refresh flow**. On a `401` from any
  admin call, treat the session as dead and route to login.
- The token payload carries `role`. Disabling an admin later does **not**
  invalidate an already-issued token — role/is_active are only checked at login.

### Two different failures — handle them separately

| Response | Meaning | UI |
|---|---|---|
| `401 UNAUTHORIZED` | missing / invalid / expired token | redirect to login |
| `403 FORBIDDEN` | valid token, but `role !== "admin"` (`message: "Admin access required"`) | "You don't have admin access" — a re-login won't fix it |

### Error shape (all endpoints)

```jsonc
{
  "status_code": 404,
  "message": "User not found",   // string; array of strings only for 400 validation errors
  "error": "NOT_FOUND"           // HttpStatus name for the code
}
```

`error` values you can get from `/admin/*`: `BAD_REQUEST` (400), `UNAUTHORIZED`
(401), `FORBIDDEN` (403), `NOT_FOUND` (404), `INTERNAL_SERVER_ERROR` (500 — see
the malformed-`:id` note in §4).

---

## 2. `GET /admin/overview` — dashboard summary

No params. Returns the top-of-dashboard KPI numbers.

**Response** `200`
```json
{
  "total_users": 9,
  "new_users_today": 0,
  "new_users_7d": 1,
  "new_users_30d": 4,
  "active_users_7d": 8,
  "active_users_30d": 8,
  "total_steps_logged": 2841320,
  "avg_daily_steps_7d": 7043,
  "goal_completion_rate_7d": 0.37
}
```

| Field | Type | Notes |
|---|---|---|
| `total_users` | int | all users incl. admins and disabled |
| `new_users_today` | int | since **server-local** midnight |
| `new_users_7d` / `new_users_30d` | int | rolling window — last 7×24h / 30×24h, **not** calendar days |
| `active_users_7d` / `active_users_30d` | int | distinct users with ≥1 step entry whose `entry_date` is in the window |
| `total_steps_logged` | int | sum of every `step_count` ever, all users, all time |
| `avg_daily_steps_7d` | int | `AVG(step_count)` over **entries** in the last 7 days (not per-user), rounded |
| `goal_completion_rate_7d` | float `0`–`1` | fraction of (user, day) entries in the last 7 days that met that user's **current** `daily_goal_steps` |

Quirks:
- Every numeric field is a real number and defaults to `0` — never `null`, never a string.
- `goal_completion_rate_7d` uses the user's *current* goal against *past* days (no
  goal-history table). Someone who just raised their goal shows past days as missed.
  Render it as a percentage: `Math.round(rate * 100) + "%"`.
- "7d" here is a rolling 168-hour window; `new_users_today` is a calendar-day
  count. They won't line up exactly — that's expected.

---

## 3. `GET /admin/users` — user list (paginated)

**Query params** (all optional, sent as query strings):

| Param | Default | Notes |
|---|---|---|
| `page` | `1` | 1-based |
| `limit` | `20` | no server-side max — send a sane value |
| `search` | – | case-insensitive substring, matches `full_name` **or** `email`. Empty string = no filter |

**Response** `200`
```json
{
  "items": [ /* full user objects, same shape as GET /users/me, no password_hash */ ],
  "total": 9,
  "page": 1,
  "limit": 20
}
```

- `items` sorted **newest-registered first** (`created_at DESC`).
- `total` is the count **after** the `search` filter — use it for pagination:
  `pageCount = Math.ceil(total / limit)`.
- `page` / `limit` are echoed back exactly as received (after `Number()` coercion).
- Each item is the complete user object:

```ts
interface AdminUser {
  id: string;                 // uuid
  full_name: string;
  email: string;
  age: number | null;
  gender: string | null;      // free text, not an enum
  height_cm: number | null;
  weight_kg: number | null;
  daily_goal_steps: number;
  role: "user" | "admin";
  is_active: boolean;
  last_login_at: string | null;  // ISO 8601
  created_at: string;            // ISO 8601
  updated_at: string;            // ISO 8601
}
```

Quirk: `page` / `limit` aren't validated. `?limit=abc` becomes `NaN` server-side
and the query misbehaves — always send positive integers.

---

## 4. `GET /admin/users/:id` — user detail + recent steps

`:id` is the user UUID from the list response.

**Response** `200` — the full `AdminUser` object **plus**:
```json
{
  "id": "…",
  "full_name": "Aarav Sharma",
  "…": "…all AdminUser fields…",
  "step_entries": [
    { "entry_date": "2026-08-29", "step_count": 11540 },
    { "entry_date": "2026-08-28", "step_count": 8090 }
  ]
}
```

- `step_entries`: last **30 days** only (`entry_date >= today − 30d`), **newest
  first**, just `entry_date` + `step_count`. Days with no sync are absent — no
  zero-fill. Zero-fill client-side if you're drawing a continuous chart.

**Errors**
- `404 NOT_FOUND` `"User not found"` — unknown (but well-formed) UUID.
- `500` — if `:id` is **not a valid UUID** (e.g. `/admin/users/foo`), Postgres
  rejects the cast before the not-found check runs. Only ever pass ids you got
  from `/admin/users`.

---

## 5. `PATCH /admin/users/:id` — enable / disable an account

The **only** admin write endpoint.

**Request**
```json
{ "is_active": false }
```

- `is_active` must be a real JSON boolean (`true` / `false`). The string
  `"false"` fails validation with `400` (`message` is a string array).
- Any other field in the body is silently dropped.

**Response** `200` — the full updated `AdminUser` object.

**Errors**: `400` bad/missing `is_active` · `404` unknown user.

Behaviour to reflect in the UI:
- Disabling does **not** kick the user immediately — their current token keeps
  working until it expires (up to 7 days). It only blocks their next
  `/auth/login` (they'll get `403`).
- So after disabling, show "disabled — will be locked out at next sign-in", not
  "user is now offline".
- Re-enabling (`is_active: true`) is immediate for the next login.

---

## 6. Stats endpoints (for charts)

Both take `days` (query, default `30`, rolling window) and return an array
**oldest-first** with **no zero-filled gaps** — only days that had activity
appear. For a continuous line/bar chart, build the full date range on the client
and fill missing days with `0`.

### `GET /admin/stats/signups?days=30`
```json
[
  { "date": "2026-08-12", "count": 1 },
  { "date": "2026-08-19", "count": 2 },
  { "date": "2026-08-25", "count": 1 }
]
```
`count` = users registered that day (server-local date).

### `GET /admin/stats/steps?days=30`
```json
[
  { "date": "2026-08-20", "total_steps": 214300, "active_users": 7 },
  { "date": "2026-08-21", "total_steps": 231870, "active_users": 8 }
]
```
`total_steps` = sum of `step_count` across all users for that `entry_date`.
`active_users` = distinct users who synced that date.

---

## 7. Screen-by-screen mapping

| Screen | Calls | Notes |
|---|---|---|
| **Login** | `POST /auth/login` | gate on `user.role === "admin"`; store `access_token` |
| **Dashboard home** | `GET /admin/overview` + `GET /admin/stats/signups?days=30` + `GET /admin/stats/steps?days=30` | fire in parallel; zero-fill the two series before charting |
| **Users list** | `GET /admin/users?page=&limit=&search=` | debounce `search` ~300ms; paginate off `total` |
| **User detail** | `GET /admin/users/:id` | header = profile fields; body = `step_entries` chart (zero-fill 30d) |
| **Enable / disable toggle** | `PATCH /admin/users/:id` `{ is_active }` | optimistic update ok; replace row with the returned object; show the "locks out at next login" caveat |

There is **no** endpoint to create another admin, edit a user's profile/goal
from admin, delete a user, or list all users' full step history — the surface
above is the whole admin API.

---

## 8. Seeded test data

`npm run seed` creates 9 users (`@yopmail.com`, password `password123`):

| Role | Email | Notes |
|---|---|---|
| admin | `priya.rao@yopmail.com` | use this to log into the dashboard |
| user | `aarav.sharma@yopmail.com` … 7 more | ~45 days of step history, 2–3 notifications each |
| user | `vivaan.reddy@yopmail.com` | seeded with `is_active: false` — good for testing the enable flow and the `403`-on-login |

Registrations are backdated across ~55 days so the signup chart and
`new_users_*` counts have real shape. Read the yopmail inboxes at
`https://yopmail.com/?<localpart>` (e.g. `?priya.rao`).

---

## 9. TypeScript types (copy into the frontend)

```ts
export interface AdminUser {
  id: string;
  full_name: string;
  email: string;
  age: number | null;
  gender: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  daily_goal_steps: number;
  role: "user" | "admin";
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminOverview {
  total_users: number;
  new_users_today: number;
  new_users_7d: number;
  new_users_30d: number;
  active_users_7d: number;
  active_users_30d: number;
  total_steps_logged: number;
  avg_daily_steps_7d: number;
  goal_completion_rate_7d: number; // 0..1
}

export interface AdminUserList {
  items: AdminUser[];
  total: number;
  page: number;
  limit: number;
}

export interface StepEntry {
  entry_date: string; // YYYY-MM-DD
  step_count: number;
}

export type AdminUserDetail = AdminUser & { step_entries: StepEntry[] };

export interface SignupPoint { date: string; count: number }
export interface StepPoint { date: string; total_steps: number; active_users: number }

export interface ApiError {
  status_code: number;
  message: string | string[];
  error: string;
}
```
