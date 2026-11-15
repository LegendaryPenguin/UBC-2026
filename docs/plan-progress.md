# Active build plan and progress: corrected four-board storyboard

This file tracks the work I am pursuing. The active target is exactly the user's corrected four-board journey: Explore a Gemini question → speak/refine and confirm a view → inspect its basket → compare and review before choosing. Preserve VFINAL's detailed interaction and recovery behavior for every retained control. The full VFINAL product and its standalone account, order operations, position lifecycle, settlement/claims, support, and monitoring modules are reference scope, not active milestones.

**Bounty priority:** 1) Gemini live market data, contract meaning, and provenance; 2) ElevenLabs voice for research/view clarification and basket/scenario explanation, with text parity; 3) Arc as a distinct custom construction/review option when useful and genuinely available. These stay within the four boards. Opening Review is read-only and cancelable; placing an order or onchain transaction is beyond the current completion target.

**Current estimate:** about 70% implemented and 45% verified against this four-board target. This is a rough engineering estimate, not a route count or a claim that live providers are qualified. The main remaining work is complete sequence walkthroughs, fixing any issues they expose, and verifying Gemini/ElevenLabs behavior where the environment allows.

## Work I am pursuing

1. Complete the Explore → Research sequence with Gemini as the primary source, exact contract/rule provenance, honest replay/live states, and visible evidence availability.
2. Complete text and ElevenLabs voice clarification through one shared application action. Preserve editable transcripts and manual view controls; voice never confirms a financial action.
3. Complete Build interactions for supported binary/range semantics, leg edits/removal, scenario payouts, mismatch warnings, invalid input, and refresh recovery.
4. Complete Compare and its read-only Review, including supported Gemini-first options, a conditional Arc custom option, basis/cost/fee uncertainty, maximum loss, rules, and safe cancel/back/retry.
5. Walk every retained sequence and update the control-to-handler checklist from observed behavior, then fix any in-scope defects.

Post-review trading, Gemini OAuth order management, funded Arc deployment/settlement/claims, broad Portfolio/position lifecycle, alerts, collaboration, support, and operator tooling are not part of this plan unless the user expands scope.

## Acceptance progress

| Storyboard step | Implemented | Remaining acceptance work |
| --- | --- | --- |
| 1. Explore the question | Explore search and Gemini catalog routes; event details; contract-level research links; price history; source rules and provenance; related contracts; evidence cards; replay/live labels. Live threshold labels no longer create a multi-contract family. | Live Gemini requests have not succeeded from this development environment, so inventory, current schema, returned order-book depth, and market freshness need a live response check. Live evidence ingestion is not connected; the page must keep showing that evidence is unavailable rather than use replay cards. |
| 2. Speak and refine | Text and ElevenLabs voice use the same research action. Transcript is editable; proposal is a separate preview; YES/NO single-contract views and listed-threshold views have manual controls; saving and confirming are separate actions. | Walk the full text sequence in a browser, including clarification, edit, save, confirm, cancel, refresh, and API failure. ElevenLabs Scribe transcription, microphone denial/device loss/interruption, and retry have not been verified in a browser here. |
| 3. Inspect the basket | Confirmed view stays in the workspace panel. Binary and range payoffs compile from supported scenarios. Basket legs can be edited/removed; scenarios show gross payout and outside-view mismatch; price references are distinct from executable cost. | Walk edit/remove/undo, every scenario, invalid size, refresh restoration, and cost-unavailable states. Verify that a single live Gemini contract remains a YES/NO view through Build and cannot be edited into a fabricated range. |
| 4. Compare before choosing | Comparison view includes supported constructions and an explicit basis. Gemini is preferred where verified and adequate; Arc custom is conditional on usefulness and real availability. Review is read-only and cancelable. | Walk select → review → back/cancel and retry after stale/unavailable data. Confirm unsupported alternatives disappear or explain unavailability, and that known costs, unknown fees, loss/payout, venue, mode, and settlement are clear. Execution itself is not an acceptance gate. |

## Current Gemini safety and data behavior

- Live threshold families are not inferred from similar contract labels. Each live Explore item is one Gemini contract with its real instrumentSymbol; missing symbols stay missing and are not fabricated.
- Each contract opens an independent YES/NO thesis. Related contracts are linked, but stay separate until their settlement semantics are verified together.
- Settlement lookup stores the source event ticker and exact selected contract IDs with the quote, then matches those identifiers and the immutable payout schedule against Gemini's final result.
- Event order-book levels are shown only when Gemini returns them under the exact instrument symbol. The current REST response has no source timestamp for those levels, so the UI shows receipt time and says the source time was not provided. A live WebSocket feed remains unqualified.
- Replay evidence and prices remain labeled as illustrative. The live evidence feed is not connected.
- No Gemini sandbox order, status check, and positions/fills qualification has been recorded. Native order placement remains disabled; this is a downstream capability gate, not a blocker for the four-board journey.

## Provider evidence within or beyond this journey

| Capability | Current evidence | State |
| --- | --- | --- |
| Gemini market discovery and contract data (priority) | REST adapter, market pages, payload hashes, timestamps, bid/ask/history mapping, and conditional depth mapping exist. A public API request failed because api.gemini.com did not resolve from this environment on November 14, 2026. | Core source path exists; live inventory, current response schema, and runtime freshness remain unverified and are in-scope acceptance work. |
| ElevenLabs voice (same research flow) | Server-side key configuration and a TTS smoke test were previously recorded in qualification.md; secrets are not printed or committed. | TTS recorded; transcription plus permission, interruption, and text-fallback behavior still need sequence verification. |
| Arc custom construction/review (conditional) | Compare and review code exists. No deployed escrow, funded maker, or verified test transaction is recorded. | The app must present Arc only when its distinct payoff is useful and the option is honestly available. Deployment, funded execution, settlement, and claims are beyond the current acceptance target. |
| Native Gemini trade execution (deferred) | OAuth/order code exists, but no sandbox order lifecycle has been qualified. | Disabled pending qualification; order lifecycle is outside the four-board completion target. |

## Verification record

- Current source changes are uncommitted and still under verification.
- The automated suite last reported 19 tests passing; the final scoped changes still need the requested end-to-end sequence and code verification.
- interaction-checklist.md contains the control-to-handler map. The browser sequence is not yet recorded as complete.
- qualification.md retains provider-specific evidence and dates.
