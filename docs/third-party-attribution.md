# Third-Party Attribution

## VS Code Architecture References
- Source repository inspected: `refrences/vscode`
- License: MIT (Microsoft VS Code)

This refactor ports architecture patterns (service instantiation, command registry discipline, host supervision, heartbeat/restart handling, and extension host ready/initialized handshake watchdogs) into new workspace modules. Implementations are adapted for Bun + TypeScript runtime constraints.
