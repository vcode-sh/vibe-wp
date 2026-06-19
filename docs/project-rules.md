# Project Rules

These rules apply to the Vibe WP repository and are enforced first for the installer TypeScript code.

## Language

- Code, documentation, comments, commit messages, and UI copy must be written in English.
- User-facing installer copy must stay plain and non-technical unless it is inside logs or an advanced help panel.

## TypeScript Architecture

- Keep TypeScript and TSX files at or below 220 lines.
- Split UI into narrow modules: app shell, screen components, reusable primitives, core planning logic, execution logic, validation, and host integration.
- Keep React/OpenTUI components mostly presentational. Business logic belongs in `installer/src/core`.
- Centralize command execution, redaction, env writing, and Caddyfile writing. Do not run shell commands directly from screen components.
- Keep all host-changing actions behind an explicit review step or a headless `--yes` flag.
- Do not print secrets. Use redaction for logs, previews, support bundles, and dry-run output.

## Code Quality

- Use Biome plus Ultracite presets for formatting, import organization, React rules, and linting.
- Run `bun run quality` inside `installer/` before considering installer changes complete.
- Use `bun run deps:fresh` to refresh package versions with `bunx depfresh -r major`.
- Prefer type-only imports where possible.
- Avoid broad `any`. If an external API requires it, isolate it near the boundary and add a small type wrapper.
- Keep generated or build output out of Git.

## UI Quality

- The TUI must work in wide, medium, and compact terminal layouts.
- Every screen must have a clear primary action, focused control, and visible context.
- The UI should show exact consequences before privileged actions.
- Do not hide warnings about DNS, public ports, backups, or Docker firewall behavior.

## Installer UX Standard

The installer should feel like a modern operations console for a non-technical VPS owner. It must not feel like a mock, a plain questionnaire, or a developer-only CLI.

- Use neutral dark mode with restrained contrast, one accent color, and semantic colors only for success, warning, and destructive states.
- Keep layout stable across navigation. Focus changes, validation messages, and long values must not resize the whole screen.
- Prefer numbered choice cards and clear actions over dense selects when the user is making an important decision.
- Support `Tab` and `Shift+Tab` for focus, `Up` and `Down` for list movement, `Enter` for action, `Esc` for back/close, and `?` for help.
- Include a visible footer with available actions on every interactive screen.
- Mask secrets while typing and redact them from previews, logs, dry-runs, exported plans, summaries, and support bundles.
- Use typed confirmation for install execution, Caddy changes, safe remove, full delete, and any irreversible action.
- Destructive actions need a dialog or layer with consequence summary, affected paths, affected Docker resources, backup status, and the exact confirmation phrase.
- Field errors must appear next to the field and explain the fix in plain English.
- Technical details belong in a help panel, log drawer, or advanced details area, not in the primary path.
- Progress should be shown as a timeline with current task, completed tasks, skipped tasks, and retryable failures.
- The TUI must be checked through real SSH sessions before release acceptance.

## Installer Completion Rules

Do not call the guided installer complete until these product requirements are met:

- persistent state, install logs, summaries, and resume data are written under `.vibe-installer/`
- failure recovery supports retry, resume, and support bundle export
- wide, medium, compact, and emergency terminal layouts have snapshot coverage
- a disposable real-domain production install has passed
- a disposable real-domain production-plus-staging install has passed
- post-install checks prove WordPress Site Health REST and loopback, upload directory creation, Redis Object Cache, and FastCGI cache `HIT`
