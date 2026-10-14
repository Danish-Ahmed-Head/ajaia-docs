# Ajaia Docs: engineering documentation set

| | |
|---|---|
| Document ID | AJD-IDX-001 |
| Version | 1.0 |
| Date | 2026-10-14 |
| Author | Danish Ahmed |
| Status | Final for submission |

This folder holds one document per lifecycle phase. Each one is **structured after** the IEEE / ISO/IEC/IEEE standard for that phase. They follow the standards' outlines and content items; they are not certified as compliant. All diagrams are Mermaid, so they render directly on GitHub.

## 1. Document map

| Phase | Document | Structured after | What it answers |
|---|---|---|---|
| Lifecycle (all phases) | this index | ISO/IEC/IEEE 12207:2017, software life cycle processes | How the whole job ran, end to end |
| Planning and control | [01-SPMP.md](01-SPMP.md) | ISO/IEC/IEEE 16326:2019, project management (successor of IEEE 1058) and IEEE 828-2012, configuration management | Lifecycle model, schedule, roles, risks, change control |
| Requirements | [02-SRS.md](02-SRS.md) | ISO/IEC/IEEE 29148:2018, requirements engineering (successor of IEEE 830) | What the system must do; use cases; traceability |
| Design | [03-SDD.md](03-SDD.md) | IEEE 1016-2009, software design descriptions | How it is built: context, components, data, interactions, deployment |
| Testing, V&V | [04-TEST.md](04-TEST.md) | ISO/IEC/IEEE 29119-3:2021, test documentation (successor of IEEE 829), and IEEE 1012-2016, V&V | How it was proven: plan, cases, defects, results |
| Decisions | [../DECISIONS.md](../DECISIONS.md) | ADR format | Every technology choice with options, evidence, accept/reject |
| Process record | [../SDLC.md](../SDLC.md) | n/a | Who/when/what/why per phase, defect log D1–D27 |
| Code explanation | [../CODE_WALKTHROUGH.md](../CODE_WALKTHROUGH.md) | n/a | Every file and library function, line by line |

## 2. Mind map of the whole process

```mermaid
mindmap
  root(("Ajaia Docs assessment"))
    Brief and context
      Ajaia AI-Native Full Stack Developer role
      4 hour timebox from 10:55 PKT
      Company research for interview prep
      Requirements R1 to R8
    Decisions
      ADR-001 Tiptap 3 editor
      ADR-002 Express 5 and vanilla JS with Vite
      ADR-003 Neon Postgres, PGlite for dev and tests
      ADR-004 Vercel Hobby, Render blocked by card check
      ADR-005 multer 2, mammoth, sanitize-html
      ADR-006 Simulated sign-in allowed by brief
      ADR-007 node test and Playwright
    Build iterations
      Iteration 1 walking skeleton
      Iteration 2 stable stack rebuild
      Hardening and security
      UI and UX redesign
      Stretch features
        Version history
        Presence indicators
        Export Markdown and PDF
        Roles owner editor viewer
    Quality
      38 API tests
      17 browser tests
      21 live smoke checks
      Two independent code reviews
      UI UX Pro Max audit
      Defect log D1 to D27
    Deployment
      GitHub public repo
      Vercel Build Output API
      Neon in AWS us-west-2
      Live URL ajaia-docs-three-pi
    Documentation
      README
      Architecture note
      AI workflow note
      IEEE set SPMP SRS SDD TEST
      Code walkthrough
    Submission
      Video walkthrough
      Google Drive folder
      Portal submission
```

## 3. End-to-end workflow

```mermaid
flowchart TD
  A["Read brief line by line"] --> B["Extract requirements R1-R8"]
  B --> C["Iteration 1: walking skeleton<br/>create, share, view-only"]
  C --> D["Research official docs<br/>and stable versions"]
  D --> E{"Defects or better<br/>options found?"}
  E -- "yes" --> F["Write ADR: options,<br/>evidence, accept or reject"]
  F --> G["Danish approves decision"]
  G --> H["Iteration 2: rebuild on chosen stack"]
  E -- "no" --> H
  H --> I["Harden: security, validation,<br/>error handling"]
  I --> J["UI and UX redesign"]
  J --> K["Stretch features"]
  K --> L{"Quality gate:<br/>lint, tests, build, E2E"}
  L -- "fail" --> M["Log defect, fix root cause,<br/>add regression test"]
  M --> L
  L -- "pass" --> N{"Danish approves push?"}
  N -- "no" --> O["Keep commit local"]
  N -- "yes" --> P["Push to GitHub"]
  P --> Q["Vercel builds and deploys"]
  Q --> R{"Live smoke checks pass?"}
  R -- "no" --> M
  R -- "yes" --> S["Independent code review"]
  S --> M
  S --> T["Documentation set"]
  T --> U["Video, Drive folder,<br/>portal submission"]
```

## 4. Development loop used for every task

Each task was kept small and went round this loop until it passed. Nothing was called done without the check command's output.

```mermaid
flowchart LR
  A["Pick smallest task"] --> B["Read official docs<br/>for the API used"]
  B --> C["Write the smallest<br/>complete change"]
  C --> D["Re-read the diff"]
  D --> E["npm run check<br/>lint, API tests, build"]
  E --> F["Playwright E2E<br/>in real Chrome"]
  F --> G{"All green and<br/>verified in browser?"}
  G -- "no" --> H["Find root cause"]
  H --> C
  G -- "yes" --> I["Update docs and<br/>defect log"]
  I --> J["Commit locally,<br/>no AI co-author trailer"]
  J --> A
```

## 5. Decision workflow (how each ADR was made)

```mermaid
flowchart TD
  A["Need a choice<br/>e.g. editor, DB, host"] --> B["List the landscape<br/>and community sentiment"]
  B --> C["Check each option against<br/>official docs and npm registry"]
  C --> D{"Stable release 1.0 or later,<br/>at least 7 days old?"}
  D -- "no" --> X["Reject: record reason"]
  D -- "yes" --> E{"Free for reviewers,<br/>rule R7?"}
  E -- "no" --> X
  E -- "yes" --> F{"Meets requirement<br/>with least build time?"}
  F -- "no" --> X
  F -- "yes" --> G["Accept: record evidence"]
  G --> H["Danish reviews and approves"]
  X --> I["Logged in DECISIONS.md"]
  H --> I
```

## 6. Deployment and release workflow

```mermaid
flowchart LR
  A["Local commit"] --> B{"Danish says push?"}
  B -- "no" --> A
  B -- "yes" --> C["git push to GitHub master"]
  C --> D["Vercel build:<br/>npm run build:vercel"]
  D --> E["vite build to static files"]
  D --> F["esbuild bundles API<br/>into one function"]
  E --> G[".vercel/output<br/>Build Output API v3"]
  F --> G
  G --> H["Production deploy<br/>region pdx1"]
  H --> I["Live smoke test<br/>21 checks against real Neon"]
  I --> J{"Pass?"}
  J -- "yes" --> K["Record result in TESTING.md"]
  J -- "no" --> L["Read Vercel logs,<br/>fix, new commit"]
  L --> A
```

## 7. Defect workflow

```mermaid
stateDiagram-v2
  [*] --> Found: test, review, log or browser check
  Found --> Logged: entry added to SDLC defect log
  Logged --> Diagnosed: root cause traced in code
  Diagnosed --> Fixed: smallest fix in shared code
  Fixed --> Verified: regression test added and suite green
  Verified --> Closed
  Fixed --> Diagnosed: test still fails
```

## 8. Timeline

```mermaid
gantt
  title Assessment day 2026-10-14, PKT
  dateFormat HH:mm
  axisFormat %H:%M
  section Analysis
  Read brief, requirements R1-R8        :a1, 10:55, 5m
  section Build
  Iteration 1 walking skeleton          :b1, 11:00, 13m
  Research and ADR-001 to 007           :b2, 11:13, 11m
  Iteration 2 stable stack              :b3, 11:17, 7m
  Hardening, security, tests            :b4, 11:24, 16m
  UI and UX redesign                    :b5, 11:43, 15m
  Stretch features                      :b6, 11:58, 16m
  section Deploy
  Render blocked, switch to Vercel      :d1, 12:14, 14m
  Fix Vercel 500s, go live, smoke 21/21 :d2, 12:28, 13m
  section Quality
  Independent review, 16 fixes          :q1, 12:41, 24m
  UX pass and Pro Max audit             :q2, 13:05, 34m
  section Documentation
  IEEE documentation set                :doc1, 13:39, 30m
  section Submission
  Video, Drive, portal by Danish        :s1, 14:10, 45m
```

Times come from the git log (`git log --date=format:%H:%M`) and the SDLC record. The last bar is planned, not done.
