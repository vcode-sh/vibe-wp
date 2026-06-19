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
