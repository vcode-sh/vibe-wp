# Control Panel — User Manager & Self-Service Profile

- Date: 2026-06-23
- Status: Approved design (ready for implementation plan)
- Surface: `control-panel/` (web + packages/auth)

## 1. Context (from audit)

Panel auth is **better-auth 1.6.20** with the `admin` plugin. Roles `viewer` /
`operator` / `admin` are defined once in `packages/auth/src/access.ts` and shared
with the browser via `web/src/lib/auth-client.ts` (`adminClient({ ac, roles })` +
`inferAdditionalFields`). The first user bootstraps as `admin`; public sign-up is
otherwise closed (`databaseHooks.user.create.before`). DB tables (`user`,
`session`, `account`, `verification`, `rateLimit`) already exist; rate limiting is
DB-backed.

Today, panel-user management lives as a **card inside Settings → Team tab**
(`web/src/components/settings/team-card.tsx`, `team-user-row.tsx`,
`team-roles.tsx`), admin-gated on `session.user.role === "admin"`. It can list,
add, set-role, ban/unban, and delete users — all via `authClient.admin.*`, which
the server authorizes. A host-side **break-glass CLI** exists for lockout
recovery: `bin/panel reset-password` → `server/src/cli/reset-password.ts`
(revokes sessions, reads `minPasswordLength` from better-auth config).

### Confirmed gaps
1. No dedicated Users page (management buried in a Settings tab).
2. No self-service profile / change-own-password (sidebar user menu = email +
   Sign out only).
3. No in-app admin **reset password** for other users (only the break-glass CLI).
4. No session management (self or admin); `listSessions` / `revokeUserSessions`
   unused.
5. Add-user is an always-on inline form; list has no search/filter/pagination.

## 2. Goals / Non-goals

**Goals**
- A dedicated, admin-only **`/users`** page: search/filter/paginate, add user,
  change role, **reset password** (new), ban/unban, **revoke sessions** (new),
  delete — with lockout-safe self-row locking.
- A self-service **`/profile`** page for any signed-in user: edit display name,
  **change own password** (current + new + confirm, strength meter, "sign out
  other devices"), and view/revoke **active sessions**.
- Sidebar **user menu** links to Profile (and a direct Change-password entry).
- Strong validation, security, accessibility; real tests; quality gates green.

**Non-goals (YAGNI)**
- No email verification / password-reset-by-email flow (break-glass CLI covers
  recovery; SMTP is out of scope).
- No new oRPC procedures and no DB migration (better-auth already provides every
  endpoint and table).
- No user impersonation UI, no avatar upload, no 2FA (future work).

## 3. Architecture decision

Keep talking to better-auth **directly** from the browser:
- Admin ops → `authClient.admin.*` (server authorizes via the admin plugin).
- Self ops → `authClient.changePassword` / `updateUser` / `listSessions` /
  `revokeSession` / `revokeOtherSessions`.

Rationale: auth is better-auth's domain (CLAUDE.md: "auth belongs in
`packages/auth`"), the server already authorizes every `/admin/*` and self call,
and the existing Team UI already uses this pattern. This keeps the panel thin and
needs **no oRPC and no schema change**.

List filtering/sorting/pagination is done **client-side** over a single
`listUsers({ limit: 200 })` fetch (panel user counts are tiny). The derive logic
is pure and unit-tested.

### Backend changes (`packages/auth/src/index.ts`)
- Make the policy explicit: `emailAndPassword.minPasswordLength: 8` (so UI, the
  break-glass CLI, and admin `setUserPassword` all agree).
- Add a rate-limit rule to throttle current-password brute force on change:
  `customRules: { "/change-password": { window: 10, max: 5 }, … }` (keep the
  existing `/sign-in/email` rule).

No change to `access.ts`, the DB schema, env, or the server.

## 4. Frontend design

### Routes
- `web/src/routes/_auth/users.tsx` — admin-only. `beforeLoad` reads the session
  and `throw redirect({ to: "/sites" })` for non-admins (defense in depth; server
  still authorizes every call). Renders `<UsersPage/>`.
- `web/src/routes/_auth/profile.tsx` — any authenticated user. Renders
  `<ProfilePage/>`.

### Navigation
- `app-sidebar.tsx`: add **Users** (`UsersRound` icon) to the Server group,
  rendered only when `authClient.useSession().data.user.role === "admin"`.
- `user-menu.tsx`: replace the inert email line with **Profile** (→ `/profile`)
  and **Change password** (→ `/profile` security card via hash/anchor), keep email
  label + Sign out.

### Shared, pure libs (unit-tested)
- `web/src/lib/roles.ts` — role options, `roleLabel`, `roleVariant`, `PanelRole`
  type. Migrated out of `team-roles.tsx` so both pages share one source.
- `web/src/lib/password.ts` — `scorePassword(pw) → { score: 0..4, label, hints }`
  and `passwordSchema` (zod, min 8 / max 128). Pure.
- `web/src/lib/users/derive.ts` — `filterUsers(users, { query, role, status })`
  and `sortUsers` + `paginate`. Pure.
- `web/src/lib/sessions.ts` — `describeSession(s)` → friendly device/browser/last
  active string from user-agent + timestamps. Pure.

### Components
Users (`web/src/components/users/`):
- `user-manager.tsx` — top-level: query (`listUsers`), filter state, table,
  add-user dialog trigger; uses `QueryBoundary`.
- `user-filters.tsx` — search input + role `<select>` + status `<select>`.
- `users-table.tsx` — `@control-panel/ui` Table: avatar+name+email · role badge ·
  status badge · created · row actions menu.
- `user-row-actions.tsx` — dropdown: Change role, Reset password, Ban/Unban,
  Revoke sessions, Delete. Self row → locked badge "(you)".
- `add-user-dialog.tsx` — Dialog form (email, name, role, temp password via
  shared password field).
- `set-password-dialog.tsx` — admin reset (`admin.setUserPassword`), with "also
  revoke their sessions" checkbox (calls `admin.revokeUserSessions`).
- `ban-user-dialog.tsx`, `delete-user-dialog.tsx` — confirm dialogs (delete keeps
  type-to-confirm). Migrated from `team-user-row.tsx`.
- `role-select.tsx` — styled native select (migrated from `team-roles.tsx`).
- `password-field.tsx` — reusable: password input + show/hide toggle + strength
  meter (`ui/progress`); used by add-user, set-password, change-password.

Profile (`web/src/components/profile/`):
- `profile-page.tsx` — composes the three cards.
- `profile-details-card.tsx` — display name form (`updateUser`), email read-only.
- `change-password-card.tsx` — current + new + confirm + strength + "sign out
  other devices" (`changePassword`).
- `sessions-card.tsx` — `listSessions`, current session marked, revoke one /
  "sign out everywhere else" (`revokeSession` / `revokeOtherSessions`).

### Removal / migration
- Settings → remove the **Team** tab and `TeamCard` import from `settings.tsx`.
- Delete `settings/team-card.tsx`, `settings/team-user-row.tsx`,
  `settings/team-roles.tsx` after migrating their logic to `components/users/` +
  `lib/roles.ts`. No behavior is lost; behavior is extended.

## 5. Validation & security
- `zod` schemas for every form: email, password (min 8 / max 128), confirm-match,
  name (1–100). Forms use `@tanstack/react-form` (matches `sign-in-form.tsx`).
- Passwords never echoed back; correct `autocomplete` (`new-password` /
  `current-password`); show/hide toggle.
- Change-password requires current password and offers `revokeOtherSessions`.
- Admin reset offers session revocation; delete keeps type-to-confirm; destructive
  actions labelled irreversible.
- **Lockout invariant**: self row is fully locked (no self role-change / ban /
  delete). Since only admins can act and the actor is always an admin, the last
  admin can never be removed → never zero admins. Documented in code.
- Server-side: admin plugin authorizes all `/admin/*`; new `/change-password`
  rate-limit rule. The break-glass CLI remains the out-of-band recovery.
- Semantic tokens only (`text-warning` / `text-destructive` / `bg-destructive`);
  no hardcoded colors.

## 6. Testing strategy
Tooling already present: `vitest + jsdom + @testing-library/react + jest-dom`.
- Pure unit tests: `lib/password.test.ts`, `lib/roles.test.ts`,
  `lib/users/derive.test.ts`, `lib/sessions.test.ts`.
- Component tests (Testing Library): `password-field` (strength + toggle),
  `add-user-dialog` / `change-password-card` validation (disabled until valid,
  confirm-mismatch error), `user-filters` (search/role/status narrowing),
  `user-row-actions` (self row locked). better-auth client calls are mocked.
- Quality gates (all must pass): `bun run check`, `bun run check-types`,
  `bun run test`, `bun run build`.

## 7. File change summary
**Add**: routes `users.tsx`, `profile.tsx`; `lib/roles.ts`, `lib/password.ts`,
`lib/sessions.ts`, `lib/users/derive.ts` (+ tests); `components/users/*` (9
files); `components/profile/*` (4 files); component tests.
**Edit**: `packages/auth/src/index.ts` (minPasswordLength + rate rule);
`app-sidebar.tsx` (Users link); `user-menu.tsx` (Profile/Change-password);
`routes/_auth/settings.tsx` (drop Team tab).
**Delete**: `settings/team-card.tsx`, `settings/team-user-row.tsx`,
`settings/team-roles.tsx`.

## 8. Acceptance criteria
- Admin sees **Users** in the sidebar; non-admin does not, and `/users` redirects
  non-admins.
- Admin can search/filter/paginate, add, set-role, reset-password (+revoke),
  ban/unban, revoke sessions, and delete users; own row is locked.
- Any user can open Profile from the user menu, change name, change password
  (with strength meter + confirm + optional sign-out-others), and revoke
  sessions.
- Settings no longer shows a Team tab.
- All four quality gates pass; new tests cover validation, derive, and lockout
  rules.

## 9. Risks & recovery
- Admin lockout → host-side `bin/panel reset-password --email …` (existing).
- better-auth client API drift → all calls funnel through `authClient`; typed via
  the shared `ac`/`roles`, surfaced by `check-types`.
