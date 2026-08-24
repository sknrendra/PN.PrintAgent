# printagent

A CLI (and optional HTTP server) that prints a part-number label to
ZPL-compatible thermal printers. Physical label size and the printer
transport are both swappable via config files — nothing about a label size
or a specific printer is hardcoded into the tool.

## Install & build

```sh
npm install
npm run build
```

This compiles `src/` to `dist/`. Run the CLI with `node dist/cli.js ...`, or
during development skip the build step with `npm run dev -- ...` (runs
`src/cli.ts` directly via `tsx`).

## How to print

`printagent print` renders the bundled part-number-label template and sends
it to a printer. It needs three files:

```sh
node dist/cli.js print \
  --label examples/labels/label-50x30.yaml \
  --printer examples/printers/zd220-cups.yaml \
  --data examples/data/job.json
```

- `--label <file>` — physical label dimensions (see [Label spec](#label-spec)).
- `--printer <file>` — which printer and how to reach it (see
  [Configuring the transport](#configuring-the-transport)).
- `--data <file>` — job data as JSON: either a single object (one label) or
  an array of objects (batch-prints all of them). See `examples/data/job.json`
  and `examples/data/job-batch.json`.

Other flags:

- `--template <file>` — use a custom label layout instead of the bundled
  part-number-label template (see [Template](#template)).
- `--dry-run` — render the ZPL and print it to stdout instead of sending it
  to the printer. Always check a new label/template/printer combination this
  way before touching real stock.
- `--no-stripe` — skip the trailing separator stripe (see [Batches and the
  stripe](#batches-and-the-stripe)).

### Job data

Only the fields that actually vary per label need to be supplied — the
bundled template already hardcodes `country`/`lot_code` as static text and
derives the barcode from `part_number`:

```json
{
  "part_name": "PANEL S/A RR DOOR LH",
  "part_number": "67004-BZ660",
  "qty": "1"
}
```

Pass an array of these objects to `--data` to print several labels in one
invocation.

### Batches and the stripe

By default, a batch (whether it's a single job or an array of many) is
followed by one trailing separator stripe — a solid bar printed as its own
label, marking the end of that batch. A 5-job batch prints 6 labels total;
a 1000-job batch prints 1001. This is per-invocation, not a running count
across separate calls. Pass `--no-stripe` to skip it.

Internally, the whole batch (every label plus the stripe) is sent to the
printer as a **single** spool job — this is what makes a batch atomic even
if two people are printing at the same time: another caller's job can't get
spliced into the middle of yours at the print queue.

### Exit codes

| Code | Meaning |
|---|---|
| 0 | Success |
| 2 | Config error (bad/missing YAML or JSON, unreadable file) |
| 3 | Render error (e.g. a required data field is missing) |
| 4 | Transport error (the printer/queue/share couldn't be reached) |

## Configuring the transport

A `PrinterProfile` YAML file specifies the printer's DPI and how to reach
it. Two transports are supported today:

**CUPS** (Linux/macOS, printing through a local CUPS queue):

```yaml
schemaVersion: 1
name: "Zebra ZD220 (CUPS)"
dpi: 203
language: zpl
transport:
  type: cups
  queue: "ZTC-ZD220-203dpi-ZPL"   # the CUPS queue name (lpstat -p to list)
  # copies: 1                    # optional, default 1
  # timeout_ms: 15000            # optional
```

Bytes are sent via `lp -d <queue> -o raw`, so the ZPL reaches the printer
unmodified — the CUPS queue must be a raw/passthrough queue, not one that
rasterizes documents through a generic driver.

**Windows print share** (printagent running on the same Windows machine as
the printer, printer installed as a local/shared Windows printer):

```yaml
schemaVersion: 1
name: "Zebra ZD220 (Windows print share)"
dpi: 203
language: zpl
transport:
  type: windows
  share: '\\localhost\ZD220'   # \\<host>\<sharename>; \\localhost\... for a local printer
  # timeout_ms: 15000            # optional
```

Bytes are spooled via `cmd.exe /c copy /b <tempfile> <share>` — the standard
way to feed raw printer commands through a Windows queue without going
through GDI/driver rasterization. As with CUPS, this depends on the
printer's Windows driver actually being configured for raw passthrough;
verify with a real test print before trusting it.

See `examples/printers/` for both in full. Swapping printers/transports
never requires touching label, template, or job-data files — just point
`--printer` at a different profile.

## Label spec

Physical label geometry is separate from the printer, so the same label
size works across any printer/transport and vice versa:

```yaml
schemaVersion: 1
name: "50x30mm part-number label"
width_mm: 50
height_mm: 30
margin_mm: 2      # optional, default 0
darkness: 15       # optional, ZPL ^MD
speed_ips: 4        # optional, ZPL ^PR
```

DPI comes from the printer profile, not the label spec — the same label
stock can be fed into printers of different resolutions without editing the
label file.

## Template

The bundled default layout (`src/templates/partNumberLabelTemplate.ts`) is
tuned for a 50x30mm label on a 203dpi printer: part name, part number,
a Code128 barcode of the part number, qty, and two hardcoded fields
(country, lot code). It's a TypeScript object rather than a loadable file
(see [Building a Windows .exe](#building-a-windows-exe) for why), so
changing the default layout means editing that file directly.

For a different layout without touching code, pass `--template <file>`
pointing at your own template YAML — see the field-type reference in
`src/config/template.ts` for the `text`/`barcode` field shapes.

## HTTP server

`printagent serve` runs an HTTP server exposing the same printing
capability over `POST /print`, protected by a bearer token.

```sh
cp .env.example .env
# edit .env and set PRINT_KEY to a real secret

node dist/cli.js serve \
  --label examples/labels/label-50x30.yaml \
  --printer examples/printers/zd220-cups.yaml \
  --port 3000
```

The server refuses to start if `PRINT_KEY` isn't set (checked via `.env` or
directly in the environment) — it will not run unauthenticated.

```sh
curl -X POST http://localhost:3000/print \
  -H "Authorization: Bearer <PRINT_KEY>" \
  -d '{"part_name": "PANEL S/A RR DOOR LH", "part_number": "67004-BZ660", "qty": "1"}'
```

- Request body: same shape as a `--data` file (single object or array).
- `?dryRun=true` — render only, returns `{ "ok": true, "zpl": "..." }`
  instead of printing.
- `?stripe=false` — skip the trailing stripe for this request.
- `label`/`printer`/`template` are fixed at server startup (CLI flags
  above), never accepted from the request — a caller can only submit job
  data, not choose which files on disk get read.
- Concurrent requests are serialized internally, so two people printing at
  the same time never interleave at the printer.

If exposing this beyond localhost (e.g. tunneling with ngrok or an SSH
remote-forward), only the bearer token stands between the internet and your
printer — treat `PRINT_KEY` like any other production secret.

## Building a Windows .exe

For deploying to a Windows machine without requiring Node.js to be
installed there, `printagent` can be compiled into a single self-contained
executable with [Bun](https://bun.sh):

```sh
# install Bun once: curl -fsSL https://bun.sh/install | bash
npm run build:exe
```

This cross-compiles `dist-exe/printagent.exe` for Windows — works from
Linux/macOS, no Windows machine needed to build it. Bun must be on `PATH`;
note that its installer only adds it to your shell rc file, so a fresh
non-interactive shell (e.g. CI) needs `~/.bun/bin` on `PATH` explicitly.

The compiled exe behaves identically to `node dist/cli.js` — same
subcommands, same flags. Copy `printagent.exe` (and a `.env` next to it, if
using `serve`) to the target machine and run it directly.

## Development

```sh
npm test          # vitest
npm run typecheck  # tsc --noEmit, including tests
npm run lint       # eslint
npm run build      # tsc -p tsconfig.json
```
