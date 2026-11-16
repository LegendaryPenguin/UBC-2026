# Hackathon scope: corrected Thesis storyboard

This is the active implementation scope and source of truth: the user's corrected four-board storyboard, read top-left, top-right, bottom-left, bottom-right, plus the narrated optional follow-through into execution, Portfolio, and History. VFINAL supplies interaction detail for retained features; it does not expand this target to the full original product catalog.

**Bounty order:** Gemini is the priority, centered on accurate live market discovery, contract rules, and source provenance. ElevenLabs voice is included in research and view clarification, with equivalent manual text actions. The Arc custom-position path is included in Build/Compare/Review when it adds value and its actual capability is available. These are parts of the same journey, not separate product scopes.

Users can stop after research or comparison. If they continue, the active path includes a clear, cancelable Review, explicit authorization for a supported execution, and accurate follow-through in Portfolio and History. Use Paper when live/sandbox capabilities are not qualified; never present simulated success as a real order or transaction. One position settlement alert is included: it checks position state when the user opens or refreshes Alerts and creates an in-app notification; background and push delivery are not included. Full account administration, broad alert infrastructure, collaboration, support, and operator modules remain outside scope. Track progress in [plan-progress.md](plan-progress.md) and controls in [interaction-checklist.md](interaction-checklist.md).

## Product journey

Thesis is one continuous journey: **Explore a question → develop and confirm a view → inspect a basket → compare before choosing**. Trading is optional. The workspace shell stays familiar while the active Research, Build, or Compare canvas changes. The confirmed view stays visible, and evidence stays attached to its research area.

Primary navigation is **Explore, My Theses, Portfolio**. A thesis workspace has **Research, Build, Compare, History** tabs. Supporting pages remain reachable through More or through the relevant action; they do not compete with the main journey. Consolidating routes this way changes where interactions happen, not whether their detailed behavior is implemented.

### 1. Explore the question

- Start at Explore. Search a topic, open a supported Gemini market, or resume a draft from My Theses.
- Show the contracts actually returned for the active data mode, their settlement question/rules, market-price history when supplied, evidence, and an invitation to describe a view.
- Research does not require account funding or wallet connection. Saving watched topics requires an account; unauthorized users get an explanation and can continue researching.
- Never present replay history as live Gemini history. Do not invent contracts, evidence, prices, or a compatible payoff when provider data is absent.

### 2. Speak and refine

- Voice and text call the same research/view actions. Microphone permission is requested only after the user starts recording. Transcript text remains visible and editable.
- Clarify material ambiguity (such as closing price versus touching a range), show the proposed view and relevant supporting/challenging evidence, and keep manual editing available.
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
