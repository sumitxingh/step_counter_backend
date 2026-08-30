# App API — Frontend Integration Guide

For the **consumer app** (Flutter). Covers every endpoint the app uses: auth,
profile, goal, steps and notifications. Every shape and quirk below is taken from
the running code, not paraphrased.

Companion to [`api.md`](./api.md); the browsable reference is served by the
backend at `GET /docs`.

- **Base URL**: `http://localhost:3000` in local dev (`PORT` env).
- **CORS**: open to all origins right now.
- Send `Content-Type: application/json` on every request with a body.
- Everything is `snake_case`, on the wire and in bodies.

---

## 1. Conventions that apply to every endpoint

### Auth header

Every route **except the four `/auth/*` routes** needs:

```
Authorization: Bearer <access_token>
```

Missing / malformed / expired token → `401`:
```json
{ "status_code": 401, "message": "Unauthorized", "error": "UNAUTHORIZED" }
```
On any `401`, drop the stored token and send the user to login. The JWT expires
in **7 days** (`JWT_EXPIRES_IN`, default `7d`) and there is **no refresh flow** —
re-login is the only recovery.

### Error shape

```jsonc
{
  "status_code": 400,
  "message": "Invalid credentials",   // string — EXCEPT 400 validation, which is string[]
  "error": "BAD_REQUEST"              // HttpStatus name for the code
}
```

Validation (`400`) returns `message` as an array, one entry per failed rule:
```json
{ "status_code": 400,
  "message": ["email must be an email", "password must be longer than or equal to 8 characters"],
  "error": "BAD_REQUEST" }
```
Show `message[0]` or join with newlines; everything else is a plain string.

| status | error | when |
|---|---|---|
| 400 | `BAD_REQUEST` | body failed validation |
| 401 | `UNAUTHORIZED` | bad/missing/expired token, or wrong login credentials |
| 403 | `FORBIDDEN` | disabled account at login |
| 404 | `NOT_FOUND` | resource doesn't exist |
| 409 | `CONFLICT` | email already registered |

### Other rules

- **Unknown body fields are silently dropped**, not rejected. A typo'd field
  name produces no error — it just doesn't take. Double-check names against this
  doc if a write "does nothing".
- `password_hash` is never in any response.
- Successful `POST` returns **`201`** (register, login, sync); `GET`/`PATCH`
  return `200`.
- Timestamps `created_at` / `updated_at` / `last_login_at` are ISO 8601
  (`2026-08-30T16:12:25.796Z`). `entry_date` is a plain date string
  (`2026-08-30`), no time.
- ⚠️ **`height_cm` and `weight_kg` come back as strings** (`"165.5"`), not
  numbers — they're `numeric` DB columns. Parse them: `double.parse(...)`.
  `age` and `daily_goal_steps` are real numbers.

---

## 2. The `user` object

Returned (as `user`) by register/login, and returned bare (the body *is* the
object) by `GET /users/me` and the two `PATCH` routes.

```ts
interface User {
  id: string;                    // uuid
  full_name: string;
  email: string;
  age: number | null;
  gender: string | null;         // free text — not an enum
  height_cm: string | null;      // numeric — arrives as a string
  weight_kg: string | null;      // numeric — arrives as a string
  daily_goal_steps: number;      // default 8000
  role: "user";                  // always "user" for app accounts
  is_active: boolean;
  last_login_at: string | null;  // ISO 8601
  created_at: string;            // ISO 8601
  updated_at: string;            // ISO 8601
}
```

---

## 3. Auth (`/auth/*` — no token)

### `POST /auth/register`

```json
{ "full_name": "Jane Doe", "email": "jane@example.com", "password": "password123" }
```
- `password` ≥ 8 chars. `email` must be a valid email. `full_name` is only
  checked as a string — an empty string passes, so validate non-empty in the app.

**`201`** → `{ "access_token": "eyJ…", "user": { …User… } }`

**Errors**: `400` invalid payload · `409` `"Email already registered"`

Store `access_token` in secure storage (`flutter_secure_storage`). Send it as
`Authorization: Bearer <token>` on every later request.

### `POST /auth/login`

```json
{ "email": "jane@example.com", "password": "password123" }
```

**`201`** → same `{ access_token, user }` shape. `last_login_at` is stamped on
every success.

**Errors**:
- `401` `"Invalid credentials"` — wrong email **or** wrong password (identical
  message for both by design; don't tell the user which).
- `403` `"Account is disabled"` — this account has been disabled. Not fixable by
  the user; show a "contact support" message.

### `POST /auth/forgot-password`

```json
{ "email": "jane@example.com" }
```

**`201`** — **always** the same body, whether or not the email exists (no
enumeration):
```json
{ "message": "If that email exists, a reset link has been sent" }
```
If the email exists, a reset token is emailed (TTL `RESET_TOKEN_TTL_MIN`, default
30 min). Email-send failures are swallowed server-side — the response never
changes. UI should just say "check your email".

### `POST /auth/reset-password`

```json
{ "token": "the-token-from-the-email", "new_password": "newpassword123" }
```
- `new_password` ≥ 8 chars.

**`201`** → `{ "message": "Password reset successful" }`

**Errors**: `401` `"Invalid or expired reset token"` — not found, already used,
or past its TTL. After success, send the user to login (no auto-login).

---

## 4. Profile & goal (`/users/*` — token; always the current user, no `:id`)

### `GET /users/me`
**`200`** → the bare `User` object (§2).

### `PATCH /users/me` — update profile
All fields optional; send only what changed:
```json
{ "age": 28, "gender": "female", "height_cm": 165, "weight_kg": 60 }
```
- `age`, `height_cm`, `weight_kg` must be numbers if present (`400` otherwise —
  message array). `gender` is any string.
- Only keys you send are touched. You **cannot clear** a field back to `null`
  this way — omitting it leaves it, and sending `null` fails validation.
- Send numeric values as JSON numbers even though they read back as strings.

**`200`** → the full updated `User`.

### `PATCH /users/me/goal` — update daily goal
```json
{ "daily_goal_steps": 10000 }
```
- Required. Must be an **integer ≥ 1** (`400` if missing / non-integer / `< 1`).

**`200`** → the full updated `User`.

> No `GET /users/me/goal/recommended` endpoint. The recommended-steps number is a
> pure client-side function of `age`/`height_cm`/`weight_kg`
> (`calculateRecommendedSteps()` / `step_goal_calculator.dart`). Compute it on
> device and `PATCH` the chosen value here.

---

## 5. Steps (`/steps/*` — token; current user)

> **Dates are computed server-side in UTC.** "Today" is
> `new Date().toISOString().slice(0,10)` on the server. Near local midnight the
> server's date can differ from the device's — send the device's local
> `entry_date` explicitly on sync, and expect `/steps/today` to key off UTC.

### `GET /steps/today`
**`200`** → `{ "goal": 8000, "today": 4200 }`
- `goal` = current `daily_goal_steps` (number).
- `today` = today's synced `step_count`, or `0` if nothing synced yet.

### `POST /steps/sync`
```json
{ "entry_date": "2026-08-30", "step_count": 4200 }
```
- `entry_date` an ISO date string (`YYYY-MM-DD`). `step_count` an integer ≥ 0.
- **Upsert** on `(user, entry_date)` — safe to call every few minutes with the
  running total. **The latest value wins; it does not add** to the previous.

**`201`** → the resulting row:
```json
{
  "id": "2451c88d-…",
  "user_id": "39d76e58-…",
  "entry_date": "2026-08-30",
  "step_count": 4200,
  "created_at": "2026-08-30T16:12:25.941Z",
  "updated_at": "2026-08-30T16:12:25.941Z"
}
```
On a repeat sync for the same date, `id` / `created_at` stay; `step_count` /
`updated_at` change.

**Errors**: `400` bad date format or negative `step_count`.

### `GET /steps/history?days=30`
- `days` optional, default `30`, rolling window (`entry_date >= today − days`, UTC).

**`200`** → newest first, **only days with a synced entry** (no zero-filled gaps):
```json
[ { "entry_date": "2026-08-30", "step_count": 4200 },
  { "entry_date": "2026-08-29", "step_count": 6100 } ]
```
Zero-fill missing days on the client if the chart needs a continuous axis.

### `GET /steps/report?days=7`
- `days` optional, default `7`. Use `7` for "this week", `30` for "this month".

**`200`**
```json
{ "period_days": 7, "days_logged": 5, "total_steps": 28400, "avg_daily_steps": 5680 }
```
- `days_logged` — how many of those days actually have an entry.
- `avg_daily_steps` = `round(total_steps / days_logged)` — averaged over days
  **with data**, so gaps don't drag it down. `0` when nothing was logged.
- `period_days` just echoes the `days` you passed (send a clean integer).

---

## 6. Notifications (`/notifications` — token; current user)

### `GET /notifications`
**`200`** → newest first:
```json
[
  {
    "id": "b1f2…",
    "user_id": "39d76e58-…",
    "title": "Goal reached!",
    "body": "You hit your 10,000-step goal. Nice work.",
    "type": "achievement",
    "created_at": "2026-08-30T09:00:00.000Z"
  }
]
```
`type` ∈ `"achievement" | "reminder" | "summary"`.

> ⚠️ **Nothing generates notifications at runtime yet** — no cron, no push, no
> "goal reached" trigger. In a live system this returns `[]` for every user. The
> only rows that exist today are the ones `npm run seed` inserts for the seeded
> users. Don't build a screen that assumes a steady feed; flag it if this blocks
> you.
>
> No server-side relative-time formatting — format `created_at` ("2h ago") on the
> client.

---

## 7. Screen-by-screen mapping

| Screen | Calls |
|---|---|
| Register / Login | `POST /auth/register` · `POST /auth/login` → store `access_token` |
| Forgot / reset password | `POST /auth/forgot-password` · `POST /auth/reset-password` |
| Home / dashboard | `GET /steps/today` (+ `GET /steps/report?days=7` for the week card) |
| Background step sync | `POST /steps/sync` every few min with the day's running total |
| History / charts | `GET /steps/history?days=30` · `GET /steps/report?days=30` — zero-fill client-side |
| Profile | `GET /users/me` · `PATCH /users/me` |
| Edit goal | `PATCH /users/me/goal` (recommended value computed on device) |
| Notifications | `GET /notifications` (expect `[]` outside seeded data) |

---

## 8. Seeded test accounts

`npm run seed` → test users, all `@yopmail.com`, password `password123`. These
have ~45 days of step history and 2–3 notifications each:

- `aarav.sharma@yopmail.com`, `diya.patel@yopmail.com`, `rohan.mehta@yopmail.com`,
  `isha.nair@yopmail.com`, `kabir.singh@yopmail.com`, `ananya.iyer@yopmail.com`,
  `meera.joshi@yopmail.com`
- `vivaan.reddy@yopmail.com` — seeded `is_active: false`, use it to see the `403`
  on login.

Read the inboxes at `https://yopmail.com/?<localpart>` (e.g. `?aarav.sharma`).

---

## 9. TypeScript types

```ts
export interface User {
  id: string;
  full_name: string;
  email: string;
  age: number | null;
  gender: string | null;
  height_cm: string | null;   // numeric — string on the wire
  weight_kg: string | null;   // numeric — string on the wire
  daily_goal_steps: number;
  role: "user";                  // always "user" for app accounts
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuthResponse { access_token: string; user: User }

export interface StepRow {
  id: string;
  user_id: string;
  entry_date: string;   // YYYY-MM-DD
  step_count: number;
  created_at: string;
  updated_at: string;
}

export interface TodayResponse { goal: number; today: number }
export interface HistoryPoint { entry_date: string; step_count: number }
export interface Report {
  period_days: number;
  days_logged: number;
  total_steps: number;
  avg_daily_steps: number;
}

export interface AppNotification {
  id: string;
  user_id: string;
  title: string;
  body: string;
  type: "achievement" | "reminder" | "summary";
  created_at: string;
}

export interface MessageResponse { message: string }

export interface ApiError {
  status_code: number;
  message: string | string[];
  error: string;
}
```
