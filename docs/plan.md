# Step Counter Backend — Build Plan

## Summary

Greenfield NestJS + TypeORM + Postgres API implementing `docs/design.md`
(register/login, profile + goal, step sync/history, notifications, admin
dashboard). Repo is currently a stock `nest new` scaffold — nothing built yet.
Snake_case is used everywhere on purpose (DB column = JSON field = TS
property, no mapping layer). Defaults assumed rather than blocked on: Resend
for email, a local Postgres already reachable via `DATABASE_URL`.

## Phase 1 — Foundation
Dependencies, config/bootstrap, entities, initial migration.
- `npm i @nestjs/config @nestjs/typeorm typeorm pg @nestjs/jwt @nestjs/passport passport passport-jwt bcrypt class-validator class-transformer resend` (+ `-D @types/passport-jwt @types/bcrypt`)
- `.env.example`: `DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN=7d`, `RESET_TOKEN_TTL_MIN`, `RESEND_API_KEY`
- `AppModule`: `ConfigModule.forRoot({ isGlobal: true })`, `TypeOrmModule.forRootAsync` off `DATABASE_URL`, `synchronize` only when `NODE_ENV !== 'production'`
- `main.ts`: global `ValidationPipe({ whitelist: true })`
- Entities: `User` (`users`), `StepEntry` (`step_entries`, unique `(user_id, entry_date)`), `Notification` (`notifications`), `PasswordResetToken` (`password_reset_tokens`)
- One TypeORM migration generated from the entities

## Phase 2 — Auth & guards
`common/` cross-cutting pieces, then `auth/`.
- `common/`: `JwtStrategy`, `@Public()` decorator, `JwtAuthGuard` as global `APP_GUARD`, `AdminGuard` (role check from JWT, no DB lookup), global exception filter → `{ status_code, message, error }`
- `auth/`: `POST /auth/{register,login,forgot-password,reset-password}`, all `@Public()`; bcrypt hashing; login stamps `last_login_at`, 403s on `is_active = false`; forgot-password hashes token into `password_reset_tokens`, emails raw token via Resend, always 200; `class-validator` DTOs

## Phase 3 — Core resource modules
`users/`, `steps/`, `notifications/` — all read `req.user.sub` from the JWT.
- `users/`: `GET /users/me`, `PATCH /users/me`, `PATCH /users/me/goal`
- `steps/`: `GET /steps/today`, `POST /steps/sync` (upsert on `(user_id, entry_date)`), `GET /steps/history?days=30`, `GET /steps/report?days=N` (rolling-window total/avg — `days=7` for weekly, `days=30` for monthly; added post-doc, see design.md §8)
- `notifications/`: `GET /notifications`, newest first, no write path yet

## Phase 4 — Admin module
`AdminGuard` at controller level.
- `overview`, `users` (paginated + search), `users/:id` (profile + last 30 days of steps), `PATCH users/:id` (`is_active`), `stats/signups`, `stats/steps` — all aggregate QueryBuilder queries, no new tables

## Phase 5 — Verification
- `npm run build` / `npm run lint` clean
- `npm run test:api` — full Postman/Newman suite (`docs/postman/`, `scripts/test-api.sh`), 35 requests / 72 assertions covering happy paths, auth/validation failures, upsert idempotency, and the disable-blocks-login rule. See design.md §9.

## Files touched (representative)
- `src/app.module.ts`, `src/main.ts`
- `src/users/user.entity.ts`, `src/steps/step-entry.entity.ts`, `src/notifications/notification.entity.ts`, `src/auth/password-reset-token.entity.ts`
- `src/common/guards/{jwt-auth,admin}.guard.ts`, `src/common/decorators/public.decorator.ts`, `src/common/filters/http-exception.filter.ts`
- `src/auth/{auth.module,auth.controller,auth.service,jwt.strategy}.ts` + `dto/*.ts`
- `src/users/`, `src/steps/`, `src/notifications/`, `src/admin/` — each `{module,controller,service}.ts`
- `.env.example`, `src/migrations/`

No Flutter app changes in this pass — that's follow-up work once the API is live.
