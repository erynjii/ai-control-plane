# AI Control Plane

Project workspace folder for the AI Control Plane MVP.

## Tests

```
npm test
```

Tests are colocated with source (e.g. `lib/agents/strategy.ts` is exercised
by `lib/agents/strategy.test.ts`). Vitest is configured in
`vitest.config.ts`.

### Test environment per file extension

`vitest.config.ts` uses `environmentMatchGlobs` to pick the test env from
the file extension:

- `*.test.ts`  → `node` (no DOM, fast). Use for pure logic.
- `*.test.tsx` → `jsdom`. Use for React components rendered with
  `@testing-library/react`.

The default env stays `node`, so anything outside the include glob is not
forced into a browser. `vitest.setup.ts` registers
`@testing-library/jest-dom` matchers (`toBeInTheDocument`, etc.) globally;
node-env tests don't use them and pay no runtime cost.

`environmentMatchGlobs` is deprecated in Vitest v3 (replaced by the
`projects` API). Update when the repo bumps to v3.

## Running the v2 agent pipeline (experimental)

`/api/generate-post` has two code paths:

- **v1 (default)** — single-shot JSON chat completion + image generation.
  Byte-identical to the original behavior.
- **v2** — multi-agent pipeline: Strategy → Copy + Photo (parallel) →
  Brand → auto-select → Compliance. Persists the full `PipelineContext`
  (brief, variants, flags, stepLog) in the `pipeline_runs` table; the
  `assets` row shape is the same as v1 so downstream UI doesn't branch
  on pipeline version.

Enable v2 per workspace via `PIPELINE_V2_WORKSPACES` (comma-separated):

```
PIPELINE_V2_WORKSPACES=ws_internal,ws_beta_customer
PIPELINE_COST_CAP_USD=0.50  # optional; default 0.50 USD per run
```

Workspaces not listed get the v1 flow.

Migrations required:

- `supabase/migrations/0010_create_pipeline_runs.sql`

Pipeline detail (brief / variants / flags / stepLog) is joined on
`assets.id = pipeline_runs.asset_id` when needed — wired into the approval
card and activity timeline in subsequent PRs.
