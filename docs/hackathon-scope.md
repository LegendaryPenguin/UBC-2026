# Hackathon scope: corrected Thesis storyboard

This is the active implementation scope and source of truth: the user's corrected four-board storyboard, read top-left, top-right, bottom-left, bottom-right. VFINAL supplies interaction detail for retained features; it does not expand this target to the full original product catalog.

**Bounty order:** Gemini is the priority, centered on accurate live market discovery, contract rules, and source provenance. ElevenLabs voice is included in research and view clarification, with equivalent manual text actions. The Arc custom-position path is included in Build/Compare/Review when it adds value and its actual capability is available. These are parts of the same journey, not separate product scopes.

The active acceptance path ends with a clear, cancelable Review before a user chooses whether to execute. Live trade placement, ongoing position management, settlement/claim operations, and standalone account, support, alerts, collaboration, or operator modules are not completion blockers. Any navigation controls retained in the interface must lead to a working page or a clear empty/unavailable state. Track progress in [plan-progress.md](plan-progress.md) and controls in [interaction-checklist.md](interaction-checklist.md).

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
- Voice can explain or prepare the review. It cannot approve a financial action. The review in these boards is read-only and cancelable; native order placement remains a separate, deferred capability. Any Paper construction must say Paper.

## Journey-level invariants

- The confirmed view stays anchored on Research, Build, and Compare; changing a basket does not silently rewrite that view.
- Evidence stays in Research and is associated with its source and stance; it does not jump or reorder unpredictably as the user moves through the journey.
- Every control has an intentional handler and an enabled/disabled condition. Loading, success, empty, permission, unauthorized, stale data, provider failure, cancel, refresh, and retry states have clear next actions.
- A user can stop after research, save a thesis without trading, skip Compare, and return to History or Portfolio later.
- External qualification is separate from UI completeness. Missing provider capabilities must be visibly unavailable, never simulated as a successful trade.

## Definition of done and acceptance sequence

1. Explore → search/open a supported topic → inspect contract rules, history, and evidence.
2. Speak or type → resolve a material ambiguity → edit proposal → confirm → verify the saved view and enabled Build action.
3. Build → adjust or remove a leg → select each scenario → verify payout and mismatch warnings → refresh and confirm restoration behavior.
4. Compare → inspect supported alternatives on the stated basis → return to Build or select one → open Review → inspect exact available terms → cancel/back without execution.

Complete the sequence in the UI with its loading, success, empty, permission, stale-data, provider-failure, cancel/back, refresh, and retry behavior. Keep manual text usable if voice fails; never treat a proposed view as confirmed or a reference price as an executable cost. Gemini is preferred when its verified contracts support the exposure. Arc appears only as a distinct useful option with an honest availability state. No financial action may be authorized by voice. The header's My Theses and Portfolio navigation and the workspace's History tab must work as supporting destinations, but full account administration and the post-trade portfolio/settlement lifecycle are not required to complete the four boards.

The control-to-handler sequence and verification status live in [interaction-checklist.md](interaction-checklist.md). [route-coverage.md](route-coverage.md) and [qualification.md](qualification.md) record reference routes and external capability evidence; they are not independent project backlogs.
