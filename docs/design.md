# Step Counter API — Design Doc

Backend for the Flutter app in this repo. Scope is driven directly by what
the app currently does: [user_store.dart](../lib/data/user_store.dart) (auth
+ profile), [dummy_steps.dart](../lib/data/dummy_steps.dart) (goal/today/history),
[dummy_notifications.dart](../lib/data/dummy_notifications.dart) (notification
list), [step_goal_calculator.dart](../lib/data/step_goal_calculator.dart)
(recommended-goal math, stays client-side — see below).

Stack: **NestJS + TypeORM + PostgreSQL**, as requested.

## 1. Naming convention: snake_case everywhere

Rather than adding a case-conversion layer (interceptor, naming strategy
package, `class-transformer` `@Expose` mapping), every TypeScript property —
in entities, DTOs, and response types — is written in `snake_case` directly.
TypeScript doesn't care about casing; only the lint convention does, and we're
overriding it here on purpose.

Effect: the DB column name, the JSON wire field, and the TS property name are
always the *same string*. No mapping code to write, test, or get out of sync.

```ts
// user.entity.ts
@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  full_name: string;

  @Column({ unique: true })
  email: string;

  @Column()
  password_hash: string;

  @Column({ nullable: true })
  age: number;

  @Column({ nullable: true })
  gender: string;

  @Column({ type: 'numeric', nullable: true })
  height_cm: number;

  @Column({ type: 'numeric', nullable: true })
  weight_kg: number;

  @Column({ default: 8000 })
  daily_goal_steps: number;

  @Column({ default: 'user' })
  role: 'user' | 'admin';

  @Column({ default: true })
  is_active: boolean;

  @Column({ nullable: true })
  last_login_at: Date;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
```

On the Flutter side, `UserStore`'s `Map<String, String>` already uses the same
keys (`name`→rename to `full_name`, `email`, `height`, `weight`, `age`,
`gender` — see §5). Model classes built on top of the API responses
(`json['full_name']`, `json['step_count']`, etc.) should read fields by these
exact snake_case keys — no `fromJson` remapping needed either.

## 2. Data model

Four tables. No `goals` table — the active goal is a column on `users`
(there's only ever one active goal per user, per `edit_goal_screen.dart`).
No separate `admins` table either — an admin is just a `users` row with
`role = 'admin'`, so admin login reuses the same `/auth/login` and JWT
instead of a second auth system (see §7).

```
users
  id                uuid pk
  full_name         text
  email             text unique
  password_hash     text
  age               int null
  gender            text null
  height_cm         numeric null
  weight_kg         numeric null
  daily_goal_steps  int default 8000
  role              text default 'user'   -- 'user' | 'admin'
  is_active         boolean default true  -- admin can disable an account
  last_login_at     timestamptz null
  created_at        timestamptz
  updated_at        timestamptz

step_entries
  id           uuid pk
  user_id      uuid fk -> users.id
  entry_date   date
  step_count   int
  created_at   timestamptz
  updated_at   timestamptz
  unique(user_id, entry_date)

notifications
  id          uuid pk
  user_id     uuid fk -> users.id
  title       text
  body        text
  type        text  -- 'achievement' | 'reminder' | 'summary'
  created_at  timestamptz

password_reset_tokens
  id          uuid pk
  user_id     uuid fk -> users.id
  token_hash  text
  expires_at  timestamptz
  used_at     timestamptz null
```

`notifications.time` (the "2h ago" string in the dummy data) is **not**
stored — that's a presentation concern. The API returns `created_at` as an
ISO timestamp; the app formats it as relative time (there are Flutter
packages for this, or a five-line helper — not a backend job).

Use TypeORM migrations, not `synchronize: true`, once there's a real
database — `synchronize` is fine for local dev only.

## 3. Modules

```
src/
  auth/          register, login, forgot/reset password, JWT strategy
  users/         profile read/update, goal update
  steps/         today, sync, history
  notifications/ list
  admin/         dashboard stats, user management
  common/        global exception filter, JWT auth guard, admin guard
```

One module per resource, matching the existing screen groupings. No
separate `goals` module — it's two endpoints on `users`.

## 4. Endpoints

All routes except `/auth/*` require `Authorization: Bearer <jwt>`.

### Auth
| Method | Path | Body | Notes |
|---|---|---|---|
| POST | `/auth/register` | `{ full_name, email, password }` | returns `{ access_token, user }` |
| POST | `/auth/login` | `{ email, password }` | returns `{ access_token, user }` |
| POST | `/auth/forgot-password` | `{ email }` | always 200, even if email unknown (no user enumeration) |
| POST | `/auth/reset-password` | `{ token, new_password }` | consumes the reset token |

JWT: 7-day expiry, no refresh-token flow for v1 — one more table and rotation
logic the app doesn't need yet. Add it if silent re-auth becomes a real
requirement. The JWT payload carries `{ sub: user_id, role }` — the admin
guard (§7) checks `role` from the token, no extra DB lookup per request.
`/auth/login` also stamps `last_login_at = now()` and rejects with 403 if
`is_active = false`.

### Users
| Method | Path | Body | Notes |
|---|---|---|---|
| GET | `/users/me` | — | full profile |
| PATCH | `/users/me` | `{ age?, gender?, height_cm?, weight_kg? }` | body_details / profile screens |
| PATCH | `/users/me/goal` | `{ daily_goal_steps }` | edit_goal_screen |

No `GET /users/me/goal/recommended` endpoint —
`calculateRecommendedSteps()` is a pure function of `age`/`height_cm`/`weight_kg`
the app already has locally; shipping it to the server and back is a round
trip for arithmetic. Keep it client-side.

### Steps
| Method | Path | Body | Notes |
|---|---|---|---|
| GET | `/steps/today` | — | `{ goal: daily_goal_steps, today: step_count }` |
| POST | `/steps/sync` | `{ entry_date, step_count }` | upsert on `(user_id, entry_date)` — device pushes its pedometer count periodically |
| GET | `/steps/history?days=30` | — | `[{ entry_date, step_count }, ...]` |

### Notifications
| Method | Path | Notes |
|---|---|---|
| GET | `/notifications` | list, newest first |

Nothing generates notification rows server-side yet (no cron, no push) —
that's a deliberate gap, see §6.

### Admin

Requires `role = 'admin'` on the JWT (`AdminGuard`, see §7). This is a
*separate* consumer of the same API — a small internal web dashboard, not
the Flutter app — so these routes return aggregate/list data, not anything
scoped to "the current user".

| Method | Path | Notes |
|---|---|---|
| GET | `/admin/overview` | headline numbers, see below |
| GET | `/admin/users?page=&limit=&search=` | paginated user list |
| GET | `/admin/users/:id` | one user's profile + their last 30 days of `step_entries` |
| PATCH | `/admin/users/:id` | `{ is_active }` — enable/disable an account |
| GET | `/admin/stats/signups?days=30` | `[{ date, count }]`, daily new-user counts for a chart |
| GET | `/admin/stats/steps?days=30` | `[{ date, total_steps, active_users }]`, daily aggregate across all users |

`GET /admin/overview` response — the "how many users are logging in and
other things" numbers, computed with straight aggregate SQL queries
(`COUNT`, `SUM`, `AVG`) against `users`/`step_entries`, no separate
analytics store:

```jsonc
{
  "total_users": 1042,
  "new_users_today": 6,
  "new_users_7d": 41,
  "new_users_30d": 210,
  "active_users_7d": 388,   // users with >=1 step_entries row in last 7 days
  "active_users_30d": 701,
  "total_steps_logged": 812345000,   // all-time sum(step_count)
  "avg_daily_steps_7d": 6210,
  "goal_completion_rate_7d": 0.34    // share of (user, day) rows meeting that user's daily_goal_steps
}
```

"Active" is defined as *has a `step_entries` row for that day* — the app
already syncs steps via `POST /steps/sync`, so this needs no new tracking
table (no separate `login_events`/analytics pipeline). If you later want
"opened the app" rather than "synced steps" as the activity signal, add a
one-line update-`last_login_at`-on-token-refresh instead of standing up an
events table.

There's no public signup for admin accounts — `/auth/register` always
creates `role = 'user'`. Create the first admin by hand (`UPDATE users SET
role = 'admin' WHERE email = '...'`) or a one-off seed script; add an
"invite admin" endpoint only if there's more than one admin operator doing
this regularly.

## 5. App-side changes needed

- `UserStore`'s `'name'` key → rename to `full_name` to match the wire
  format (trivial rename, done once).
- Replace `UserStore`'s in-memory list + `currentUser` map with real HTTP
  calls to the endpoints above, storing the returned `access_token`
  (`flutter_secure_storage` — already the standard choice, no need to hand-roll
  token storage).
- `StepData.load()` becomes `GET /steps/today` + `GET /steps/history`; the
  pedometer reading itself already happens on-device and now also
  `POST`s to `/steps/sync` on an interval instead of just holding state
  in memory.
- `loadDummyNotifications()` becomes `GET /notifications`; format
  `created_at` as relative time in the widget instead of trusting a
  server-supplied string.

## 6. Other services required

- **PostgreSQL** — given.
- **Transactional email** (SMTP/API) — required for
  `/auth/forgot-password` to actually send a reset link. Currently
  `UserStore.resetPassword` just mutates a map with no email step at all.
  Pick one: **Resend** or **AWS SES** are the least setup for a small app;
  wire it through `nodemailer` or the provider's SDK, no need for a queue
  in front of it at this volume.
- **Nothing else is required for what the app currently does.** Specifically
  *not* needed yet:
  - Redis — no session store, no cache, no rate-limit volume that
    `@nestjs/throttler`'s in-memory store can't handle at this scale.
  - Push notifications (FCM/APNs) — the notifications screen is a pull-based
    list (`GET /notifications`); add FCM only when there's an actual
    requirement to wake the app in the background.
  - Object storage (S3/Cloudinary) — profile screen shows an initial letter,
    not an uploaded avatar. Add when avatar upload becomes a real feature.
  - A job scheduler (`@nestjs/schedule`) — nothing runs on a timer server-side
    yet; the "weekly summary" notification text can be computed on read
    instead of pre-generated.
  - A separate analytics/BI tool (Metabase, PostHog, etc.) — `/admin/overview`
    covers the numbers actually asked for with plain SQL aggregates. Reach
    for one of these only if the admin panel grows past a handful of
    dashboard queries.
- **Admin panel frontend** isn't a Nest concern — it's a separate small app
  (a React/Next admin dashboard is the usual choice) that calls this same
  API with an admin-role JWT. No server-side template rendering needed here.

## 7. Cross-cutting

- **Validation**: `class-validator` DTOs + a global `ValidationPipe({ whitelist: true })`.
- **Password hashing**: `bcrypt`.
- **Auth**: `@nestjs/jwt` + `passport-jwt`, one `JwtAuthGuard` applied globally
  with `@Public()` on the four `/auth/*` routes, plus an `AdminGuard`
  (checks `role === 'admin'` on the decoded JWT) applied to the `admin/`
  module only.
- **Config**: `@nestjs/config`, `.env` with `DATABASE_URL`, `JWT_SECRET`,
  `JWT_EXPIRES_IN`, `RESET_TOKEN_TTL_MIN`, email provider creds.
- **Errors**: one global exception filter returning
  `{ status_code, message, error }` — snake_case, consistent with everything
  else.

## 8. Amendments made during implementation

- `bcrypt` → `bcryptjs`: the native `bcrypt` package needs a build step this
  environment blocks by default; `bcryptjs` is pure JS, same API.
- Real foreign keys added: `step_entries.user_id`, `notifications.user_id`,
  and `password_reset_tokens.user_id` all reference `users.id` with
  `ON DELETE CASCADE` — the doc's schema listed these as `fk` but the entities
  originally only had plain `uuid` columns with no DB-level constraint.
- `GET /steps/report?days=N` (see below) — a personal rolling-window report,
  added after the doc's original scope; not in §4's table above.
- `AuthService.forgotPassword` now catches email-send failures instead of
  letting them 500 the request — with no `RESEND_API_KEY` configured (or if
  Resend is briefly down), the endpoint must still return its generic
  message per this doc's own "always 200" requirement. Found by the
  automated API test suite (§9), not by manual testing.

## 9. Testing

`docs/postman/` holds a Postman collection + environment covering every
endpoint, happy path and negative cases (auth failures, validation errors,
403/404s, upsert/idempotency, the disable-blocks-login rule). Run it
headlessly with Newman via `npm run test:api` — see `scripts/test-api.sh`.
Admin routes need a `role='admin'` row, which no endpoint grants by design
(§4), so the script promotes the user created in its own first stage
directly in Postgres before running the Admin folder. No Jest/Supertest
suite is maintained for this API; black-box HTTP tests against a real
Postgres were judged sufficient for this project's size — see that script's
comment and the plan doc for why.

Each run writes `reports/api-test-report.md` (gitignored, regenerated every
run): a request-by-request flow with per-assertion ✓/✗, a summary table with
request- and assertion-level pass percentages, and a failures section with
the actual assertion error when something breaks. `scripts/generate-report.js`
merges Newman's `--reporter-json-export` output from both stages into that
one file; the script exits non-zero if anything failed, so it's ready to
gate CI later without changes.
