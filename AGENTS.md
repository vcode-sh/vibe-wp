# Repository Instructions

- All code, documentation, and commit messages must be written in English.
- Other agents may be working in this repository. Do not edit unrelated files or revert work you did not create.
- Prefer focused, operationally verifiable changes over broad rewrites.
- TypeScript and TSX files should stay at or below 220 lines. Split installer UI into narrow modules instead of growing monolithic components.
- Use Biome for installer TypeScript formatting, import organization, and linting.
- Keep host-changing installer actions behind explicit review or headless `--yes` confirmation, and never print secrets in logs.
