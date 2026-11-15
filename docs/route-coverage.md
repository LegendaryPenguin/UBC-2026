# Route coverage

This inventory maps the existing routes to the final product contract. Routes listed as partial have an implementation or interface in the repository and still require acceptance testing.

| Routes | Controls and backing code | Current coverage and remaining work |
| --- | --- | --- |
| `/`, `/home`, `/workspace` | Landing and workspace links, account drafts through `GET /api/theses` | Partial. Personal dashboard, action ordering, and editable home layout still need validation. |
| `/auth`, `/onboarding`, `/settings/*` | Local codes through `/api/auth`, preferences through `/api/account` | Demo codes are development-only. Production identity, verified wallet linking, recovery, and complete account closure are open. |
| `/explore`, `/search`, `/calendar`, `/watchlists/*` | Mode-aware topics, search, event list, watchlist APIs | Recorded discovery is available. Live inventory and full search, reminder, export, sharing, and deep-link acceptance are open. |
| `/topics/:slug`, evidence detail, `/theses/:id`, history | Topic and evidence reads, text and voice tools, draft save and confirm | Drafts and confirmation are wired. Durable version history, source revisions, research deltas, and provider-backed voice remain open. |
| `/theses/:id/build`, compare, review, `/quotes/:id` | Payoff compiler, chart, USDC validation, quote request and exact table | Replay and paper paths. Live execution and full native comparison require provider and contract qualification. |
| `/wallet/*`, `/orders` | Wallet connect, Arc configuration, funding and order pages | Provider funding, native Gemini orders, and complete allowance and withdrawal reconciliation are open. |
| `/portfolio`, `/positions/*`, `/activity`, `/transactions/:id` | Paper quote acceptance and portfolio through `/api/positions` | Paper positions are bound to the original draft and account. Live position recording is gated pending receipt verification. Live exits and audited valuation are open. |
| `/alerts`, `/notifications` | Alert and inbox APIs | Basic interfaces. Scheduled evaluation, delivery reliability and preferences require end-to-end verification. |
| `/journal/*`, `/reports`, `/publish/:id`, `/shared/:token`, `/profile/:handle` | Journal views, reports API, sharing snapshots | Ownership and rationale redaction are enforced at snapshot creation. Collaboration, moderation, revocation, accounting export provenance, and profile controls remain open. |
| `/help/*`, `/support/*`, `/status` | Help articles, ticket API, integration status API | Partial. Support authorization, status evidence and incident lifecycle require completion. |
| `/maker/*`, `/ops/*` | Maker policy, settlement handler, Streams webhook | Partial. Multi-maker funding and caps, curation, resolver review, and a deployed Stream need qualification and operational acceptance tests. |

Automated tests currently cover payoff compilation and comparison. The [qualification record](qualification.md) tracks external evidence. The [product contract](PROJECT_SPEC.md) defines the remaining control-level acceptance requirements.
