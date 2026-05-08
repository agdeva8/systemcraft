# Contributing to SystemCraft

## Before you start

- Check open issues before filing a new one
- For large changes, open an issue first to discuss scope
- All PRs target `main`

## Setup

Follow the [Quick Start](README.md#quick-start) in the README.

## Development workflow

```bash
# Backend tests
cd backend && pytest tests/

# Frontend lint/type check
cd systemcraftUI && npm run lint

# Verify a scenario state boots and fails correctly
docker compose -p sc-dev \
  -f infra/scenarios/url_shortener/state0_baseline/docker-compose.yml \
  up -d --wait
k6 run infra/scenarios/url_shortener/state0_baseline/k6_script.js
docker compose -p sc-dev down -v
```

## Adding a scenario

1. Create `infra/scenarios/{name}/` with one subdirectory per state
2. Each state needs: `docker-compose.yml`, `k6_script.js`, `failure_spec.json`
3. Failure specs are non-negotiable — engineer the failure, don't discover it empirically (see [Failure Engineering](README.md#) in the README for the pattern)
4. Run the failure spec checklist for every state before opening a PR
5. Add the scenario to the scenario table in `README.md` and `CLAUDE.md`
6. Register new concepts in `knowledge-base/concept_catalog.json`

## Failure spec checklist

Every state must pass its `failure_spec.json` targets at the specified load before merging. Run three consecutive verification runs to confirm stability.

## Socratic prompt changes

Changes to `llm/socratic_system_prompt.txt` require 20+ test inputs showing the model asks questions only — no direct explanations, no answers. Include test transcripts in the PR description.

## PR guidelines

- Title: `feat:`, `fix:`, `infra:`, or `docs:` prefix
- Description: what fails and how you verified the fix
- Link the issue if one exists
- Keep PRs focused — one scenario or one feature per PR

## Code style

- Python: follow existing style, no new dependencies without discussion
- JavaScript/React: functional components, hooks only
- No inline comments explaining what code does — only why when non-obvious

---

## Contributors

| GitHub | Role |
|---|---|
| [@agdeva8](https://github.com/agdeva8) | Creator & maintainer |
