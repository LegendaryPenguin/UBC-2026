# Product scope: Dashboard + contextual assistant

This is the active scope, updated by the user's November 18, 2026 restructure note. [product-restructure-map.md](product-restructure-map.md) maps current routes to keep, merge, supporting deep link, private operational, or deferred UI. The old four-board storyboard below remains the detailed reference for the research→view→basket→compare journey, but its earlier three-item navigation and route-heavy presentation are superseded.

## Navigation and product frame

Use four main destinations: **Dashboard, Explore, My Theses, Portfolio**. The logo and signed-in entry route open Dashboard. Account/settings live in a profile menu. A thesis has a connected Research → Build → optional Compare workspace, with History reachable throughout. Supporting interactions use contextual panels or deep links rather than competing as standalone destinations.

Dashboard is the user's next-step surface: greeting, Start a thesis, prominent recent/current thesis with workflow state and last completed step, other recent theses, verified updates, compact portfolio summary, and Ask Thesis. Empty state invites a question and links to supported topic examples and Explore. “Continue” restores the last meaningful workspace state, including saved inputs and selections.

Explore combines supported Gemini discovery, search, category/status/horizon filters, watched markets, and relevant market movement. Opening a market starts a draft Research context or offers attachment to an existing thesis only after checking contract compatibility. Research never requires a wallet or funding.

My Theses is the full library, distinct from Dashboard: search/filter drafts, active, traded, and archived work; open/continue, rename, duplicate, archive, and permit deletion only where safe. Archive does not sell a position. Deleting a draft never deletes immutable financial records.

Portfolio consolidates positions, orders, and activity into tabs/panels. Preserve separate Paper, Gemini, and Arc environments and balances. Position detail, transaction detail, and quote review can remain contextual panels with deep links. Keep only supported exit/claim actions visible.

## One contextual assistant

One assistant system appears as Ask Thesis outside a thesis workspace and as the same saved thesis conversation in the workspace's built-in rail. The global thread list retains thesis-linked threads for later reopening. Never show a duplicate floating assistant inside the workspace. On mobile, use a bottom sheet/full-height surface with a clear return action.

The assistant can explain the current page, find markets, start a thesis, retrieve authorized saved work, open known destinations, focus supported evidence/chart filters, propose a view edit, and explain a basket/scenario. Use bounded structured actions, not arbitrary generated URLs or DOM clicks. Direct navigation requests can execute and report what opened; inferred thesis/view changes appear as proposals and require user confirmation. Unsaved work is autosaved where possible or receives explicit save/discard/cancel choices.

Conversations are server-side and linked either to a general conversation or a thesis. Guest research and drafts remain usable without sign-in under a guest cookie; successful development email-code verification moves guest-owned records to the account without changing record IDs. Google and signed-wallet authentication are not configured. Starting a thesis carries only relevant context into its thread. Keep user statements, assistant suggestions, confirmed revisions, current provider data, and executed terms distinct. Do not use generated summaries as financial terms. Voice and text share actions; voice cannot approve or submit a financial action.

## Identity and context

Use Google or verified-wallet sign-in only after a real identity provider is configured; neither is currently available. Wallet connection is distinct from signed authentication. Use one internal user ID and link identities only after proof of control of both. The current email-code flow is development-only and never presented as production account sync. Connecting a Gemini account or execution wallet is a separate contextual step when needed.

## Keep the detailed user journey

Preserve the established flow: Explore a question → inspect Gemini rules/data/evidence → clarify and confirm a view using voice or text → Build and inspect scenario outcomes → optionally Compare supported constructions → review exact terms → explicitly authorize a supported Paper/sandbox/testnet action → follow the result in Portfolio → revisit revisions and execution-linked history. Users may stop after Research or Compare, and may skip Compare. Contract meaning, permissions, validation, exact result states, and cancel/back/refresh/failure/retry behavior remain complete when pages are consolidated.

Gemini is the integration priority. Arc remains a distinct complementary construction only when useful and available. Keep ElevenLabs credentials server-side and provide complete text alternatives. Keep QuickNode only for a real onchain ingestion job.

## Remove from visible product navigation

Merge the duplicate Home page into Dashboard; Gemini catalog, Search, Calendar, and simple watch management into Explore; standalone Journal into History; Orders and Activity into Portfolio; and redundant account/settings pages into the profile-menu Settings surface. Remove standalone profile/social, publishing unless polished, report export, support-ticket, multi-step onboarding, and instruction-only deposit/withdraw pages from the active navigation/product. Keep concise contextual help, wallet connection/funding guidance, required callbacks, security checks, immutable financial records, and private operations. Preserve working backend capabilities until dependency review permits a separate retirement.

See [plan-progress.md](plan-progress.md), [interaction-checklist.md](interaction-checklist.md), and [product-restructure-map.md](product-restructure-map.md) for work and migration state.

## Product journey

Thesis is one continuous journey: **Explore a question → develop and confirm a view → inspect a basket → compare before choosing**. Trading is optional. The workspace shell stays familiar while the active Research, Build, or Compare canvas changes. The confirmed view stays visible, and evidence stays attached to its research area.

Primary navigation is **Dashboard, Explore, My Theses, Portfolio**. A thesis workspace has **Research, Build, Compare, History** tabs. Supporting pages remain reachable through Profile or through the relevant action; they do not compete with the main journey. Consolidating routes this way changes where interactions happen, not whether their detailed behavior is implemented.

### 1. Explore the question

- Start at Explore. Search a topic, open a supported Gemini market, or resume a draft from My Theses.
- Show the contracts actually returned for the active data mode, their settlement question/rules, market-price history when supplied, evidence, and an invitation to describe a view.
- Research does not require account funding or wallet connection. Saving watched topics requires an account; unauthorized users get an explanation and can continue researching.
- Never present replay history as live Gemini history. Do not invent contracts, evidence, prices, or a compatible payoff when provider data is absent.

### 2. Speak and refine

- Voice and text call the same research/view actions. Microphone permission is requested only after the user starts recording. Transcript text remains visible and editable.
- Clarify material ambiguity (such as official settlement versus a price touch) before proposing a view. Keep the prior turn attached to the answer; for a supported multi-threshold family, ask the user to accept or edit the listed range boundaries. A single YES/NO contract cannot be presented as a bounded range.
- Show the proposed view and relevant supporting/challenging evidence, and keep manual editing available. Text and voice can answer the same clarification; a preview stays absent until it is resolved.
- A proposal is a draft until the user confirms it. Confirm validates the supported market semantics and saves a version; failure preserves edits. Cancel/back does not confirm or silently discard dirty work.
- Permission denial, missing microphone, muted input, interruption, provider/network error, and retry all leave a usable text path. Voice may prepare a review, never authorize a financial action.

### 3. Inspect the basket

- Build requires a confirmed view. Keep its summary visible while the user changes legs and scenarios.
- Every leg exposes its contract, side, allocation, price/cost basis when available, and edit/remove controls. Unsupported fields or stale/missing quotes are labeled; don't imply an executable cost without a valid price basis.
- Scenario selection updates the combined gross payout and highlights the matching row/chart. Compare this with the desired view and disclose outcomes paid outside the view.
- Basket edits are a proposal, not an order. Removing a leg can be undone while the page remains open; refresh returns to the last saved basket. Errors preserve current edits for retry.

### 4. Compare before choosing

- Compare starts from the current construction and shows only alternatives that the actual contracts and configured providers can support. Gemini is preferred where it adequately expresses the view. An Arc custom position appears only when it adds value and an appropriate paper or firm-quote path exists.
- Comparisons use an explicit common basis, show scenario outcomes, known/reference costs and unknown fees, losing scenarios, and execution differences. Do not describe gross payout as profit or reference quotes as guaranteed fills.
- The user can return to Build, select a construction, or open Review. Review precedes any execution and names venue, mode, exact legs, cost/fees, maximum loss, settlement rules, and multiple-order/partial-fill risks.
- Voice can explain or prepare the review. It cannot approve a financial action. Review is cancelable; an explicit user action is required to continue through a qualified Paper, Gemini sandbox, or Arc testnet path. Any Paper construction must say Paper.

### 5. Review and optionally execute

- Review opens only for the selected construction and shows its exact current terms: legs, venue, environment, known cost and fees, maximum loss, possible payouts, settlement rules, and order count/partial-fill implications. Unknown values are labeled.
- Connecting an account or wallet and granting permissions happen only when needed for the selected supported action. Research, saved views, Build, and Compare never require funding.
- The user explicitly authorizes each financial action. Voice can prepare a review but cannot approve, sign, or submit. Cancel/back creates no order or transaction.
- Show the actual result state: paper-created, submitted, pending, filled, partially filled, failed, or unknown. Unknown submissions are reconciled before retry; never blindly resubmit. If a provider is unqualified, route to clearly labeled Paper or explain why execution is unavailable.

### 6. Portfolio and position follow-through

- Link a resulting paper/testnet/live position to the thesis and exact selected construction. Show current status, venue, environment, source rules, entry reasoning/evidence, and relevant market changes.
- Revisit thesis returns to Research. Editing a thesis never changes an existing position. A signed-in user can set, pause, or resume an in-app settlement alert for that position. The alert checks on Alerts page load/refresh; it does not promise background or push delivery. Show an exit action only when a venue actually supports it; otherwise state the limitation and preserve the position.
- At resolution, show venue-backed status and any available settlement/claim action. Paper outcomes are labeled Paper; unverified external state is never shown as settled or paid.
- Empty portfolio, unavailable provider, stale position, pending transaction, partial fill, failed claim, and retry states have an explicit next action.

### 7. My Theses and History

- Reopen the same thesis from My Theses. History links the original view, later revisions, selected basket, any executed version, and actual outcome when available.
- Duplicate creates a separate draft and preserves prior reasoning/history. Restore creates a new version instead of rewriting the past.
- Loading, unauthorized, empty, and failure states offer a safe route back or retry. A saved thesis remains useful even when the user never trades.

## Journey-level invariants

- The confirmed view stays anchored on Research, Build, and Compare; changing a basket does not silently rewrite that view.
- Evidence stays in Research and is associated with its source and stance; it does not jump or reorder unpredictably as the user moves through the journey.
- Every control has an intentional handler and an enabled/disabled condition. Loading, success, empty, permission, unauthorized, stale data, provider failure, cancel, refresh, and retry states have clear next actions.
- A user can stop after research, save a thesis without trading, skip Compare, and return to History or Portfolio later.
- Revising a view does not mutate an open position; executed terms and venue state remain linked to the thesis version used at review.
- External qualification is separate from UI completeness. Missing provider capabilities must be visibly unavailable, never simulated as a successful trade.

## Definition of done and acceptance sequence

1. Explore → search/open a supported topic → inspect contract rules, history, and evidence.
2. Speak or type → resolve a material ambiguity → edit proposal → confirm → verify the saved view and enabled Build action.
3. Build → adjust or remove a leg → select each scenario → verify payout and mismatch warnings → refresh and confirm restoration behavior.
4. Compare → inspect supported alternatives on the stated basis → return to Build or select one → open Review → inspect exact available terms → cancel/back without execution.
5. If choosing to trade, explicitly authorize a qualified action → verify its actual paper/sandbox/testnet result state → recover safely from pending, partial, unknown, or failed outcomes.
6. Open Portfolio → follow the linked position, inspect saved reasoning/rules and current state → set/pause/resume a settlement alert → refresh Alerts after resolution and inspect its in-app notification → use only supported exit or claim actions.
7. Open My Theses/History → inspect revisions and selected construction → duplicate into a new draft without overwriting the original.

Complete these sequences through backend/integration tests and verify the UI handlers in code against the storyboard. Cover loading, success, empty, permission, stale data, provider failure, cancel/back, refresh, and retry. Keep manual text usable if voice fails; never treat a proposed view as confirmed or a reference price as an executable cost. Gemini is preferred when its verified contracts support the exposure. Arc appears only as a distinct useful option with an honest availability state. No financial action may be authorized by voice. Trading is optional, but every retained follow-through control must work or explain its unavailable capability clearly.

The control-to-handler sequence and verification status live in [interaction-checklist.md](interaction-checklist.md). [route-coverage.md](route-coverage.md) and [qualification.md](qualification.md) record reference routes and external capability evidence; they are not independent project backlogs.
