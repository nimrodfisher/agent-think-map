# Synthetic comparison corpus

`structural-pairs.json` contains 24 explicitly synthetic, non-human-reviewed pairs. Each has provider context, readable step specifications, materialized canonical `goodTrace` / `badTrace` arrays, and independently authored expected classifications/first-divergence row. These are fabricated canonical traces; the provider context does not mean they were captured from live Claude or Codex sessions. Adapter identity population is tested separately in each adapter suite.

The 12 scenarios per provider cover volatile paths/IDs/timestamps, extension changes, shell verbs/subcommands, HTTP methods, URL hosts, SQL operations/tables, insertion, omission, nested structure, and error outcome. Alignment unit fixtures additionally cover repeat ties, reorder confidence, turn boundaries and parent/subagent contexts.

Regenerate trace arrays from specifications using `node node_modules/vite-node/vite-node.mjs scripts/materialize-comparison-fixtures.ts`. This command never generates expected results. Golden expectations remain authored data. No private user data is present; all hosts are reserved example domains and paths/names are invented.

These fixtures cannot satisfy the real developer-pair usefulness gate. Follow `docs/brief-3-human-review.md` for that pending checkpoint.
