# SystemCraft — Claude Code Kickoff
## Paste this into Claude Code to start the build

---

## Environment Setup (do this before opening Claude Code)

```bash
# 1. Create the workspace
mkdir systemcraft && cd systemcraft

# 2. Copy plan.md here
cp ~/Downloads/systemcraft_plan.md ./plan.md

# 3. Set your API key
export ANTHROPIC_API_KEY=sk-ant-your-key-here

# 4. Verify Docker is running
docker ps

# 5. Open Claude Code
claude
```

---

## The Kickoff Prompt (paste this into Claude Code)

```
Read plan.md carefully — the entire file.

You are building SystemCraft, a distributed systems concept trainer.
Full specification is in plan.md. Follow it exactly.

Your constraints:
- ANTHROPIC_API_KEY is set in environment — use it for the Opus /diagnose endpoint
- Docker is running and available
- Build everything locally in this directory
- Follow the build order in plan.md step by step
- Run verification checks after each step before proceeding
- Surface to me only when the plan says to

Start with Step 1: verify the environment.
Then write contract.json.
Then follow the build order.

Do not ask me questions that the plan already answers.
Do not skip verification steps.
Do not proceed to the next step if the current step's verification fails.

Go.
```

---

## What Happens Next

Claude Code will:

1. Read plan.md (~5 minutes of processing)
2. Run environment checks, report results
3. Write contract.json, show you for a quick review
4. Start building infra — Docker Compose files, k6 scripts, Postgres seed
5. Build backend FastAPI
6. Build frontend Next.js
7. Wire everything together
8. Run verification loops
9. Surface to you with a working demo

**Your involvement:**
- Review contract.json when it asks (10 minutes)
- Answer any of the 4 surface conditions in plan.md
- Do the final 8-step verification at the end

**Timeline:** 4–6 days depending on how much tuning the infra needs.

---

## If Claude Code Gets Stuck

If it surfaces something unexpected, paste this:

```
Check plan.md section [section name] for guidance on this.
If plan.md doesn't cover it, make the pragmatic engineering 
decision and document what you chose and why in a DECISIONS.md file.
Continue building.
```

---

## Files in This Repo

- `CLAUDE.md` — Claude Code reads this first (architecture, build order, failure specs)
- `systemcraft_plan.md` — detailed build instructions (directory structure, contract.json, step-by-step)
- `systemcraft_build_plan.md` — week-by-week timeline and task breakdown
- `systemcraft_complete.md` — full product vision and competitive positioning
- `systemcraft_demo.html` — open in browser to see the target UI
- `knowledge-base/` — 19 hellointerview articles as markdown + concept_catalog.json
