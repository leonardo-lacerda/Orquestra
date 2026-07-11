# Maestro packaging soak checklist

Run on a **packaged** install (`npm run package:win` / mac), not only `npm run dev`.

## Asset resolution

- [ ] Enable crown on a terminal in a real workspace
- [ ] Workspace root contains `orquestra.js`
- [ ] `.orquestra/crown.json` exists with `terminalPtyId`
- [ ] `.orquestra/pi-agent/extensions/orquestra-maestro/index.ts` exists
- [ ] `CLAUDE.local.md` contains Maestro instructions
- [ ] Disable crown removes `crown.json` and `CLAUDE.local.md`

## Fail-closed

- [ ] (Dev/test) With assets missing, crown does **not** stay green Active
- [ ] Terminal shows `[orquestra] Maestro enable failed: …` or popover error

## Loop

- [ ] Multi-part task with agent → 2+ workers on canvas
- [ ] `node orquestra.js wait --workers …` exits 0 after real idle/exit (not hand-written JSON)
- [ ] Nested off: worker recruit rejected in PTY
- [ ] maxWorkers limit message; after idle, recruit allowed again

## Lifecycle

- [ ] Second crown takeover: previous crown off, workers failed results
- [ ] Close maestro panel: watcher stops
- [ ] Shell exit on maestro: crown **Paused**, re-arm after restart shell
- [ ] Quit/reopen app: one maestro flag; re-arms when PTY live

## Platforms

- [ ] Windows RC
- [ ] macOS RC  
- Linux pack optional (not a soak gate)
