# Active build plan and progress: complete Thesis MVP flow

This file tracks the work I am pursuing. The active target is the user's corrected four-board workspace plus the complete narrated follow-through: Explore → speak/refine and confirm → inspect basket → compare/review → optionally authorize a supported action → follow it in Portfolio → revisit the thesis in History. Preserve VFINAL's detailed interaction and recovery behavior for every retained control. Unrelated standalone account administration, support, broad monitoring/collaboration, and operator modules remain reference scope.

**Bounty priority:** 1) Gemini live market data, contract meaning, and provenance; 2) ElevenLabs voice for research/view clarification and basket/scenario explanation, with text parity; 3) Arc as a distinct custom construction and optional paper/testnet action when useful and genuinely available. Trading remains optional, but any supported action shown must have a complete review, authorization, result, and recovery path.

**Current estimate:** About 90% of the active MVP is implemented and about 85% verified through backend tests, typechecking, production build, UI-handler/code review, and a live ElevenLabs TTS→Scribe round trip through the app. This is the seven-step narrated MVP only. The remaining verification is live Gemini runtime access, physical microphone permission/device behavior, detailed browser UI state sequences, and external Gemini/Arc execution qualification; the complete local Paper journey is covered by API integration tests. ElevenLabs currently uses a safe, turn-based Scribe → shared research action → optional spoken response flow; it is not a continuous streaming conversation.

## Work I am pursuing

1. Complete Explore → Research with Gemini as the primary source, exact contract/rule provenance, honest Replay/Live states, and clear evidence availability.
2. Complete text and ElevenLabs voice clarification through shared application actions; preserve editable transcripts and manual controls; voice never confirms a financial action.
3. Complete Build for supported binary/range semantics, leg edits/removal, scenario payouts, mismatch warnings, invalid input, and saved-basket recovery.
4. Complete Gemini-first Compare and conditional Arc construction, then a selected-construction Review with basis/cost/fee uncertainty, maximum loss, rules, and safe cancel/back/retry.
5. Complete explicit authorization and result handling for supported Paper, Gemini sandbox, or Arc testnet actions. Never fabricate live submission or fills; reconcile unknown results before retry.
6. Complete Portfolio follow-through for the resulting state, linked thesis and reasoning, supported alerts/exits, settlement outcome, and unavailable/empty states.
7. Complete My Theses/History revisions, restore-as-new-version, and duplicate-as-new-draft.
8. Add backend/integration tests for the sequences and failure recovery. Verify UI handler/state wiring in code without relying on repeated screen checks.

Production deployment, funded real-money operation, full operator tooling, unrelated account administration, support, collaboration, and background/push alert infrastructure are not part of this MVP. The retained position settlement alert is checked when a signed-in user opens or refreshes Alerts and writes an in-app notification.

## Acceptance progress

| Storyboard step | Implemented | Remaining acceptance work |
| --- | --- | --- |
| 1. Explore the question | Explore search and Gemini catalog routes; event details; contract-level research links; price history; source rules and provenance; related contracts; evidence cards; replay/live labels. Live threshold labels no longer create a multi-contract family. | The live public catalog and app parsing succeeded November 15, 2026 (208 compatible families on the latest pull), and a live event-detail request returned contract identifiers, terms URLs, status, expiry, and payload hash. Current depth freshness, individual terms/settlement compatibility, and live evidence ingestion still need verification; the page must show evidence unavailable rather than use replay cards. |
| 2. Speak and refine | Text and ElevenLabs voice use the same research action. Transcript is editable; proposal is a separate preview; YES/NO single-contract views and listed-threshold views have manual controls; saving and confirming are separate actions. Spoken replies omit internal citation IDs and read the evidence titles. | API integration covers local research, supported-range validation, save, confirm, and history. Mocked route tests cover TTS and Scribe request/response handling, server-side key use, validation, and provider errors. A live TTS→Scribe round trip through the local app succeeded. Code review covers transcript edit, mic permission denial/device loss/interruption, mute, cancellation, retry, and text fallback; physical browser capture remains unverified. |
| 3. Inspect the basket | Confirmed view stays in the workspace panel. Binary and range payoffs compile from supported scenarios. Basket legs can be edited/removed; scenarios show gross payout and outside-view mismatch; price references are distinct from executable cost. | Payoff unit tests cover supported schedules; typecheck and code review cover edit/remove/restore, scenario selection, invalid size, refresh restoration, and cost-unavailable states. Verify live single-contract semantics remain YES/NO and cannot be widened into an invented range. |
| 4. Compare before choosing | Comparison view includes supported constructions and an explicit basis. Gemini is preferred where verified and adequate; Arc custom is conditional on usefulness and real availability. A selected construction opens a cancelable Review with contract/rule links, scenario payouts, environment, and cost/fee availability. | API sequence is covered through Paper quote and position creation. Check all construction variants, cancel/back, mode changes, stale data, and voice explanation handler wiring in code. |
| 5. Optional authorization and action | Paper/Arc quote and acceptance plus Gemini order handlers exist behind capability checks. No actual order or transaction has been initiated during this work. | API integration covers explicit Paper quote review/acceptance, duplicate handling, and Paper claim. Code review confirms live/sandbox paths remain gated; external pending/partial/unknown transaction reconciliation requires qualified provider/chain fixtures and remains unverified. |
| 6. Portfolio follow-through | Portfolio and owner-scoped position reads; Paper creation, settled outcome/claim, and a position settlement alert that writes an in-app notification on Alerts load/refresh are implemented. Arc receipt-backed paths remain conditional. | API integration covers position linkage, duplicate acceptance, Paper claim, alert create/pause/resume/trigger, and owner isolation. Check empty/unavailable UI states; keep background/push monitoring and unsupported exits unavailable; do not claim external qualification. |
| 7. My Theses and History | Thesis workspace, history, duplicate, and restore-as-new-revision APIs/pages exist. | API integration covers revised/confirmed view, quote/position timeline, duplicate, restore, and cross-owner reads. UI refresh and route error states are code-reviewed; no screen walkthrough was used. |

## Current Gemini safety and data behavior

- Live threshold families are not inferred from similar contract labels. Each live Explore item is one Gemini contract with its real instrumentSymbol; missing symbols stay missing and are not fabricated.
- Each contract opens an independent YES/NO thesis. Related contracts are linked, but stay separate until their settlement semantics are verified together.
- Settlement lookup stores the source event ticker and exact selected contract IDs with the quote, then matches those identifiers and the immutable payout schedule against Gemini's final result.
- Event order-book levels are shown only when Gemini returns them under the exact instrument symbol. The current REST response has no source timestamp for those levels, so the UI shows receipt time and says the source time was not provided. A live WebSocket feed remains unqualified.
- Replay evidence and prices remain labeled as illustrative. The live evidence feed is not connected.
- No Gemini sandbox order, status check, and positions/fills qualification has been recorded. Native order placement must remain gated until that capability is verified; Paper still exercises the application flow without claiming a real order.

## Provider evidence within or beyond this journey

| Capability | Current evidence | State |
| --- | --- | --- |
| Gemini market discovery and contract data (priority) | Live `/api/topics?mode=live` returned 208 parsed compatible families from Gemini's public API; `/api/gemini/events/:ticker` returned live event/contract metadata, and health changed to available. | Public discovery/detail paths verified. Per-contract settlement compatibility, depth freshness, authenticated OAuth, and native order lifecycle remain unqualified. |
| ElevenLabs voice (same research flow) | Server-side key configuration and live TTS→Scribe round trip are recorded in qualification.md; secrets are not printed or committed. Voice is integrated into topic Research, thesis view clarification, Build payoff, Compare, and Review. | Live provider adapters verified; recording/mute/interruption/permission recovery and text fallback are code-reviewed, but actual browser microphone/device behavior remains unverified. |
| Arc custom construction/review and Paper action | Compare, quote, review, paper acceptance, and position code exists. No deployed escrow, funded maker, or verified test transaction is recorded. | The app must present Arc only when useful. Paper lifecycle is active MVP work; testnet execution is explicitly unavailable until configured and verified. |
| Native Gemini trade execution (conditional) | OAuth/order code exists, but no sandbox order lifecycle has been qualified. | Must stay disabled until qualification; use clearly labeled Paper for the end-to-end MVP demonstration. |

## Verification record

- Final code and provider verification is complete for this checkpoint.
- Typecheck and all 27 unit/integration tests pass across eight files.
- Production build passes with every application and API route compiled.
- API integration coverage now exercises Explore → Research → confirm → Paper quote → Portfolio/History, duplicate/restore recovery, settled Paper claim, owner scoping, and settlement-alert trigger behavior. Live checks passed for Gemini catalog/event details and ElevenLabs TTS→Scribe. The browser/microphone permission sequence remains unverified; verification uses backend tests and code checks.
- interaction-checklist.md contains the active control-to-handler map; its statuses will be synchronized with the final verification run.
- qualification.md retains provider-specific evidence and dates.
