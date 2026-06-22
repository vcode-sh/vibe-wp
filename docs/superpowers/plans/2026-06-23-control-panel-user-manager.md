# Control Panel User Manager & Self-Service Profile — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dedicated admin-only Users management page and a self-service Profile page (change password, edit name, manage sessions) to the control panel.

**Architecture:** Talk to better-auth directly from the browser — admin ops via `authClient.admin.*`, self ops via `authClient.*`. No new oRPC, no DB migration. List filtering/sorting/pagination is client-side over a single `listUsers` fetch via pure, unit-tested helpers. Forms use `@tanstack/react-form` + `zod`. UI uses `@control-panel/ui` shadcn primitives.

**Tech Stack:** React 19, TanStack Router/Query/Form, better-auth 1.6.20 (admin plugin), zod, shadcn/ui (`@control-panel/ui`), vitest + jsdom + @testing-library/react.

## Global Constraints

- Work in `control-panel/` workspace; run gate commands from `control-panel/`.
- English for all code, comments, UI copy.
- Semantic tokens only (`text-warning`, `text-destructive`, `bg-destructive`, `text-muted-foreground`); never hardcode colors.
- Passwords never echoed back; `autocomplete="new-password"` for new, `"current-password"` for current.
- Password policy: min 8, max 128 (matches better-auth `minPasswordLength`/`maxPasswordLength`).
- Roles are exactly `viewer` | `operator` | `admin` (from `@control-panel/auth/access`).
- Self row in the user manager is fully locked (no self role-change/ban/delete) — preserves the "never zero admins" invariant.
- Quality gates (run from `control-panel/`, all must pass before "done"): `bun run check`, `bun run check-types`, `bun run test`, `bun run build`.
- Prefer existing local wrappers: `@/components/ui/*` (button/input/card/dialog/dropdown-menu/alert-dialog/badge/tabs) and `@control-panel/ui/components/*` for the rest (table, label, separator, progress, avatar, select, checkbox, skeleton).

---

## Phase A — Backend policy + pure shared libs

### Task A1: Explicit password policy + change-password rate limit

**Files:**
- Modify: `control-panel/packages/auth/src/index.ts`

**Interfaces:**
- Produces: server enforces `minPasswordLength: 8`, `maxPasswordLength: 128`; rate-limits `/change-password`.

- [ ] **Step 1: Edit `emailAndPassword` and `rateLimit.customRules`.**

```ts
// in createAuth(), replace:
//   emailAndPassword: { enabled: true },
emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
},
// ...and in rateLimit.customRules add the change-password rule:
customRules: {
    "/sign-in/email": { window: 10, max: 5 },
    "/change-password": { window: 10, max: 5 },
},
```

- [ ] **Step 2: Typecheck.** Run: `cd control-panel && bun run check-types`. Expected: PASS.
- [ ] **Step 3: Commit.** `git add control-panel/packages/auth/src/index.ts && git commit -m "control-panel(auth): explicit password policy + change-password rate limit"`

---

### Task A2: `lib/roles.ts` — shared role metadata + RoleSelect

**Files:**
- Create: `control-panel/web/src/lib/roles.ts`
- Create: `control-panel/web/src/lib/roles.test.ts`
- Create: `control-panel/web/src/components/users/role-select.tsx`

**Interfaces:**
- Produces:
  - `ROLE_OPTIONS: readonly {value: PanelRole; label: string; blurb: string}[]`
  - `type PanelRole = "viewer" | "operator" | "admin"`
  - `roleLabel(role: string): string`
  - `roleVariant(role: string): "default" | "secondary" | "outline"`
  - `RoleSelect({id, value, onValueChange, disabled})` component

- [ ] **Step 1: Write failing test `lib/roles.test.ts`.**

```ts
import { describe, expect, it } from "vitest";
import { roleLabel, roleVariant, ROLE_OPTIONS } from "./roles";

describe("roles", () => {
    it("lists three roles in privilege order", () => {
        expect(ROLE_OPTIONS.map((r) => r.value)).toEqual([
            "viewer",
            "operator",
            "admin",
        ]);
    });
    it("labels known roles and falls back to the raw value", () => {
        expect(roleLabel("admin")).toBe("Admin");
        expect(roleLabel("operator")).toBe("Operator");
        expect(roleLabel("mystery")).toBe("mystery");
    });
    it("maps roles to badge variants", () => {
        expect(roleVariant("admin")).toBe("default");
        expect(roleVariant("operator")).toBe("secondary");
        expect(roleVariant("viewer")).toBe("outline");
        expect(roleVariant("mystery")).toBe("outline");
    });
});
```

- [ ] **Step 2: Run, expect FAIL.** `cd control-panel && bun run test -- roles` → cannot find `./roles`.

- [ ] **Step 3: Create `lib/roles.ts`.**

```ts
import type { PanelRole } from "@control-panel/auth/access";

export type { PanelRole };

export const ROLE_OPTIONS = [
    { value: "viewer", label: "Viewer", blurb: "Read-only access." },
    { value: "operator", label: "Operator", blurb: "Run site actions." },
    { value: "admin", label: "Admin", blurb: "Full access incl. users." },
] as const satisfies readonly {
    value: PanelRole;
    label: string;
    blurb: string;
}[];

export function roleLabel(role: string): string {
    return ROLE_OPTIONS.find((r) => r.value === role)?.label ?? role;
}

export function roleVariant(
    role: string
): "default" | "secondary" | "outline" {
    if (role === "admin") return "default";
    if (role === "operator") return "secondary";
    return "outline";
}
```

- [ ] **Step 4: Create `components/users/role-select.tsx`** (migrated from old `team-roles.tsx`, using shared options).

```tsx
import { type PanelRole, ROLE_OPTIONS } from "@/lib/roles";

export function RoleSelect({
    id,
    value,
    onValueChange,
    disabled,
}: {
    id: string;
    value: PanelRole;
    onValueChange: (role: PanelRole) => void;
    disabled?: boolean;
}) {
    return (
        <select
            className="flex h-8 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={disabled}
            id={id}
            onChange={(e) => onValueChange(e.target.value as PanelRole)}
            value={value}
        >
            {ROLE_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>
                    {r.label}
                </option>
            ))}
        </select>
    );
}
```

- [ ] **Step 5: Run test, expect PASS.** `cd control-panel && bun run test -- roles`
- [ ] **Step 6: Commit.** `git add control-panel/web/src/lib/roles.ts control-panel/web/src/lib/roles.test.ts control-panel/web/src/components/users/role-select.tsx && git commit -m "control-panel(web): shared role metadata + RoleSelect"`

---

### Task A3: `lib/password.ts` — strength scoring + zod schema

**Files:**
- Create: `control-panel/web/src/lib/password.ts`
- Create: `control-panel/web/src/lib/password.test.ts`

**Interfaces:**
- Produces:
  - `MIN_PASSWORD = 8`, `MAX_PASSWORD = 128`
  - `passwordSchema: z.ZodString` (min 8 / max 128 with messages)
  - `scorePassword(pw: string): { score: 0|1|2|3|4; label: string; percent: number }`

- [ ] **Step 1: Write failing test `lib/password.test.ts`.**

```ts
import { describe, expect, it } from "vitest";
import { passwordSchema, scorePassword } from "./password";

describe("scorePassword", () => {
    it("scores empty as 0", () => {
        expect(scorePassword("").score).toBe(0);
    });
    it("rates a short simple password weak", () => {
        expect(scorePassword("aaaaaaaa").score).toBeLessThanOrEqual(1);
    });
    it("rates a long mixed password strong", () => {
        const s = scorePassword("Tr0ub4dour&3xtra-long");
        expect(s.score).toBeGreaterThanOrEqual(3);
        expect(s.percent).toBeGreaterThan(60);
    });
    it("clamps percent to 0..100", () => {
        const s = scorePassword("aA1!aA1!aA1!aA1!aA1!");
        expect(s.percent).toBeLessThanOrEqual(100);
        expect(s.percent).toBeGreaterThanOrEqual(0);
    });
});

describe("passwordSchema", () => {
    it("rejects < 8 chars", () => {
        expect(passwordSchema.safeParse("short").success).toBe(false);
    });
    it("accepts >= 8 chars", () => {
        expect(passwordSchema.safeParse("longenough").success).toBe(true);
    });
    it("rejects > 128 chars", () => {
        expect(passwordSchema.safeParse("a".repeat(129)).success).toBe(false);
    });
});
```

- [ ] **Step 2: Run, expect FAIL.** `cd control-panel && bun run test -- password`

- [ ] **Step 3: Create `lib/password.ts`.**

```ts
import { z } from "zod";

export const MIN_PASSWORD = 8;
export const MAX_PASSWORD = 128;

export const passwordSchema = z
    .string()
    .min(MIN_PASSWORD, `At least ${MIN_PASSWORD} characters`)
    .max(MAX_PASSWORD, `At most ${MAX_PASSWORD} characters`);

const LABELS = ["Very weak", "Weak", "Fair", "Good", "Strong"] as const;

export function scorePassword(pw: string): {
    score: 0 | 1 | 2 | 3 | 4;
    label: string;
    percent: number;
} {
    if (!pw) return { score: 0, label: LABELS[0], percent: 0 };
    let points = 0;
    if (pw.length >= 8) points += 1;
    if (pw.length >= 12) points += 1;
    if (pw.length >= 16) points += 1;
    if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) points += 1;
    if (/\d/.test(pw)) points += 1;
    if (/[^A-Za-z0-9]/.test(pw)) points += 1;
    const score = Math.min(4, Math.max(0, points - 1)) as 0 | 1 | 2 | 3 | 4;
    return {
        score,
        label: LABELS[score],
        percent: Math.round((score / 4) * 100),
    };
}
```

- [ ] **Step 4: Run test, expect PASS.** `cd control-panel && bun run test -- password`
- [ ] **Step 5: Commit.** `git add control-panel/web/src/lib/password.ts control-panel/web/src/lib/password.test.ts && git commit -m "control-panel(web): password strength + zod schema"`

---

### Task A4: `lib/users/derive.ts` — filter/sort/paginate

**Files:**
- Create: `control-panel/web/src/lib/users/derive.ts`
- Create: `control-panel/web/src/lib/users/derive.test.ts`

**Interfaces:**
- Produces:
  - `type PanelUser = { id; email; name; role; banned; banReason: string|null; createdAt: number }`
  - `type UserFilter = { query: string; role: "all"|PanelRole; status: "all"|"active"|"banned" }`
  - `filterUsers(users: PanelUser[], f: UserFilter): PanelUser[]` (search email+name case-insensitive; role; status)
  - `sortUsers(users: PanelUser[]): PanelUser[]` (admins first, then by email asc)
  - `paginate<T>(items: T[], page: number, pageSize: number): { page; pageCount; slice: T[] }`

- [ ] **Step 1: Write failing test `lib/users/derive.test.ts`.**

```ts
import { describe, expect, it } from "vitest";
import { filterUsers, paginate, type PanelUser, sortUsers } from "./derive";

const u = (over: Partial<PanelUser>): PanelUser => ({
    id: "1",
    email: "a@x.com",
    name: "Alice",
    role: "viewer",
    banned: false,
    banReason: null,
    createdAt: 0,
    ...over,
});

describe("filterUsers", () => {
    const users = [
        u({ id: "1", email: "alice@x.com", name: "Alice", role: "admin" }),
        u({ id: "2", email: "bob@x.com", name: "Bob", role: "viewer", banned: true }),
        u({ id: "3", email: "carol@y.com", name: "Carol", role: "operator" }),
    ];
    it("matches query on email and name, case-insensitive", () => {
        expect(filterUsers(users, { query: "BOB", role: "all", status: "all" }).map((x) => x.id)).toEqual(["2"]);
        expect(filterUsers(users, { query: "carol", role: "all", status: "all" }).map((x) => x.id)).toEqual(["3"]);
    });
    it("filters by role", () => {
        expect(filterUsers(users, { query: "", role: "admin", status: "all" }).map((x) => x.id)).toEqual(["1"]);
    });
    it("filters by status", () => {
        expect(filterUsers(users, { query: "", role: "all", status: "banned" }).map((x) => x.id)).toEqual(["2"]);
        expect(filterUsers(users, { query: "", role: "all", status: "active" }).map((x) => x.id)).toEqual(["1", "3"]);
    });
});

describe("sortUsers", () => {
    it("puts admins first then sorts by email", () => {
        const users = [
            u({ id: "1", email: "z@x.com", role: "viewer" }),
            u({ id: "2", email: "a@x.com", role: "admin" }),
            u({ id: "3", email: "b@x.com", role: "viewer" }),
        ];
        expect(sortUsers(users).map((x) => x.id)).toEqual(["2", "3", "1"]);
    });
});

describe("paginate", () => {
    it("slices and reports page count", () => {
        const items = [1, 2, 3, 4, 5];
        expect(paginate(items, 1, 2)).toEqual({ page: 1, pageCount: 3, slice: [3, 4] });
    });
    it("clamps out-of-range page", () => {
        expect(paginate([1, 2, 3], 9, 2).page).toBe(1);
    });
});
```

- [ ] **Step 2: Run, expect FAIL.** `cd control-panel && bun run test -- derive`

- [ ] **Step 3: Create `lib/users/derive.ts`.**

```ts
import type { PanelRole } from "@/lib/roles";

export interface PanelUser {
    id: string;
    email: string;
    name: string;
    role: string;
    banned: boolean;
    banReason: string | null;
    createdAt: number;
}

export interface UserFilter {
    query: string;
    role: "all" | PanelRole;
    status: "all" | "active" | "banned";
}

export function filterUsers(users: PanelUser[], f: UserFilter): PanelUser[] {
    const q = f.query.trim().toLowerCase();
    return users.filter((u) => {
        if (q && !`${u.email} ${u.name}`.toLowerCase().includes(q)) return false;
        if (f.role !== "all" && u.role !== f.role) return false;
        if (f.status === "banned" && !u.banned) return false;
        if (f.status === "active" && u.banned) return false;
        return true;
    });
}

const RANK: Record<string, number> = { admin: 0, operator: 1, viewer: 2 };

export function sortUsers(users: PanelUser[]): PanelUser[] {
    return [...users].sort((a, b) => {
        const ra = RANK[a.role] ?? 9;
        const rb = RANK[b.role] ?? 9;
        if (ra !== rb) return ra - rb;
        return a.email.localeCompare(b.email);
    });
}

export function paginate<T>(
    items: T[],
    page: number,
    pageSize: number
): { page: number; pageCount: number; slice: T[] } {
    const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
    const safe = page >= 0 && page < pageCount ? page : 0;
    return {
        page: safe,
        pageCount,
        slice: items.slice(safe * pageSize, safe * pageSize + pageSize),
    };
}
```

Note the test calls `paginate(items, 1, 2)` expecting page 1 valid (3 items → pageCount 3 → page 1 ok → slice [3,4]) and `paginate([1,2,3], 9, 2)` → page clamps to 0... but test expects `.page` to be `1`. Fix: clamp to **last valid page** when out of range. Adjust:

```ts
    const safe = Math.min(Math.max(0, page), pageCount - 1);
```

With `[1,2,3]`, pageSize 2 → pageCount 2 → page 9 clamps to 1. Update the test's "clamps" expectation accordingly (page 1). Re-run.

- [ ] **Step 4: Run test, expect PASS** (adjust clamp + test as noted). `cd control-panel && bun run test -- derive`
- [ ] **Step 5: Commit.** `git add control-panel/web/src/lib/users && git commit -m "control-panel(web): user list filter/sort/paginate helpers"`

---

### Task A5: `lib/sessions.ts` — describe a session row

**Files:**
- Create: `control-panel/web/src/lib/sessions.ts`
- Create: `control-panel/web/src/lib/sessions.test.ts`

**Interfaces:**
- Produces: `describeSession(s: { userAgent?: string|null; ipAddress?: string|null }): { device: string; detail: string }`

- [ ] **Step 1: Write failing test `lib/sessions.test.ts`.**

```ts
import { describe, expect, it } from "vitest";
import { describeSession } from "./sessions";

describe("describeSession", () => {
    it("extracts a browser + OS hint", () => {
        const d = describeSession({
            userAgent:
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
            ipAddress: "1.2.3.4",
        });
        expect(d.device).toContain("Chrome");
        expect(d.device).toContain("macOS");
        expect(d.detail).toContain("1.2.3.4");
    });
    it("falls back when user-agent is missing", () => {
        expect(describeSession({ userAgent: null, ipAddress: null }).device).toBe(
            "Unknown device"
        );
    });
});
```

- [ ] **Step 2: Run, expect FAIL.** `cd control-panel && bun run test -- sessions`

- [ ] **Step 3: Create `lib/sessions.ts`.**

```ts
export function describeSession(s: {
    userAgent?: string | null;
    ipAddress?: string | null;
}): { device: string; detail: string } {
    const ua = s.userAgent ?? "";
    const browser =
        /Edg\//.test(ua) ? "Edge"
        : /Chrome\//.test(ua) ? "Chrome"
        : /Firefox\//.test(ua) ? "Firefox"
        : /Safari\//.test(ua) ? "Safari"
        : "";
    const os =
        /Mac OS X/.test(ua) ? "macOS"
        : /Windows/.test(ua) ? "Windows"
        : /Android/.test(ua) ? "Android"
        : /(iPhone|iPad)/.test(ua) ? "iOS"
        : /Linux/.test(ua) ? "Linux"
        : "";
    const device =
        browser || os ? [browser, os].filter(Boolean).join(" · ") : "Unknown device";
    const detail = s.ipAddress ? `IP ${s.ipAddress}` : "IP unknown";
    return { device, detail };
}
```

- [ ] **Step 4: Run test, expect PASS.** `cd control-panel && bun run test -- sessions`
- [ ] **Step 5: Commit.** `git add control-panel/web/src/lib/sessions.ts control-panel/web/src/lib/sessions.test.ts && git commit -m "control-panel(web): session describe helper"`

---

## Phase B — Reusable password field

### Task B1: `components/users/password-field.tsx`

**Files:**
- Create: `control-panel/web/src/components/users/password-field.tsx`
- Create: `control-panel/web/src/components/users/password-field.test.tsx`

**Interfaces:**
- Consumes: `scorePassword` (A3).
- Produces: `PasswordField({ id, label, value, onChange, autoComplete, showStrength?, placeholder?, disabled? })` — input with show/hide toggle and optional strength meter.

- [ ] **Step 1: Write failing test.**

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PasswordField } from "./password-field";

describe("PasswordField", () => {
    it("toggles visibility", () => {
        render(
            <PasswordField id="p" label="Password" value="secret123" onChange={() => {}} autoComplete="new-password" />
        );
        const input = screen.getByLabelText("Password") as HTMLInputElement;
        expect(input.type).toBe("password");
        fireEvent.click(screen.getByRole("button", { name: /show password/i }));
        expect(input.type).toBe("text");
    });
    it("shows a strength meter when enabled and non-empty", () => {
        render(
            <PasswordField id="p" label="Password" value="Tr0ub4dour&long" onChange={() => {}} autoComplete="new-password" showStrength />
        );
        expect(screen.getByText(/strong|good|fair|weak/i)).toBeInTheDocument();
    });
    it("calls onChange", () => {
        const onChange = vi.fn();
        render(<PasswordField id="p" label="Password" value="" onChange={onChange} autoComplete="new-password" />);
        fireEvent.change(screen.getByLabelText("Password"), { target: { value: "x" } });
        expect(onChange).toHaveBeenCalledWith("x");
    });
});
```

- [ ] **Step 2: Run, expect FAIL.** `cd control-panel && bun run test -- password-field`

- [ ] **Step 3: Create `password-field.tsx`.**

```tsx
import { Label } from "@control-panel/ui/components/label";
import { Progress } from "@control-panel/ui/components/progress";
import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { scorePassword } from "@/lib/password";

export function PasswordField({
    id,
    label,
    value,
    onChange,
    autoComplete,
    showStrength,
    placeholder,
    disabled,
}: {
    id: string;
    label: string;
    value: string;
    onChange: (v: string) => void;
    autoComplete: "new-password" | "current-password";
    showStrength?: boolean;
    placeholder?: string;
    disabled?: boolean;
}) {
    const [reveal, setReveal] = useState(false);
    const strength = scorePassword(value);
    return (
        <div className="grid gap-1.5">
            <Label htmlFor={id}>{label}</Label>
            <div className="relative">
                <Input
                    autoComplete={autoComplete}
                    className="pr-9"
                    disabled={disabled}
                    id={id}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={placeholder}
                    type={reveal ? "text" : "password"}
                    value={value}
                />
                <Button
                    aria-label={reveal ? "Hide password" : "Show password"}
                    className="absolute top-0 right-0 h-full px-2 text-muted-foreground"
                    disabled={disabled}
                    onClick={() => setReveal((r) => !r)}
                    size="icon"
                    type="button"
                    variant="ghost"
                >
                    {reveal ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </Button>
            </div>
            {showStrength && value ? (
                <div className="grid gap-1">
                    <Progress value={strength.percent} />
                    <span className="text-muted-foreground text-xs">
                        {strength.label}
                    </span>
                </div>
            ) : null}
        </div>
    );
}
```

- [ ] **Step 4: Run test, expect PASS.** `cd control-panel && bun run test -- password-field`
- [ ] **Step 5: Commit.** `git add control-panel/web/src/components/users/password-field.tsx control-panel/web/src/components/users/password-field.test.tsx && git commit -m "control-panel(web): reusable password field"`

---

## Phase C — Users manager page

### Task C1: User dialogs (add / set-password / ban / delete)

**Files:**
- Create: `control-panel/web/src/components/users/add-user-dialog.tsx`
- Create: `control-panel/web/src/components/users/set-password-dialog.tsx`
- Create: `control-panel/web/src/components/users/ban-user-dialog.tsx`
- Create: `control-panel/web/src/components/users/delete-user-dialog.tsx`
- Create: `control-panel/web/src/components/users/add-user-dialog.test.tsx`

**Interfaces:**
- Consumes: `PasswordField` (B1), `RoleSelect` (A2), `passwordSchema` (A3), `authClient`.
- Produces:
  - `AddUserDialog({ onChanged })` — trigger button + dialog. Calls `authClient.admin.createUser`.
  - `SetPasswordDialog({ user, open, onOpenChange, onChanged })` — `authClient.admin.setUserPassword` + optional `authClient.admin.revokeUserSessions`.
  - `BanUserDialog({ user, open, onOpenChange, onChanged })` — `authClient.admin.banUser`.
  - `DeleteUserDialog({ user, open, onOpenChange, onChanged })` — type-to-confirm, `authClient.admin.removeUser`.
  - All take `user: { id; email }` where relevant and `onChanged: () => Promise<void>`.

Implementation notes (full code authored during execution; follows existing
`team-card.tsx`/`team-user-row.tsx` patterns — `useMutation`, `toast`,
`AlertDialog`/`Dialog`, error via `res.error.message`):
- `AddUserDialog`: fields email/name/role/password; submit disabled until
  `z.email().safeParse(email).success && passwordSchema.safeParse(password).success`.
  On success: close, reset, toast, `await onChanged()`.
- `SetPasswordDialog`: `PasswordField showStrength` + confirm field + "also sign
  out their sessions" `Checkbox`. Submit disabled until valid and match.
- `BanUserDialog`/`DeleteUserDialog`: ported verbatim behavior from
  `team-user-row.tsx` (reason optional; type-to-confirm equals `user.email`).

- [ ] **Step 1: Write failing test `add-user-dialog.test.tsx`** (mock authClient).

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth-client", () => ({
    authClient: { admin: { createUser: vi.fn().mockResolvedValue({ data: {}, error: null }) } },
}));
import { AddUserDialog } from "./add-user-dialog";

function wrap(ui: React.ReactNode) {
    return <QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>;
}

describe("AddUserDialog", () => {
    it("opens and keeps submit disabled until email + password valid", () => {
        render(wrap(<AddUserDialog onChanged={async () => {}} />));
        fireEvent.click(screen.getByRole("button", { name: /add user/i }));
        const submit = screen.getByRole("button", { name: /^add user$/i });
        expect(submit).toBeDisabled();
        fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "x@y.com" } });
        fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: "longenough" } });
        expect(submit).not.toBeDisabled();
    });
});
```

- [ ] **Step 2: Run, expect FAIL.** `cd control-panel && bun run test -- add-user-dialog`
- [ ] **Step 3: Implement the four dialogs** per interfaces + notes above.
- [ ] **Step 4: Run test, expect PASS.** `cd control-panel && bun run test -- add-user-dialog`
- [ ] **Step 5: `cd control-panel && bun run check-types`** → PASS.
- [ ] **Step 6: Commit.** `git add control-panel/web/src/components/users && git commit -m "control-panel(web): user management dialogs"`

---

### Task C2: Row actions + filters + table

**Files:**
- Create: `control-panel/web/src/components/users/user-row-actions.tsx`
- Create: `control-panel/web/src/components/users/user-filters.tsx`
- Create: `control-panel/web/src/components/users/users-table.tsx`
- Create: `control-panel/web/src/components/users/user-filters.test.tsx`

**Interfaces:**
- Consumes: `PanelUser`, `UserFilter`, `RoleSelect`, dialogs (C1), `roleLabel`/`roleVariant`.
- Produces:
  - `UserFilters({ value, onChange })` where value is `UserFilter`.
  - `UserRowActions({ user, isSelf, onChanged })` — inline RoleSelect (non-self) + dropdown menu (Reset password, Ban/Unban, Revoke sessions, Delete) wiring C1 dialogs and `authClient.admin.setRole`/`unbanUser`/`revokeUserSessions`. Self → `<Badge>{role} (you)</Badge>`.
  - `UsersTable({ users, currentUserId, onChanged })` — `@control-panel/ui` Table; columns User / Role / Status / Created / Actions.

- [ ] **Step 1: Write failing test `user-filters.test.tsx`.**

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { UserFilters } from "./user-filters";

describe("UserFilters", () => {
    it("emits query changes", () => {
        const onChange = vi.fn();
        render(<UserFilters value={{ query: "", role: "all", status: "all" }} onChange={onChange} />);
        fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: "bob" } });
        expect(onChange).toHaveBeenCalledWith({ query: "bob", role: "all", status: "all" });
    });
});
```

- [ ] **Step 2: Run, expect FAIL.** `cd control-panel && bun run test -- user-filters`
- [ ] **Step 3: Implement `user-filters.tsx`, `user-row-actions.tsx`, `users-table.tsx`.** Use `@control-panel/ui/components/table`, `dropdown-menu`, `Badge`, `Input`. Created date via `new Date(u.createdAt).toLocaleDateString()`.
- [ ] **Step 4: Run test, expect PASS.** `cd control-panel && bun run test -- user-filters`
- [ ] **Step 5: Commit.** `git add control-panel/web/src/components/users && git commit -m "control-panel(web): user filters, row actions, table"`

---

### Task C3: `UserManager` + `/users` route + sidebar link

**Files:**
- Create: `control-panel/web/src/components/users/user-manager.tsx`
- Create: `control-panel/web/src/routes/_auth/users.tsx`
- Modify: `control-panel/web/src/components/app-sidebar.tsx`

**Interfaces:**
- Consumes: `UsersTable`, `UserFilters`, `AddUserDialog`, `filterUsers`/`sortUsers`/`paginate`, `authClient`.
- Produces: `UserManager()` page body; route `/users` (admin-gated); sidebar "Users" link (admin-only).

- [ ] **Step 1: Implement `user-manager.tsx`** — `useQuery(["admin","listUsers"], listUsers limit 200)` → map to `PanelUser[]`; local `UserFilter` + page state; `filterUsers`→`sortUsers`→`paginate`; render `PageHeader`+`TopBar`("Users"), `AddUserDialog`, `UserFilters`, `UsersTable`, pagination controls; `QueryBoundary` for load/error. `currentUserId` from `authClient.useSession()`.
- [ ] **Step 2: Implement route `routes/_auth/users.tsx`.**

```tsx
import { createFileRoute, redirect } from "@tanstack/react-router";
import { UserManager } from "@/components/users/user-manager";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/_auth/users")({
    beforeLoad: async () => {
        const session = await authClient.getSession();
        if (session.data?.user.role !== "admin") {
            throw redirect({ to: "/sites" });
        }
    },
    component: UserManager,
});
```

- [ ] **Step 3: Add the sidebar link (admin-only).** In `app-sidebar.tsx`: import `UsersRound` from lucide-react and `authClient`; read `const { data } = authClient.useSession();` `const isAdmin = data?.user.role === "admin";` Append to a derived server-links array when `isAdmin`: `{ label: "Users", to: "/users", icon: UsersRound }` (place before Settings).
- [ ] **Step 4: Gates.** `cd control-panel && bun run check-types && bun run test && bun run check`. Expected PASS. Manually note `routeTree.gen.ts` is regenerated by the dev/build (TanStack Router plugin) — run `bun run build` to regenerate, or `bun run dev` once.
- [ ] **Step 5: Commit.** `git add control-panel/web/src/components/users/user-manager.tsx control-panel/web/src/routes/_auth/users.tsx control-panel/web/src/components/app-sidebar.tsx control-panel/web/src/routeTree.gen.ts && git commit -m "control-panel(web): /users admin page + sidebar link"`

---

## Phase D — Profile page

### Task D1: Profile cards (details / change-password / sessions)

**Files:**
- Create: `control-panel/web/src/components/profile/profile-details-card.tsx`
- Create: `control-panel/web/src/components/profile/change-password-card.tsx`
- Create: `control-panel/web/src/components/profile/sessions-card.tsx`
- Create: `control-panel/web/src/components/profile/profile-page.tsx`
- Create: `control-panel/web/src/components/profile/change-password-card.test.tsx`

**Interfaces:**
- Consumes: `PasswordField` (B1), `passwordSchema` (A3), `describeSession` (A5), `authClient`.
- Produces:
  - `ProfileDetailsCard()` — name form (`authClient.updateUser({ name })`), email read-only from `useSession`.
  - `ChangePasswordCard()` — current + new + confirm (`PasswordField`), "Sign out other devices" checkbox, `authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions })`. Submit disabled until current non-empty, new passes `passwordSchema`, confirm === new.
  - `SessionsCard()` — `authClient.listSessions()`, mark current via `useSession().data.session.token`, `authClient.revokeSession({ token })` per row + "Sign out everywhere else" (`authClient.revokeOtherSessions()`).
  - `ProfilePage()` — `TopBar`("Profile") + `PageHeader` + the three cards in a `max-w-2xl` grid.

- [ ] **Step 1: Write failing test `change-password-card.test.tsx`** (mock authClient).

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth-client", () => ({
    authClient: { changePassword: vi.fn().mockResolvedValue({ data: {}, error: null }) },
}));
import { ChangePasswordCard } from "./change-password-card";

const wrap = (ui: React.ReactNode) => (
    <QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>
);

describe("ChangePasswordCard", () => {
    it("keeps submit disabled until valid and matching", () => {
        render(wrap(<ChangePasswordCard />));
        const submit = screen.getByRole("button", { name: /change password/i });
        expect(submit).toBeDisabled();
        fireEvent.change(screen.getByLabelText(/current password/i), { target: { value: "oldpass12" } });
        fireEvent.change(screen.getByLabelText(/^new password/i), { target: { value: "newpass12" } });
        fireEvent.change(screen.getByLabelText(/confirm/i), { target: { value: "mismatch" } });
        expect(submit).toBeDisabled();
        fireEvent.change(screen.getByLabelText(/confirm/i), { target: { value: "newpass12" } });
        expect(submit).not.toBeDisabled();
    });
});
```

- [ ] **Step 2: Run, expect FAIL.** `cd control-panel && bun run test -- change-password-card`
- [ ] **Step 3: Implement the four files** per interfaces.
- [ ] **Step 4: Run test, expect PASS.** `cd control-panel && bun run test -- change-password-card`
- [ ] **Step 5: Commit.** `git add control-panel/web/src/components/profile && git commit -m "control-panel(web): profile cards (details, password, sessions)"`

---

### Task D2: `/profile` route + user-menu links

**Files:**
- Create: `control-panel/web/src/routes/_auth/profile.tsx`
- Modify: `control-panel/web/src/components/user-menu.tsx`

**Interfaces:**
- Consumes: `ProfilePage` (D1).
- Produces: route `/profile`; user-menu "Profile" + "Change password" links.

- [ ] **Step 1: Create route.**

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { ProfilePage } from "@/components/profile/profile-page";

export const Route = createFileRoute("/_auth/profile")({
    component: ProfilePage,
});
```

- [ ] **Step 2: Edit `user-menu.tsx`** — replace the inert email `DropdownMenuItem` with two `DropdownMenuItem render={<Link to="/profile" />}` entries (icons `User`, `KeyRound`): "Profile" and "Change password". Keep the email in `DropdownMenuLabel`, keep Sign out.
- [ ] **Step 3: Gates.** `cd control-panel && bun run build` (regenerate routeTree) then `bun run check-types && bun run test && bun run check`. Expected PASS.
- [ ] **Step 4: Commit.** `git add control-panel/web/src/routes/_auth/profile.tsx control-panel/web/src/components/user-menu.tsx control-panel/web/src/routeTree.gen.ts && git commit -m "control-panel(web): /profile route + user-menu links"`

---

## Phase E — Remove old Team tab + final verification

### Task E1: Drop Settings → Team tab and delete migrated files

**Files:**
- Modify: `control-panel/web/src/routes/_auth/settings.tsx`
- Delete: `control-panel/web/src/components/settings/team-card.tsx`
- Delete: `control-panel/web/src/components/settings/team-user-row.tsx`
- Delete: `control-panel/web/src/components/settings/team-roles.tsx`

- [ ] **Step 1: Edit `settings.tsx`** — remove the `TeamCard` import, the `team` `TabsTrigger`, and the `team` `TabsContent`; drop the now-unused `isAdmin`/`currentUser` derivations if no longer referenced (keep `useSession` only if still used elsewhere — otherwise remove).
- [ ] **Step 2: Delete the three files.** `git rm control-panel/web/src/components/settings/team-card.tsx control-panel/web/src/components/settings/team-user-row.tsx control-panel/web/src/components/settings/team-roles.tsx`
- [ ] **Step 3: Grep for stragglers.** `cd control-panel && grep -rn "team-card\|team-user-row\|team-roles\|TeamCard" web/src` → expect no matches.
- [ ] **Step 4: Gates.** `cd control-panel && bun run check-types && bun run test && bun run check && bun run build`. Expected PASS.
- [ ] **Step 5: Commit.** `git add -A control-panel/web/src && git commit -m "control-panel(web): retire Settings Team tab in favor of /users"`

---

### Task E2: Full-suite verification + manual smoke

- [ ] **Step 1: Run all gates from `control-panel/`.** `bun run check && bun run check-types && bun run test && bun run build`. Capture output; all PASS.
- [ ] **Step 2: Manual smoke (dev).** `bun run db:push` then `bun run dev`. Verify as an admin: Users link visible; add user; change role; reset password; ban/unban; revoke sessions; delete (not self); self row locked. As any user: Profile from user menu; change name; change password (strength + confirm + sign-out-others); revoke a session. Confirm Settings has no Team tab. Confirm a non-admin is redirected away from `/users`.
- [ ] **Step 3: Final commit if any fixups.** `git commit -am "control-panel(web): user-manager smoke fixups"` (only if needed).

---

## Self-Review

**Spec coverage:**
- /users admin page (search/filter/paginate/add/role/reset-pw/ban/revoke/delete) → C1–C3 ✔
- /profile (name/password/sessions) → D1–D2 ✔
- Sidebar Users (admin-only) + user-menu Profile/Change-password → C3, D2 ✔
- Remove Settings Team tab + delete migrated files → E1 ✔
- Backend minPasswordLength + change-password rate limit → A1 ✔
- Pure helpers + tests (roles/password/derive/sessions) → A2–A5 ✔
- Reusable password field + component tests → B1, C1, C2, D1 ✔
- Semantic tokens, no oRPC, no migration, lockout invariant → Global Constraints + route guard + self-lock ✔
- Quality gates → E2 ✔

**Placeholder scan:** Pure-lib tasks (A1–A5, B1) carry full code + tests. UI-heavy tasks (C1–C3, D1–D2) give exact files, interfaces, signatures, representative code, and one real test each; remaining JSX is authored at execution following the cited existing patterns (`team-*`, `sign-in-form`, `settings.tsx`). Acceptable for inline execution by the plan author.

**Type consistency:** `PanelUser`, `UserFilter`, `PanelRole`, `scorePassword`, `filterUsers/sortUsers/paginate`, `describeSession`, `PasswordField`, `RoleSelect`, dialog props, and `onChanged: () => Promise<void>` are used consistently across tasks.
