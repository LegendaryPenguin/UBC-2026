# Thesis — extensive product and build specification

Version 1.0 · Research checked November 15, 2026 · Target: UBC 2026 hackathon

**Working pitch:** Understand what markets expect. Decide where you disagree. Build a position that pays in the scenarios you believe in.

**The product in one sentence:** Thesis turns a researched opinion into an explicit, fully collateralized prediction-market payoff, using Gemini market data and outcomes and Arc USDC contracts.

This is a proposed implementation specification, not a claim that the described application is already built. Named example prices, probabilities, balances, quotes, markets, and dates below are illustrative unless explicitly identified as retrieved facts. Validate actual Gemini inventory before selecting the demo topic. “Gemini” means the Gemini exchange and its prediction-market APIs, not Google's Gemini model.

---

## Contents

1. Product decision and winning wedge
2. Hackathon strategy and scope
3. Reference repositories: precise reuse guidance
4. User model and complete journeys
5. Information architecture and visual system
6. Page-by-page interaction specification
7. Shared controls and transaction experience
8. Financial model and payoff compiler
9. Gemini integration
10. Arc and Circle integration
11. Settlement and operational trust
12. System architecture and API contracts
13. Data model, state machines, and persistence
14. AI research behavior
15. Testing and acceptance criteria
16. Build sequence and cut lines
17. Demo, submission, and judging proof
18. Cursor execution instructions
19. Research sources and unresolved checks

## 1. Product decision and winning wedge

### 1.1 The problem to solve

A person can have a coherent view about the world without knowing how to express it in available prediction markets. “I expect Bitcoin to finish in this range” is not the same as “I want to buy YES on one threshold.” Buying a collection of individually plausible contracts can introduce payouts in scenarios the person does not believe, excess cost, duplicated exposure, or an unintended settlement deadline.

Most of the interface should answer four questions, in this order:

1. What exactly is being predicted, and what does the market currently imply?
2. What do I believe, and what evidence would change my mind?
3. What pays in the scenarios I actually mean?
4. What will I pay now, what can I receive, and how do I collect it?

The core interaction is **research → express view → inspect payoff mismatch → obtain a matching quote → approve → track → settle → claim**.

The distinctive demo moment is the payoff comparison. The user sees that two ordinary contracts produce a different payout shape from their intended view. Thesis then shows an explicitly priced custom Arc position whose payoff matches the selected scenario. This must be visually obvious without a technical explanation.

### 1.2 What we inherit from the inspiration

From LYNX: start with a theme, organize market information, show disagreement, and connect understanding to an action.

From Cumulant: let a user think in outcome distributions and payout shapes, not only individual YES/NO tickets.

Thesis adds an explicit intermediate object: the **confirmed thesis**. It records the topic, settlement interpretation, preferred scenarios, optional beliefs, rationale, and invalidation evidence. The trade is compiled from the user's chosen payoff, not inferred silently from prose.

### 1.3 Initial user

A prediction-market-curious person who follows one topic, has a directional or range view, and can understand a dollar payoff chart. They do not need to know derivatives vocabulary. They do need to confirm the actual event rules and the amount they are risking.

This is not initially an institutional terminal, a social network, a generalized autonomous trader, or a new exchange with organic liquidity. Those would dilute the demonstration.

### 1.4 Scope of the first market family

Prefer a curated family of ordered threshold contracts about the same observable, same time, same source, and same settlement semantics. For example, thresholds for an asset's value at one specified observation time. Actual available Gemini contracts determine the family.

Do not combine “touches a price at any time before Friday” with “closes above a price on Friday.” Do not infer compatibility from matching titles, tickers, or dates. If a verified range family is unavailable, ship a single Gemini binary contract with a directional custom payout and demonstrate the range compiler in an explicitly separate historical or synthetic walkthrough.

### 1.5 Honest advantage of Arc

The core financial advantage comes from a programmable, collateralized contract: the full maximum payout can be locked before purchase, and a published payout function can be enforced on settlement. Other programmable chains can implement that primitive. Arc's particular fit is USDC-denominated collateral, USDC gas, EVM tooling, and Circle wallet infrastructure, reducing the need to explain or acquire a separate volatile gas asset.

Do not claim Arc uniquely makes custom payoffs mathematically possible. Show that removing Arc from this implementation removes the actual escrow, enforceable claims, and settlement receipt. Gemini provides the reference markets; Arc is the place the Thesis position exists.

## 2. Hackathon strategy and scope

### 2.1 Submission positioning

Enter **Track 02: DeFi & Onchain Apps**. Seek **Best Use of Arc** and the **Gemini Prediction Markets bounty**. The event page permits one main track, one chain award, and eligible sponsor bounties. Listed amounts are $2,000 for the track winner, $1,000 for Arc, $2,500 for first in Gemini, and $2,500 for first overall: $8,000 in possible stacked first-place awards, not an expected outcome.

The published deadline is **November 20, 2026 at 12 PM CST**, with finals November 21 at UT Austin. Treat November 19 as the build freeze. Verify the linked submission guide for final video, eligibility, attendance, repository, and pitching requirements before submission. The public page is authoritative for the dates and category structure cited here; do not treat this document as a replacement for the full rules.

### 2.2 What judges should be able to verify

| Claim | Visible proof |
|---|---|
| Helps users form a view | Evidence links, market rules, editable thesis, explicit confirmation |
| Converts that view into the correct exposure | Side-by-side payoff comparison and complete scenario table |
| Uses Gemini meaningfully | Real event IDs, instrument symbols, data timestamps, market details, final resolution provenance |
| Uses Arc meaningfully | Funded collateral, accepted quote transaction, position state, claim transaction |
| Is technically thoughtful | Conservation-of-funds tests, expired-quote handling, unresolved/void handling |
| Is usable | Guest exploration, few steps, clear costs, no unnecessary chain jargon |
| Is original | Research-to-payoff mismatch workflow, implemented independently with cited inspiration |

### 2.3 Priority definitions

**P0 — required to submit confidently:** one curated topic; real Gemini discovery adapter; clear data mode; research workspace; editable confirmed thesis; directional and range compiler if compatible contracts exist; comparison table; funded maker RFQ; Arc testnet collateral and claims; portfolio/detail pages; deterministic settlement/void handling; repeatable demonstration; deployed frontend; source README.

**P1 — only after the complete P0 loop works:** Circle passkey onboarding if its integration has not already passed the early spike; shareable read-only theses; one saved evidence alert; optional personal probability inputs; historical evidence timeline; richer explanation generation; alternate topic family.

**P2 — deliberately postponed:** native Gemini order execution; multi-maker quote competition; secondary exits; cross-chain deposits; arbitrary joint events; continuous payoff drawing; tranches; principal-protected products; copy trading; autonomous rebalancing; paid data agents; governance; mobile native apps.

Wallet connection is P0. Passkeys are a preferred implementation subject to early qualification, not permission to miss the complete trading loop. A standard external wallet is an acceptable documented fallback.

### 2.4 Product success criteria

In a moderated test, a first-time user should explain their maximum loss, winning scenario, settlement time, and claim process without help. Target under three minutes from an existing thesis to a reviewed quote, excluding wallet funding. Measure task completion and comprehension rather than invented return or conversion metrics.

## 3. Reference repositories: precise reuse guidance

The following repositories were inspected as references. Pin the cited commit while studying them; their default branches can change. Repository statements about tests/deployments are author claims unless independently reproduced. This plan does not certify their security. Inspect applicable licenses before copying any code, assets, or text; otherwise implement the described patterns independently.

### 3.1 LYNX

Repository: https://github.com/edubizh/ETHNYC2026-project-lynx

Inspected commit: `43010d60212659a27e30eed8c7077ccc7ee0618d`

| Source path | What to study | How Thesis differs |
|---|---|---|
| `README.md` and `docs/architecture.md` | Theme-to-basket story and separation of data/execution | Thesis has an explicit confirmed view and an Arc-native custom position |
| `lib/baskets/registry.ts`, `lib/baskets/types.ts` | Typed curated products and metadata | Use versioned compatible market families, not arbitrary basket membership |
| `lib/adapters/polymarket.ts`, `lib/adapters/kalshi.ts` | Provider normalization boundary | Build a Gemini adapter with raw-source provenance and strict status mapping |
| `components/AnalystBandGraph.tsx` | Chart as the center of an explanation | Do not equate analyst price percentiles with event probabilities |
| `components/BuyBox.tsx`, `components/EnterSheet.tsx` | Review flow and staged entry feedback | Separate quote, allowance, acceptance, and claim; reflect real wallet prompts |
| `components/AccountPanel.tsx`, `components/ArcAccountBar.tsx`, `lib/arc/` | Arc account and wallet UX | Verify current SDK support; never copy deployment addresses blindly |
| `components/terminal/Terminal.tsx`, `SideRail.tsx`, `FeedSlot.tsx` | Modular data surfaces | Use a calm, sequential workspace instead of recreating its terminal layout |
| `lib/lifi/entryPlan.ts`, `app/api/basket-entry/route.ts`, `contracts/src/EnterBasket.sol` | Preflight validation and execution boundaries | No LI.FI dependency in P0; trade is one funded Arc RFQ acceptance |
| `docs/task-9-live-qualification.md` | Distinguishing working integrations from remaining qualification | Maintain our own live-vs-replay qualification checklist |

Important correction: LYNX's README describes Arc account/NAV use as well as Polygon execution. Its Polymarket neutral YES+NO leg is not equivalent to taking an ordinary directional prediction. Do not describe the repo as entirely Arc-executed or use that neutral leg as the product's directional financial model.

Pinned starting point: https://github.com/edubizh/ETHNYC2026-project-lynx/blob/43010d60212659a27e30eed8c7077ccc7ee0618d/README.md

### 3.2 Cumulant

Repository: https://github.com/notveiker/EG-Arc-Cumulant

Inspected commit: `ac03d2f87a50ab8384c2f66e0bc75abe99cdc7d1`

| Source path | What to study | What not to carry over |
|---|---|---|
| `README.md`, `ARCHITECTURE.md`, `SECURITY.md` | Product boundaries, collateral reasoning, failure cases | Do not claim a reference self-review is an independent audit |
| `frontend/app/app/distribution/` | Editing a distribution against a reference | P0 uses discrete, explainable scenarios and payouts |
| `frontend/lib/curve.ts`, `frontend/lib/distribution-client.ts` | Chart/data separation | No freehand drawing that implies unsupported precision |
| `backend/src/services/distribution-continuous.ts` | Quote orchestration and distribution UX concepts | Do not use seeded/random realized outcomes as real settlement |
| `backend/src/services/markets-live.ts`, `polymarket.ts` | Market discovery and normalization | Replace with Gemini contracts and verified compatible rules |
| `backend/src/services/correlation.ts` | Awareness of correlated basket risk | Do not present estimated correlations as guaranteed joint probabilities |
| `backend/src/services/pricing.ts`, `tranching.ts` | Separation of math from HTTP routing | P0 has bounded discrete payouts, no yield or tranche waterfall |
| `contracts/src/PredictionMarket.sol`, `BasketVault.sol` | Lifecycle, claim, void, and solvency thinking | Do not assume parimutuel pricing is the same as a fixed RFQ |
| `contracts/src/TrancheVault.sol`, `ProtectedNote.sol` | Optional research on structured payouts | Exclude from the hackathon implementation |
| `frontend/lib/tx.ts`, `format.ts`, `frontend/app/app/portfolio/` | Transaction feedback and positions | Derive our ownership and claims from our contracts |

Cumulant describes its distribution product as an off-chain quote engine with Arc escrow and resolver-signed payouts, rather than a dedicated distribution contract. Its README identifies freely mintable MockUSDC and server-side demo rails. Thesis should improve the guarantee boundary: the accepted quote's complete finite payout schedule is committed onchain and total maximum liability is escrowed atomically. Never label a mock token canonical USDC.

Pinned starting point: https://github.com/notveiker/EG-Arc-Cumulant/blob/ac03d2f87a50ab8384c2f66e0bc75abe99cdc7d1/README.md

### 3.3 Additional references

| Repository | Inspected commit | Useful idea and limit |
|---|---|---|
| https://github.com/Ramitphi/inphinity | `52e6b43d19f2a5e4ddd042c886af4f0c40c7c925` | Portfolio/share accounting and recognizable investment UX; do not reuse stock-oracle assumptions for event settlement |
| https://github.com/orbbit-tech/openpop | `7d2b5a81a6a61ea23cd60491ce89ad1e7ca9cfe8` | `ProofGatedEscrow.sol` and report-gated settlement as a trust-boundary reference; a forwarder or report alone does not prove the offchain fact |
| https://github.com/Vainglorious/ethglobalnyc | `a3c134123047bc3b386a2753d51f9b466d2ec3ac` | Timestamp-controlled historical replay and evaluation; prevent future information from leaking into a replayed decision |

Also inspect the five original showcase pages for product narratives, not authoritative implementation guarantees:

- https://ethglobal.com/showcase/lynx-ta08o
- https://ethglobal.com/showcase/cumulant-xfzya
- https://ethglobal.com/showcase/inphinity-wa65f
- https://ethglobal.com/showcase/openpop-grkq2
- https://ethglobal.com/showcase/worldcolony-fxehh

A free-text thesis-to-basket feature alone is not a defensible novelty claim. Related projects such as Polyfund already describe adjacent workflows: https://devpost.com/software/polyfund. Position Thesis around understanding and eliminating the mismatch between a stated view and an actual payoff, with inspectable collateral and settlement.

## 4. User model and complete journeys

### 4.1 Primary journey: “I expect a range, not an unlimited rally”

1. Maya opens Explore without connecting a wallet.
2. She selects the curated topic and sees its exact observation time, source, and current Gemini quotes.
3. She opens two evidence cards: one supports continued demand, another argues against a breakout. Each has a source, publication time, and a short factual excerpt or summary.
4. She clicks **Form my view**. The draft says “I expect the outcome to fall between the selected lower and upper thresholds.”
5. She selects the actual available thresholds; the application explains inclusive/exclusive boundaries from the rules.
6. She writes one sentence of rationale and optionally adds “I would reconsider if…” evidence. These are private by default.
7. She clicks **Confirm this view**. The app saves a version and opens Build.
8. Build compares a simple threshold ticket, a two-ticket alternative, and the exact custom range payoff. The mismatch is visible as shaded payouts outside her target interval.
9. She enters a maximum purchase budget. Before a quote exists, the UI shows a payout preview, not a fictional guaranteed return.
10. She clicks **Get quote**. A funded demo maker returns a signed offer with premium, maximum payout, expiration, and a specific payout table.
11. Review explains: “Pay 40 USDC plus the displayed fee. Receive 100 USDC if the middle scenario resolves. Receive 0 otherwise.” These are example numbers, not a market promise.
12. She connects a wallet if necessary, obtains testnet funds, approves only the needed token amount, then accepts the quote. If the wallet can safely batch these actions, the UI reflects the actual batch.
13. After a confirmed receipt, the app opens her position page. It shows the locked payout, transaction link, outcome rules, and settlement timeline.
14. At final resolution, the relayer publishes the source result. After the predeclared finalization delay, the contract makes the payout claimable.
15. Maya clicks **Claim payout**, signs, and sees the receipt and updated spendable balance. A losing position ends with a clear zero payout; a void position offers a refund.

### 4.2 Return journey: view changed before settlement

Maya opens her position, sees the thesis she recorded at purchase, and adds a new note. Existing contract terms do not change. **Revisit thesis** creates a new draft version. The UI says that the existing position remains open. P0 does not offer early liquidation or a fake sell button. A later buyback product must obtain a real funded quote and disclose its price independently.

### 4.3 No quote or insufficient liquidity

The user can still research, save a thesis, and inspect a payoff. If no maker can cover maximum liability, the product says “No funded quote available for this size.” Offer a lower size only if the maker actually returns one. Never turn a theoretical price into an executable green button.

### 4.4 Stale or unavailable market data

Keep last-known values with their timestamps and a prominent stale state. Disable fresh quote generation if the pricing policy's freshness threshold is exceeded. The user's draft remains intact. **Retry data** refreshes data; **Open source** allows independent inspection. Never silently substitute fixtures for live data.

### 4.5 Replay journey for judging

A clearly labeled **Historical walkthrough** uses a frozen pre-resolution snapshot, recorded later outcome, and a separate replay contract/namespace. At each replay time, only information available by that time is displayed. Judges can advance time through an operator-only demo control. The screen and receipts say replay/testnet throughout. An actual historical outcome is not presented as a current forecast, and a synthetic fixture is labeled synthetic rather than historical.

## 5. Information architecture and visual system

### 5.1 Routes

| Route | Purpose | Access |
|---|---|---|
| `/` | Explain the promise and enter the product | Public |
| `/explore` | Select a supported topic or resume a draft | Public; personal items scoped locally/account |
| `/topics/[slug]` | Research and form a view | Public |
| `/theses/[id]/build` | Confirm scenarios and construct payout | Owner draft; guest local draft allowed |
| `/theses/[id]/review` | Inspect a real quote and fund acceptance | Owner; wallet needed to transact |
| `/portfolio` | Find drafts, open positions, and claims | Connected wallet for chain positions |
| `/positions/[id]` | Inspect contract, timeline, and payout | Public chain facts; private rationale owner-only |
| `/theses/[id]/share/[token]` | Optional read-only published thesis snapshot | P1, explicit share only |
| `/settings` | Wallet, display, data mode, privacy controls | Local/account |
| `/how-it-works` | Explain market data, collateral, and settlement | Public |
| `/ops` | Maker and resolver operations | Operator authorization; excluded from public navigation |

Research, Build, and Review form one three-step workspace. Do not make users repeatedly select the same market. The route changes preserve topic and thesis version. Portfolio is the return destination after trading, not a second trading engine.

### 5.2 Original visual direction: an analytical notebook

Use a light, editorial workspace with a large central payoff chart, an understated left navigation, and a contextual right panel. Avoid cloning LYNX's terminal/feed composition or Cumulant's complete dashboard arrangement.

Suggested tokens, subject to contrast testing:

| Token | Value | Use |
|---|---|---|
| Canvas | `#F4F2ED` | Warm paper background |
| Surface | `#FFFFFF` | Chart and primary working surfaces |
| Primary ink | `#182329` | Headings and values |
| Secondary ink | `#52616B` | Supporting text |
| Action | `#3559E0` | Primary buttons and confirmed user view |
| Market reference | `#718394` | Market-implied reference line |
| Comparison accent | `#C57A36` | Alternative payoff; supplement with line style |
| Positive state | `#237457` | Success with icon/text |
| Negative state | `#B13C47` | Error/loss with icon/text |
| Border | `#DEDCD5` | Subtle separators |

Use Instrument Sans or a similar readable sans for UI; Instrument Serif only for a few large editorial headings; IBM Plex Mono for aligned amounts, symbols, and timestamps. Self-host or use a reliable font strategy. Default body 15–16px, chart labels at least 12px, primary interactive targets 44px. Cards have 12px radii; avoid excessive nesting, glows, and glass effects.

Desktop: approximately 200px navigation, flexible center, 320–360px contextual panel. At medium widths the contextual panel moves below the chart. On mobile, use a compact header and three main navigation destinations; keep the current primary action sticky above the safe area. The chart must have a full accessible scenario table below it.

### 5.3 Frontend reference direction

Use Linear's published design discussion for predictable action placement and visual hierarchy: https://linear.app/now/behind-the-latest-design-refresh. Borrow the principle of reducing navigation's visual competition, not its colors, exact sidebar, or screen composition.

Use LYNX's `EnterSheet.tsx` as a study of staged transaction progress, and Cumulant's distribution page as a study of direct manipulation. Our primary screen should remain a notebook-like sequence: **question → evidence → your view → payout**, with one dominant chart and one dominant action. Do not reproduce source logos, screenshots, copy, proprietary illustrations, or layouts.

### 5.4 Chart grammar

A probability chart answers “how likely?” A payoff chart answers “how much do I receive?” A P&L chart answers “what remains after cost?” These must be different labeled modes; never silently switch units.

- The default Build chart is gross USDC payout by outcome scenario.
- The alternative overlay is dashed; the user's chosen payoff is solid cobalt.
- Shade the user's desired scenario lightly; shade unintended alternative payouts with hatching.
- A vertical cursor reveals the exact scenario, source conditions, gross payout, and net P&L if a quote exists.
- For discrete outcomes, draw steps and bins, not a smooth curve suggesting unavailable precision.
- Labels describe boundaries in plain English and exact mathematical notation in details.
- Disable animated chart rearrangement when reduced motion is enabled.

## 6. Page-by-page interaction specification

### 6.1 Landing `/`

**User goal:** understand the benefit and enter a useful example immediately.

Above the fold: headline “Trade the outcome you actually believe in.” Short description, one interactive three-scenario payoff example, and primary **Explore a topic**. Secondary **See a walkthrough**. Below: three concise steps, an honest Gemini/Arc attribution strip, and links to how settlement works. Avoid a wall of sponsor logos or inflated statistics.

| Control | Action | Result and edge behavior |
|---|---|---|
| Explore a topic | Navigate to `/explore` | No wallet modal |
| See a walkthrough | Open mode-selection confirmation | Starts labeled replay, never silently changes a live draft |
| Example scenario tabs | Change highlighted illustrative outcome | Update example payout; clearly labeled illustrative |
| How it works | Navigate to explanation page | Preserve return link |
| Connect wallet | Open wallet sheet | Connection only; no signature to trade |
| Logo | Navigate home | Preserve unsaved draft in local storage |

Acceptance: the product's benefit is understandable without scrolling, and a guest can reach research in two clicks.

### 6.2 Explore `/explore`

**User goal:** choose a topic where a meaningful view can actually be expressed.

Show a page title, supported-topic search, filter chips, one featured curated family, and saved drafts. Each topic card includes question, settlement time, number of compatible contracts, data freshness, and whether quotes are available. Do not fill empty inventory with fake live cards. Only show filters that actually have results.

| Control | Action | Result and edge behavior |
|---|---|---|
| Search | Debounced search across ingested topic metadata | Preserve query in URL; explicit zero state |
| Category filter | Narrow supported families | Clear-filter affordance; no arbitrary incompatible grouping |
| Topic card / Research topic | Open topic workspace | Load rules and data; no trade execution |
| Resume draft | Open last step of that draft | Restore inputs; refresh market data separately |
| New view | Open selected topic's thesis editor | Ask topic only if none selected |
| Mode selector | Choose live or walkthrough | Explain differing data/funds; do not migrate positions between modes |
| Refresh | Re-fetch inventory | Show loading beside existing data, not blank screen |
| Draft overflow: rename/delete | Rename inline or confirm deletion | Delete draft only; never remove onchain position |

Empty states: no supported families → explain unsupported inventory and offer source browsing/replay; no drafts → show one sentence and start action; API unavailable → retain stale cards marked unavailable for quoting.

### 6.3 Research `/topics/[slug]`

**User goal:** understand the question and develop an explicit view.

Header: question, precise observation time in local timezone with UTC detail, provider, and status. Workspace tabs: **Overview**, **Evidence**, **Market rules**. Sticky right panel: **Your view**. Main chart shows the selected market family and quoted prices, with a plain-language explanation of what is and is not implied.

Overview contains a small market snapshot, outcome scenarios, and three concise questions: “Which outcome do you expect?”, “Why?”, “What would change your mind?” Evidence is curated/retrieved with source attribution, not a stream of unsupported AI opinions. Market rules show original text/link, extracted terms, and the compatibility checks.

| Control | Action | Result and edge behavior |
|---|---|---|
| Overview/Evidence/Rules tabs | Change working panel | Preserve draft and chart selection |
| Outcome row | Highlight scenario | Does not create or purchase a position |
| Source link | Open original source in new tab | Safe external-link behavior; show destination domain |
| Evidence card expand | Show summary, timestamps, and relevance | Separate quoted fact from model interpretation |
| Save evidence | Attach source reference to draft | Toggle off; deduplicate by source ID |
| Supports / Challenges / Context | User labels saved evidence | User judgment, not a model-certified fact |
| Ask about this market | Open constrained research panel | Responses cite supplied sources; failures don't block manual entry |
| Suggested view chip | Populate draft proposal | Mark unconfirmed; never advance automatically |
| View type selector | Choose directional/range | Show only compatible supported choices |
| Lower/upper threshold selector | Select actual contract-derived boundaries | Invalid combinations disabled with reason |
| Rationale field | Edit private text | Autosave with visible saved state |
| What would change your mind? | Add optional condition/note | No promise of automatic monitoring in P0 |
| Form my view | Focus/open view editor | Does not imply AI has decided for user |
| Confirm this view | Validate, version, and navigate Build | If incomplete, focus first missing field |
| Save draft | Persist without confirmation | Guest local save; sign-in is not required |
| Reset proposed view | Clear unconfirmed fields | Confirm if meaningful user edits would be lost |

The AI may suggest “You seem to mean a range at settlement, rather than a price touch.” The user must confirm that interpretation. It cannot choose thresholds unsupported by the market rules.

Market-data display: bid/ask and timestamp by default; a midpoint can be labeled “price-derived reference.” Do not call it a guaranteed probability or model accuracy score. Explain that spread and liquidity affect interpretation.

### 6.4 Build `/theses/[id]/build`

**User goal:** turn the confirmed view into an understandable payout shape.

Top: a compact thesis sentence with **Edit view**. Center: payoff chart and comparison selector. Right: size/budget and preview summary. Bottom: scenario table and collapsed “How this is constructed.”

Three comparison modes: a selected ordinary threshold ticket; an illustrative/executable two-ticket alternative depending on data availability; the Thesis custom payoff. Each carries its own price status. A price estimate cannot be labeled an executable offer.

| Control | Action | Result and edge behavior |
|---|---|---|
| Edit view | Return to research editor | Invalidate any existing quote when confirmed terms change |
| Directional / Range | Change supported payoff template | Recompute scenario mapping; preserve rationale |
| Boundary selectors | Choose compatible thresholds | Chart updates; explain equality boundary explicitly |
| Payoff size / budget input | Set desired maximum payout or spend cap | Clarify which quantity is entered; fixed-point validation |
| Input mode: Spend cap / Target payout | Switch size interpretation | Preserve equivalent estimate only when valid; no false exact conversion |
| Compare alternative selector | Overlay a reference construction | Show source and quote timestamp for its costs |
| Gross payout / Net P&L toggle | Change units | Net requires quoted/explicit hypothetical cost; otherwise unavailable with explanation |
| Scenario hover/click | Inspect exact result | Keyboard-equivalent table selection |
| Show all scenarios | Expand scenario table | Includes losing, winning, boundary, and void treatment |
| Optional probability inputs | Enter personal belief per scenario | P1; require total 100%; no automatic fabricated probabilities |
| Reset payoff | Restore template defaults | Preserve confirmed thesis; warn if quote will expire |
| Save draft | Persist specification | No wallet action |
| Get quote | Validate and request maker quote | Loading state; size/liquidity/stale-data failures actionable |
| Continue to review | Open existing valid quote | Disabled if inputs changed or quote expired |
| Back to research | Navigate to topic | Draft retained |

Before a quote: show “Exact cost appears when a maker offers a quote.” After a quote: show premium, fee, maximum payout, maximum loss, and quote countdown. A large projected dollar win must never appear without the accompanying cost and losing case.

### 6.5 Review `/theses/[id]/review`

**User goal:** know exactly what will happen before money moves.

Review card order: confirmed thesis; full payout table; purchase cost and fees; total maximum payout; wallet and network; funding status; settlement source and trust; quote expiry; final action. The primary label is **Accept quote · [total] USDC**, not “Continue” or “Invest now.” In testnet mode it says testnet USDC.

| Control | Action | Result and edge behavior |
|---|---|---|
| Edit payout | Return Build | Quote invalidated if changed |
| Quote details | Expand signed terms and maker identity | Human-readable fields plus raw JSON download P1 |
| Refresh quote | Request new offer | Explicitly show price changes; require acceptance of new terms |
| Connect wallet | Open connection sheet | Return to same review; no loss of draft |
| Switch to Arc | Ask wallet to switch/add supported network | Rejection leaves page intact |
| Add test funds | Open funding sheet/faucet link | Never imply real funds; retain quote but it may expire |
| Approve [amount] USDC | Submit exact-needed allowance if required | Track receipt; allowance is not trade completion |
| Accept quote | Revalidate and submit onchain acceptance | Disable duplicate sends; signed quote bound to user/spec/network |
| Settlement details | Expand resolver/finalization/void rules | Must match immutable market version |
| Back | Return Build | Existing accepted transaction cannot be canceled by navigation |
| Cancel wallet request | Reject in wallet or close UI safely | Reconcile pending tx before allowing retry |

If quote expires while approval is pending, finish tracking approval, then require a fresh quote; do not automatically sign a new purchase. If maker funding is consumed by another user, show “This quote could not be funded; your purchase did not execute.” Allow re-quote. If the transaction is sent but receipt is unknown, show pending/unknown, not failed. Reconcile by hash and events.

Acceptance success opens position detail only after the position is confirmed onchain. A toast is supplementary, not the only receipt.

### 6.6 Portfolio `/portfolio`

**User goal:** understand what needs attention and what money is actually available.

Top cards: spendable wallet USDC, committed purchase cost, and claimable USDC. Avoid a fabricated total portfolio valuation when there is no executable exit quote. Tabs: **Open**, **Claimable**, **History**, **Drafts**. Priority banner for claims or unresolved markets.

| Control | Action | Result and edge behavior |
|---|---|---|
| Position row | Open detail | Public chain data loaded by position ID |
| Claimable filter | Show finalized positive claims/refunds | Exclude already-claimed balances |
| Claim payout | Open single-position claim review | P0 no bulk-claim complexity |
| Resume draft | Return to saved workspace step | Refresh data without overwriting user's view |
| New thesis | Navigate Explore | No modal unless choosing among existing topics helps |
| Refresh balances | Read chain/indexer | Show last indexed block and reconcile pending tx |
| View transaction | Open explorer | Exact network and hash |
| History filter | Filter claimed/expired/void/zero-payout | Status derived from chain |
| Export history | P1 CSV of own positions | Include timestamps, costs, payouts, mode, contract addresses |

Wallet disconnect shows a connection prompt and keeps guest drafts. Do not show the previous wallet's private rationale after switching accounts. An indexer outage should show known pending positions and offer direct chain refresh.

### 6.7 Position detail `/positions/[id]`

**User goal:** inspect the promise they bought and collect the correct outcome.

Header: thesis label, state, purchase time. Left: immutable payout chart/table. Right: purchase cost, maximum payout, current claim status. Timeline: quote accepted → collateral locked → event closed → result reported → final → claimed. Expandable source/rules and transaction history.

| Control | Action | Result and edge behavior |
|---|---|---|
| Claim payout | Preflight claimable amount and submit claim | Repeat clicks cannot double claim |
| Claim refund | Claim buyer contribution after void | Explain fee refund policy separately |
| View market result | Open original source and stored evidence | Show reported/final timestamps and source status |
| View collateral | Show allocated maximum payout and contract link | Do not equate global vault balance with this position's reservation |
| View transaction | Open acceptance/report/finalize/claim receipt | Label event type |
| Revisit thesis | Create a new editable draft | Explicitly leaves existing position unchanged |
| Add reflection | Save private post-trade note | Does not change payout |
| Copy position link | Copy public chain-facts route | No private rationale in URL |
| Show exact rules | Expand committed source IDs and settlement mapping | Include market version/hash |
| Return to portfolio | Navigate back | Preserve filter state |

Before finalization: no claim button. After zero payout: show “Resolved: 0 USDC payout” with original cost and outcome explanation. If void: show refund amount and reason. If finalization is delayed: show the actual longstop policy and timestamp, not a perpetual spinner.

### 6.8 Settings and wallet sheet

Settings controls: display timezone; reduced motion; disconnect; connected account/network; optional embedded wallet management link; clear local drafts with confirmation; export local draft data; data-mode selector. Do not expose secret keys or ask users to paste Gemini credentials for P0.

Wallet sheet has: account address with copy; Arc network status; canonical token balance; gas reserve estimate; faucet/external funding link; recent transaction state. A copied address confirmation is small and transient. “Disconnect” does not delete positions. “Clear drafts” does not revoke allowances or move money.

### 6.9 How it works

Explain five concepts with the same example used in Build: a view, a payoff, a maker's quote, collateral, settlement. Include the complete trust boundary: Gemini outcomes are read offchain and a designated resolver reports them to Arc. There is no native Gemini-to-Arc oracle assumed by this plan. Explain that P0 positions are held to settlement and no secondary sale is promised.

Buttons: **Try example**, **Read contract**, **View data source**, **Back to my draft**. Links open the exact deployment/source when available, not placeholders that look live.

### 6.10 Operator console `/ops`

This is an internal operational page, not a consumer feature. Server-side authentication and contract role checks are both required; hiding a URL is not authorization.

Panels: maker free/reserved collateral, active quotes, market ingestion health, unresolved positions, settlement reports, replay controls. Actions: **Deposit maker collateral**, **Withdraw free collateral**, **Pause new quotes**, **Resume quotes**, **Preview report**, **Submit report**, **Finalize eligible report**, **Void after longstop**, **Advance replay**. Each state-changing action has an explicit confirmation with affected market/version. Never provide an unrestricted “set winning result” button on a live deployment.

Report preview shows raw Gemini response, normalized result, compatibility validation, source hash, expected payouts, and invalid/contradictory flags. Withdrawals cannot access reserved funds. Replay controls only target replay contracts and data namespaces. Consumer pages do not expose these controls.

## 7. Shared controls and transaction experience

### 7.1 Button classes

- Primary: one per active step. Verb + object; transaction actions include amount when useful.
- Secondary: navigation, edit, refresh, or source inspection; never visually compete with acceptance.
- Destructive: delete local draft, withdraw free maker collateral, pause operations; explain effect before mutation.
- Disabled: include a visible reason or accessible description; no unexplained gray buttons.
- External: link semantics, external indicator, safe new tab; no wallet action hidden behind a link.
- Async: show progress, prevent duplicate submissions, preserve text and focus; don't replace the entire screen with a spinner.

### 7.2 Common state vocabulary

Data: loading, fresh, stale, unavailable, replay, synthetic. Wallet: disconnected, wrong network, ready, request pending, rejected. Transaction: awaiting signature, submitted, confirming, confirmed, reverted, replaced, unknown. Quote: requesting, available, expired, invalidated, unavailable, accepted.

Do not map every error to “Something went wrong.” Examples: “Market prices are 4 minutes old; refresh before requesting a quote”; “Your wallet rejected the request; no trade was submitted”; “The transaction is pending; it is safe to leave this page.”

### 7.3 Persistence and navigation

Autosave drafts after a short debounce and on explicit Save. Show Saved/Saving/Unable to save. Store guest drafts locally and offer migration after wallet authentication; don't silently publish them. Use wallet-signature authentication for private server data with a nonce and session expiry. Connecting an address alone is not proof of ownership. Draft autosave and quote acceptance use separate identifiers.

On browser reload, recover a pending transaction by chain ID, sender, nonce, and hash where available. Never retry a financial mutation solely because the HTTP request timed out.

### 7.4 Accessibility and formatting

Keyboard navigation through all tables and selectors, visible focus, dialog focus traps, Escape for non-submitting dialogs, screen-reader announcements for status changes, reduced-motion support, and contrast checks. Amounts use fixed decimal formatting with full value in details. Never round a nonzero fee to “0” without showing “<0.01”. Display local time with UTC available. Distinguish wallet USDC, reserved collateral, purchase cost, gross payout, and P&L consistently.

## 8. Financial model and payoff compiler

### 8.1 Separate belief from payoff

A thesis contains a belief or preferred scenario. A payoff specification defines actual contractual receipts. They are related but are not the same object. A user can strongly believe in a scenario yet choose a small position. A high confidence input must never automatically increase spending.

P0 supported payoff templates:

1. Directional: maximum payout if one supported binary outcome occurs; zero otherwise.
2. Range: maximum payout if a compatible lower threshold resolves YES and upper threshold resolves NO; zero in the other valid scenarios.
3. Stepped payout is P1 only after finite-state math and collateral tests pass; cap at three scenarios rather than arbitrary curves.

The compiler must return a finite exhaustive scenario table, validity constraints, source market IDs, and a canonical payoff hash. It must never return executable calldata from an LLM directly.

### 8.2 Worked range example

Illustrative compatible predicates: A = value at the specified time is at least 95,000; B = value at the same time is at least 100,000. Both must use the same reference and exact semantics.

| Outcome | A YES | B NO | One A YES + one B NO | Custom range, per 1 USDC maximum payout |
|---|---:|---:|---:|---:|
| Below 95,000 | 0 | 1 | 1 | 0 |
| At least 95,000 and below 100,000 | 1 | 1 | 2 | 1 |
| At least 100,000 | 1 | 0 | 1 | 0 |

These are gross payouts, not profits. The custom range changes the payout shape; it does not guarantee better returns or a lower price. Normalize comparisons explicitly: per unit, equal purchase budget, or equal maximum payout. Never compare an unnormalized two-unit alternative to a one-unit custom position and call it superior.

With illustrative probabilities P(A)=0.70 and P(B)=0.30, the middle scenario has probability 0.40 only if these are coherent probabilities for nested predicates. Market prices are noisy references with spreads and fees, not exact probabilities. Do not multiply 0.70 by 0.70, and do not assume two related events are independent.

Given bid/ask intervals for nested probabilities, a conservative middle interval can be displayed as max(0, lower(A)−upper(B)) to min(1, upper(A)−lower(B)), subject to consistency checks. Label this a price-derived range, not statistical confidence. If the interval is inconsistent, show an unavailable reference and inspect the data; do not silently smooth it into an apparently reliable probability.

### 8.3 Quote economics

Define all amounts in token base units using integers:

- `M`: maximum gross payout for the entire position.
- `P`: buyer premium, with 0 ≤ P ≤ M.
- `F`: optional separately disclosed platform fee. Use F=0 in P0 unless needed.
- `f[s]`: buyer payout for valid resolved scenario s, with 0 ≤ f[s] ≤ M.

At acceptance, buyer contributes P to escrow and maker contributes M−P. Total locked collateral is exactly M. Buyer also pays F if enabled; fee accounting is separate from collateral. Maker's contribution must come from available funded liquidity. Contract acceptance and collateral reservation occur atomically or revert together.

At settlement, buyer receives f[s] and maker receives M−f[s]. Neither depends on the maker remaining online. On void, buyer recovers P and maker recovers M−P. Specify fee refunds before trading; easiest P0 policy is zero fees. Gas is not refunded by the application.

Example: M=100, P=40, F=0. Buyer locks 40, maker adds 60. The winning scenario pays buyer 100 and maker 0. Losing scenarios pay buyer 0 and maker 100. The buyer's net result is +60 or −40, excluding gas. A void returns 40 to buyer and 60 to maker. **Maximum payout 100 is not maximum profit 100.**

Budget mode: the user's cap includes P+F and, if shown as an all-in cap, an explicit gas reserve estimate. If the maker quote exceeds the cap, reject it or ask the user to change size; never silently increase the budget. Quote rounding must favor solvency and be explained at sub-cent precision when relevant.

### 8.4 Maker model

P0 uses a disclosed demo maker funded with testnet USDC, not fabricated market depth. The maker signs bounded, expiring quotes and has a per-market exposure cap. It may price from Gemini references plus a fixed spread and inventory adjustment, but this is a maker policy, not a fair-value oracle.

The engine checks data freshness, family compatibility, market status, remaining time to close, available collateral, user size limits, and quote TTL. Offchain reservations reduce quote failures but cannot guarantee fills. Onchain funding checks are authoritative. Quote expiry prevents new acceptance; it does not expire an already purchased position.

Use a target TTL of 30–60 seconds, configurable after latency testing. Quote expiration must precede the market's trading cutoff by a safety margin. No new quotes after source resolution or market close. Do not lock capital indefinitely merely because a user requested a quote.

### 8.5 Signed quote contents

Use typed structured signing with an explicit chain/domain and a replay-protected nonce. Include maker, allowed taker, escrow contract address, collateral token, market-family version/hash, settlement-policy hash, payoff hash or complete bounded payout vector, total M, premium P, fee F, quote nonce, issued time, deadline, and mode/deployment identity where applicable.

Canonical encoding is shared by frontend, backend, and Solidity. The contract independently verifies signer, target taker, token, limits, payout bounds, family registration, nonce, deadline, and active status. Support contract-account signatures if the selected wallet stack requires them. Do not invent a signature scheme; use established verified libraries with current compatible versions.

### 8.6 Explicit exclusions

No leverage, no uncollateralized short, no yield-generated principal guarantee, no dependence on future deposits, no automatic market-making profitability claim, no transferable position token needed for P0, no assumptions that native Gemini contracts are wrapped on Arc. An Arc position is a separate contract referencing Gemini outcomes. Make that distinction visible in review and documentation.

## 9. Gemini integration

### 9.1 Why Gemini is central

Gemini contributes the actual questions and contracts, instrument identifiers, observed market prices/depth, market status, and resolution results. Removing it removes the application's reference-market context and the defined source outcomes for settlement. That is a substantive integration even without authenticated native exchange trading.

The official markets documentation exposes public event discovery and recommends WebSockets for live prices/depth using `instrumentSymbol`. Integrate documented capabilities actually available to the team; documentation examples are not proof that specific example markets exist.

### 9.2 Capability map

| Capability | User benefit | Priority / qualification |
|---|---|---|
| Discover events and categories | Choose real questions | P0; public API |
| Read event and contract metadata | Understand precise question and deadline | P0; preserve original source |
| Normalize instrument symbols | Avoid ambiguous names and wrong-contract trades | P0 |
| Read current bid/ask and depth | See reference cost and liquidity context | P0 snapshot; WS if qualified |
| Market status tracking | Avoid quoting closed/invalid questions | P0 |
| Resolution side and timestamp | Explain and drive final outcome reporting | P0; validate actual schema/status behavior |
| Upcoming/recently settled events | Discover demo candidates and outcome updates | Helpful ingestion tools |
| Native positions and orders | Optional separate exchange portfolio | P2; authenticated and permissioned |
| Native order placement | Optional alternative execution venue | P2; not needed for core Arc position |
| Combo/RFQ APIs | Potential future native comparable products | P2; verify endpoint-specific production eligibility |

Gemini native combos may overlap with parts of the payoff use case. Do not assert that Gemini cannot express any combination. The differentiation is the full view-to-payoff workflow and the specific self-contained collateral contract built here. Current documentation distinguishes production-beta RFQ flows and other combo endpoints whose availability differs; qualify access before depending on them.

### 9.3 First integration spike

Before polishing UI:

1. Call the public event listing and record a small real response fixture with retrieval timestamp.
2. Find one viable binary question and, ideally, a compatible threshold pair/family.
3. Fetch its rules, status, instrument IDs, timestamps, and available prices.
4. Confirm whether same-time range semantics can be proven from the actual rules.
5. Verify one supported streaming or polling path and source timestamp behavior.
6. Retrieve a resolved historical example and inspect final/invalid statuses.
7. Document rate limits, pagination, error handling, attribution/redistribution constraints, and applicable access terms from current docs.
8. Write a qualification note: live-ready, data-only-ready, historical-only, or blocked.

If no compatible live family exists, preserve the binary live integration and label range replay separately. Never invent instrument symbols to satisfy the demo story.

### 9.4 Adapter contract

Internal types should distinguish provider data from verified app semantics:

- `SourceEvent`: provider ID, ticker, title, description, source URL, original payload hash, fetchedAt.
- `SourceContract`: ID, instrumentSymbol, eventId, original terms URL, expiry, effective date, status, resolutionSide, resolvedAt.
- `QuoteSnapshot`: bid, ask, last trade if available, depth if available, sourceTime, receivedTime, sequence if available, freshness status.
- `VerifiedFamily`: curated contract IDs, predicate definitions, observation semantics, source reference, valid scenario mapping, curator review, version hash.

Preserve unknown enum values as unknown; block dependent operations until reviewed. Use decimal strings at boundaries. Zero is a value; null means missing. A last trade is not necessarily a current executable bid/ask.

### 9.5 Ingestion and transport

Server-side adapter fetches public data and caches it. Browser consumes our normalized API, reducing API coupling and preventing accidental exposure of any authenticated credentials. Server worker handles polling/WS reconnects and publishes an SSE/WebSocket stream to the frontend if needed. A simple polling path is sufficient for P0 if freshness thresholds are honest.

When reconnecting, obtain a fresh authoritative snapshot before applying incremental depth updates. Respect sequence/gap semantics from the current Gemini stream documentation. Use backoff with jitter and rate-limit handling. Do not merge incremental updates into an unknown book state.

### 9.6 Native Gemini trading, if added later

Keep “Trade on Gemini” separate from “Accept Arc quote.” Native exchange orders use their own account permissions, terms acceptance, balances, sizes, and lifecycle. Credentials stay server-side or use a supported delegated flow; do not embed secrets in the client.

The documented batch-order flow is not an atomic onchain multi-leg transaction. Model per-order acceptance, fills, partial fills, cancellation, and residual exposure. A single UI click is not evidence of one atomic trade. Do not bridge Arc collateral and claim it automatically funds a Gemini account without a verified supported deposit path.

## 10. Arc and Circle integration

### 10.1 Required onchain role

Deploy the actual position escrow on Arc testnet. All acceptance, collateral reservation, outcome finalization, and claims in the demo must use this deployment. An Arc balance badge alone does not satisfy the intended product architecture.

Current official connection reference lists Arc testnet chain ID `5042002`, RPC `https://rpc.testnet.arc.io`, WebSocket `wss://rpc.testnet.arc.io`, and explorer `https://explorer.testnet.arc.io`. Recheck these against official docs at implementation time. Use environment configuration and explicit chain assertions; never reuse addresses from the inspiration repos.

### 10.2 USDC units: critical engineering detail

Arc's native USDC gas representation and ERC-20 USDC interface use different decimal conventions: native balance uses 18 decimals, ERC-20 uses 6 according to the current reference. Keep native-gas and ERC-20 amount types separate. Query token decimals and verify the canonical testnet address from official docs. Do not mix `parseEther` with ERC-20 USDC amounts.

Because native and ERC-20 representations can relate to the same underlying balance, do not add them together as two assets. Reconcile wallet behavior with Arc's documented dual-interface semantics. Ensure token spending leaves a sufficient gas reserve when the user pays gas themselves.

### 10.3 Contracts

Prefer three small logical contracts/modules, reducible to two deployed contracts if simpler:

**MarketRegistry:** registers versioned curated market families and settlement policies. Records source hashes, valid scenario count, close time, longstop time, resolver, and finalization delay. Once used by an accepted position, the relevant version is immutable. New corrections create a new version for new positions.

**ThesisEscrow:** manages maker free balances, acceptance, reserved liabilities, positions, claims, and refunds. Stores a bounded payout vector or a verified template specification. Does not rely on an offchain server to compute the ultimate payout amount after purchase.

**OutcomeResolver:** accepts authorized source reports, exposes proposed/final/void outcomes, and enforces time and role boundaries. May be part of the registry if this reduces complexity without weakening checks.

Suggested public functions, subject to final ABI design:

- `depositMaker(amount)`
- `withdrawMakerFree(amount)`
- `acceptQuote(quote, payoutSpec, signature)`
- `proposeOutcome(familyVersion, scenario, evidenceHash)`
- `finalizeOutcome(familyVersion)` after delay
- `voidAfterLongstop(familyVersion)` under predefined rules
- `claim(positionId)` for buyer
- `claimMaker(positionId)` or account maker proceeds deterministically
- views for position, claimable, reserved liability, free maker balance, outcome state

Events include MarketRegistered, MakerFunded, QuoteAccepted, OutcomeProposed, OutcomeFinalized, MarketVoided, BuyerClaimed, and MakerProceedsReleased. Every event includes IDs sufficient for indexing without disclosing private rationale.

### 10.4 Security properties

- All monetary values are bounded integers; no floating-point Solidity/JS money calculations.
- Acceptance transfers/reserves complete maximum liability atomically.
- One quote nonce cannot open multiple positions.
- A quote for one user, chain, market version, or escrow cannot be replayed elsewhere.
- Reentrancy protection and checks-effects-interactions on external transfers.
- Supported collateral is a fixed verified token; do not accept arbitrary fee-on-transfer tokens.
- Pause stops new risk creation, not legitimate finalized claims/refunds.
- Reserved collateral cannot be withdrawn by maker or administrator.
- User claims and maker proceeds cannot each consume the same collateral.
- Finalized results cannot be rewritten after claims begin.
- No admin sweep of active position collateral.
- Avoid upgradeability for the hackathon deployment; redeploy a new version if necessary and preserve old claims.

### 10.5 Wallet experience

Preferred: Circle-supported user-controlled/passkey or modular wallet flow, if Arc support and signing compatibility are verified in the first spike. Alternative: external EVM wallet with an explicit Arc switch. The app must accurately show how many signatures/transactions the chosen stack requires. Do not promise one signature if allowance and acceptance are separate.

If sponsorship is supported and tested, sponsor user gas with bounded policy. Otherwise use native USDC gas and explain the reserve. Sponsorship is a UX improvement, not a reason to give the server custody of the user's wallet.

### 10.6 Circle technologies to include or defer

| Technology | Decision | Reason |
|---|---|---|
| Arc | Core | Contract execution and collateral |
| Canonical testnet USDC | Core | Stable unit for premium, liability, and claims |
| Circle wallet/passkey stack | Preferred after qualification | Reduces onboarding burden |
| Gas sponsorship | Optional if supported | Removes a small funding hurdle |
| Gateway | Defer | Useful only if actual supported cross-chain funding is needed |
| CCTP | Defer | Bridging adds complexity without improving the core demo |
| Nanopayments/x402 | Exclude P0 | Paid agent data is not the essential user problem |
| Privacy features | Exclude unless currently supported and verified | Do not design around a roadmap promise |

“Use as much Arc as is useful” means deep use of its relevant rails, not attaching unrelated sponsor features to the journey.

## 11. Settlement and operational trust

### 11.1 Source of truth

An event closing does not mean it has resolved. A price crossing a threshold is not automatically the same as Gemini's final result. The worker reads the configured source's final status/result, preserves the response and timestamp, verifies compatibility, and maps it to one valid scenario.

For the example nested pair, valid `(A,B)` outcomes are `(NO,NO)`, `(YES,NO)`, `(YES,YES)`. `(NO,YES)` is inconsistent and must never be assigned a normal payout. Missing, invalid, under-review, canceled, or contradictory results follow explicit waiting/void rules.

### 11.2 Trust boundary

P0 uses a designated authorized resolver that reports Gemini outcomes to Arc. The contract proves who submitted the report and enforces the payout schedule; it does not independently prove Gemini's offchain API response. A hash is an audit reference, not a cryptographic proof of source truth. Explain this in review and the README.

Use a short fixed finalization delay in the testnet demo, with the exact policy registered before acceptance. Real deployments would require a separately designed robust oracle/dispute model. For P0, do not implement an improvised token-voting dispute system.

### 11.3 Lifecycle policy

1. Wait for all required source contracts to be final according to verified source semantics.
2. Fetch and store raw evidence; validate status, timestamps, IDs, and scenario consistency.
3. Authorized resolver proposes the result, committing evidence hash.
4. During the predefined delay, an authorized correction can supersede the proposal only under the declared policy, restarting the delay; no user claims yet.
5. Once delay passes, any caller may finalize the currently valid proposal if the contract allows it.
6. Finalization is irreversible for this position set. Claims calculate payouts from committed schedules.
7. If no final outcome exists by the registered longstop, anyone can trigger the deterministic void/refund path, subject to the precise policy.

Use this concrete P0 boundary policy: proposal or correction is accepted only when `block.timestamp + finalizationDelay < longstop`; finalization requires `block.timestamp < longstop`; at `block.timestamp >= longstop`, an unfinalized family can only become void. A finalized family can never become void. This guarantees that competing finalize/void calls cannot choose different outcomes at the same timestamp. Delayed worker recovery must not override an already voided market. Display the finalization deadline and refund policy before acceptance.

### 11.4 Time-bound fallback

Pick a longstop per family appropriate to the source's settlement schedule, and show it before acceptance. It must not be an arbitrary invisible server timeout. For a demo replay, accelerated clock rules are deployed separately. Real live-family deadlines must remain real dates.

Outcome corrections after finalization cannot claw back already claimed funds. Document this limitation. A more sophisticated oracle system is future work, not something a hackathon frontend can solve with a warning badge.

## 12. System architecture and API contracts

### 12.1 Recommended stack

Use a TypeScript web application with React/Next.js, a typed validation library, an established query/cache layer, accessible component primitives, a chart library capable of explicit step plots, viem/wagmi or a qualified wallet SDK, Solidity with Foundry, and PostgreSQL or a simple durable relational store. Pin mutually compatible current versions after setup; do not copy old package versions from reference repos.

Keep math in a pure package shared by API and UI. Use CSS tokens for the design system. Prefer a small number of services over a microservice fleet.

### 12.2 Proposed repository layout

- `apps/web`: routes, components, wallet flow, server API handlers.
- `apps/worker`: Gemini ingestion, maker quote service, chain indexing, settlement observer.
- `packages/domain`: market types, thesis types, status enums, canonical serialization.
- `packages/payoffs`: scenario compiler, quote arithmetic, comparison normalization.
- `packages/gemini`: API adapter, schema validation, recorded fixtures.
- `packages/contracts-client`: ABI, deployed addresses per environment, event decoders.
- `contracts`: escrow/registry/resolver, scripts, tests.
- `fixtures/live-recordings`: timestamped source snapshots with provenance.
- `fixtures/replay`: historical/synthetic scenarios, strictly marked.
- `docs`: architecture, qualification, settlement policy, demo script, source acknowledgments.

A single-app layout is acceptable if team size favors it, but preserve these logical boundaries. Do not spend a day configuring a monorepo framework.

### 12.3 API surface

| Endpoint | Input | Output / mutation rules |
|---|---|---|
| `GET /api/topics` | category/search/mode | Supported verified families, freshness, availability |
| `GET /api/topics/:id` | family version | Source contracts, normalized scenarios, rules |
| `GET /api/topics/:id/snapshot` | optional last sequence | Prices, timestamps, status, freshness |
| `GET /api/topics/:id/evidence` | cursor | Source-backed evidence, publication/retrieval times |
| `POST /api/theses` | validated draft | Owner/local migration result; authenticated for private server storage |
| `PATCH /api/theses/:id` | expected revision + patch | Optimistic concurrency; no silent overwrite |
| `POST /api/theses/:id/confirm` | exact version | Immutable confirmed thesis revision |
| `POST /api/payoffs/compile` | family version, template, boundaries, size | Exhaustive payout specification and hash |
| `POST /api/quotes` | taker, spec hash, size/cap, mode | Signed offer or typed unavailable reason |
| `GET /api/quotes/:id` | ID | Stored quote status; chain acceptance authoritative |
| `GET /api/positions?owner=` | address, chain, mode | Indexed chain positions with indexing watermark |
| `GET /api/positions/:id` | chain + contract + ID | Position, outcome, claim state, receipts |
| `POST /api/research/ask` | family ID, question, selected evidence IDs | Cited explanation or unsupported-response state |
| `GET /api/health` | none | Non-secret provider/indexer availability |
| Operator routes | authenticated role | Preview/report/funding actions with audit log |

Wallet transactions should be assembled from validated ABI and terms, then signed by the user's wallet. The server does not accept a request like “buy for this address” as authority to move user funds.

### 12.4 Errors and idempotency

Return stable error codes: `UNSUPPORTED_FAMILY`, `INCOMPATIBLE_RULES`, `STALE_DATA`, `MARKET_CLOSED`, `QUOTE_EXPIRED`, `INSUFFICIENT_MAKER_COLLATERAL`, `INSUFFICIENT_USER_BALANCE`, `WRONG_CHAIN`, `SPEC_CHANGED`, `SOURCE_UNRESOLVED`, `SOURCE_INCONSISTENT`, `ALREADY_CLAIMED`, `INDEXER_BEHIND`.

Create/quote endpoints accept an idempotency key scoped to the user and request payload. Reusing a key with different terms returns a conflict. Quote IDs and contract nonces are separate from HTTP idempotency. Settlement jobs are restart-safe and check current chain state before submitting.

### 12.5 Secrets and deployment

Environment variables include RPC URLs, chain ID, canonical token address, contract addresses, server-only maker/resolver credentials, database URL, optional wallet provider config, optional model provider key, and data-mode flags. Public browser environment variables contain only intentionally public values. Never put private keys in client bundles, screenshots, README examples, or logs.

Prefer role-separated maker and resolver keys. Use restricted operational credentials and testnet-only funds. Hosting must support the chosen worker model; do not assume a serverless web request can maintain a permanent WS connection. Document how to run locally, seed replay, deploy contracts, start ingestion, and reconcile a receipt.

## 13. Data model, state machines, and persistence

### 13.1 Core records

| Record | Key fields |
|---|---|
| MarketFamily | ID, version, mode, contract IDs, rule hashes, predicate mapping, close/settlement/longstop, resolver |
| MarketSnapshot | family version, provider payload hash, source time, received time, bid/ask/depth, freshness |
| Evidence | URL, publisher, title, publishedAt, retrievedAt, excerpt/summary, mode, source hash |
| Thesis | owner/session, topic, revision, view template, boundaries, rationale, saved evidence, status |
| PayoffSpec | family version, valid scenarios, payout vector, M, canonical hash |
| Quote | ID, nonce, maker, taker, spec hash, P/M/F, expiry, signature, source snapshot |
| Position | chain, escrow, onchain ID, buyer, maker, quote hash, payout spec, cost, accepted tx/block |
| OutcomeReport | family version, source results, evidence hash, proposed/final times, report tx |
| Claim | position, recipient, amount, type, tx hash, status |
| OperationLog | actor, action, timestamp, affected ID, result; no secrets |

Private rationale and evidence labels are not stored onchain. Store a hash only if it has a concrete purpose, and do not assume hashes make low-entropy private text confidential.

### 13.2 State machines

Thesis: `draft → confirmed → quoted`; editing confirmed economic terms produces a new revision and invalidates the prior quote. Purchase links to a frozen revision; later edits do not alter it.

Quote: `requested → available → accepted | expired | invalidated`; unavailable is a response state, not an accepted financial object. Onchain nonce consumption is authoritative.

Position: `open → awaiting_result → proposed_result → claimable → claimed`; alternative terminal path `open/awaiting_result/proposed_result → void_refundable → refunded` according to exact contract policy. Zero payouts may finalize directly to `resolved_zero` without a pointless user transaction.

Transaction: `prepared → awaiting_signature → submitted → confirmed | reverted | replaced | unknown`. Unknown requires reconciliation, not automatic resubmission.

### 13.3 Chain indexing

Index contract events with a persisted block cursor. Deduplicate by chain, transaction hash, and log index. Handle provider retry/reorg behavior according to the chain's actual guarantees; do not assume any receipt immediately means the database is updated. After acceptance, direct-read the contract while the indexer catches up. Display a newly confirmed position immediately from the receipt and reconcile later.

### 13.4 Mode separation

Live testnet and replay each have explicit configuration, data namespace, contract address, and banner. The browser cannot switch a transaction to a replay contract via a hidden query parameter. Every quote is domain-bound to its exact deployment. Fixture IDs are impossible to confuse with real instrument IDs. Automated tests assert no live API response is silently replaced by synthetic values.

## 14. AI research behavior

### 14.1 Role of the model

AI helps the user articulate a view, compare evidence, understand resolution terms, and translate jargon. It does not decide the user's probability, invent a favorable quote, choose hidden risk, or report settlement facts without the deterministic source adapter.

A model provider is interchangeable and not necessarily Google Gemini. If Google Gemini is used, name it separately in architecture to avoid confusing it with the exchange sponsor.

### 14.2 Useful actions

- Explain the exact market question in plain language.
- Identify that “by Friday” and “at Friday's close” are different.
- Summarize supporting and challenging sources with links.
- Ask one focused clarification when the user's statement is ambiguous.
- Propose a structured directional or range draft using only supported boundaries.
- Explain why a comparison payoff differs from the user's target.
- Draft a short post-resolution reflection grounded in the saved thesis.

### 14.3 Response schema and guardrails

Return `summary`, `sourceIds`, `interpretations`, `proposedView`, `missingInformation`, and `limitations`. Only validated source IDs can be cited. Extracted proposed boundaries must match the verified family. The domain compiler, not the model, calculates money and generates the payoff table.

Treat source pages and user-provided text as untrusted content, not system instructions. Do not allow article text to cause tool execution, credential requests, or trades. Model output has no direct access to wallet signing or settlement keys. If the model fails, manual forms and source links remain fully usable.

### 14.4 Evidence quality

Use a small high-quality set of sources for the curated demo. Record publication time separately from retrieval time. Separate facts, attributed opinions, and the app's interpretations. Never use later-published evidence in a historical pre-resolution research screen. Avoid long copied passages; prefer short attributed summaries and original links.

## 15. Testing and acceptance criteria

Tests should establish money safety and user comprehension, not simply mirror implementation details.

### 15.1 Contract tests

Required unit/invariant/fuzz coverage:

- Acceptance locks exactly M and cannot partially succeed.
- For every valid scenario, buyer payout + maker payout = M.
- Void returns original contributions under the fee policy.
- Sum of all reserved liabilities never exceeds available escrow backing.
- Maker cannot withdraw reserved collateral.
- Quote replay fails across nonce, user, chain, deployment, or market version.
- Expired quotes and closed/invalid markets reject acceptance.
- Payouts outside [0,M], unsupported vectors, and malformed signatures revert.
- Claim twice fails; claim before finalization fails.
- Unauthorized result submission fails.
- Finalized outcomes cannot be changed.
- Longstop boundary and proposal/finalization race rules are deterministic.
- Pausing new trades does not freeze valid claims.
- Native/ERC-20 unit conversions cannot produce 10^12 errors.

### 15.2 Domain tests

Exhaust all outcomes for each supported family. Verify range inclusivity at both boundaries. Reject non-nested or incompatible predicates. Check normalized comparisons under equal budget and equal maximum payout. Test incoherent market reference intervals, missing bid/ask, decimal rounding, stale data, negative/oversized inputs, and probability totals if that P1 feature is built.

### 15.3 Integration tests

Use recorded real Gemini fixtures for schema tests; keep synthetic failure fixtures separately marked. Test unknown statuses, pagination, reconnect snapshot reset, source resolution correction before finalization, provider outage, and duplicate settlement job execution. Test the quote service with actual funded local contracts, then one complete Arc testnet loop.

### 15.4 Browser journeys

1. Guest research → save → confirm → build → connect → approve → accept → position.
2. Reject wallet request → retry without duplicate purchase.
3. Quote expires during approval → re-quote with explicit new terms.
4. Maker liquidity disappears → atomic revert and clear explanation.
5. Reload after transaction submission → recover receipt and position.
6. Final result → claim → balance and history reconcile.
7. Unresolved longstop → refund.
8. Switch wallet → no private-draft leakage.
9. API outage → no silent live-to-fixture switch.
10. Mobile + keyboard-only complete review and claim.

### 15.5 Final acceptance checklist

- Every advertised primary button performs its specified action.
- All numeric amounts have a defined source and unit.
- No active-looking fake live markets, balances, quote timers, or transaction hashes.
- Market compatibility verified beyond title matching.
- Exact collateral, quote, final result, and claim can be inspected.
- No early-exit promise without a funded buyback.
- Guest research works without wallet connection.
- Testnet/replay labels persist on all relevant pages and receipts.
- Private keys and API secrets absent from client/build/logs.
- Deployed site, contracts, README, and submission describe the same final scope.

## 16. Build sequence and cut lines

Plan assumes roughly the remaining hackathon week and a small team. Sequence is dependency-driven; adjust hours to actual team size. Do not treat all listed P1/P2 work as mandatory.

### Phase 0 — qualification, first 3–5 focused hours

Fetch actual Gemini inventory and rules; select family; verify resolved example; connect Arc; verify token units and wallet signing. Produce a tiny qualification note with actual IDs and a local end-to-end contract sketch. If no compatible range exists, choose binary live plus separate range replay immediately.

**Gate:** no design polishing until data and settlement semantics are known.

### Phase 1 — math and one working contract loop

Implement family schema, finite scenario compiler, quote encoding, escrow, outcome state machine, and invariant tests. Use a local chain and fixed deterministic fixture first. Open, resolve, and claim a position through scripts.

**Gate:** prove collateral conservation and quote replay protection before connecting a real UI button.

### Phase 2 — complete plain UI journey

Build Explore, Research, Build, Review, Portfolio, and Position with shared shell. Use real API snapshots, manual thesis fields, actual wallet connection, and local/Arc transactions. Finish all state handling before advanced AI or animation.

**Gate:** a user can finish the whole loop without developer console intervention, except the clearly separate operator settlement process.

### Phase 3 — Arc deployment and Gemini resolution plumbing

Deploy versioned contracts, fund demo maker, connect source observer and event indexer, implement report preview and claim reconciliation. Record real testnet transaction evidence. Verify wallet gas and token balances under the selected interface.

**Gate:** perform the winning, losing, and void scenarios on a controlled local environment; perform at least one full labeled testnet demonstration.

### Phase 4 — differentiation and design

Polish the payoff mismatch comparison, evidence-to-view transition, exact review copy, original visual system, and mobile/keyboard behavior. Add constrained AI interpretation only if it improves the journey. Add passkeys only if early qualification succeeded and the loop remains reliable.

**Gate:** a new tester explains their payout and loss correctly.

### Phase 5 — freeze and submission

Freeze feature development November 19. Rehearse demo, record fallback video, write README and source acknowledgments, verify deployment links, capture transactions, prepare Devpost, check current guide. Leave deadline buffer for upload and network issues.

### Parallel ownership if working with teammates

- Product/frontend owner: routes, charts, copy, user testing.
- Contracts/math owner: compiler, escrow, tests, deployments.
- Data/backend owner: Gemini adapter, maker, indexer, settlement.
- Shared final pass: one integrated flow, no competing data models.

A solo builder should work in that same dependency order rather than creating all screens first.

### Cut order if behind

Cut share pages, alerts, custom probability editor, additional topics, native Gemini execution, cross-chain funding, stepped payouts, advanced model research, and visual flourishes. Preserve the mismatch comparison, real quote, collateral, claim, and truthful data labels. If necessary, one well-explained binary custom payout is better than an unverified range contract.

## 17. Demo, submission, and judging proof

### 17.1 Recommended story

“I have a view about where this outcome lands. Existing contracts make me choose tickets, but they don't make the payoff consequences obvious. Thesis helps me inspect the evidence, state my view, and see exactly what pays. Gemini supplies real market context and outcomes; Arc locks the full payout and lets me claim it.”

Do not lead with a list of technologies. Lead with the mismatch the user can see.

### 17.2 Short demo outline

- 0:00–0:20: State the user's range view and show actual topic/rules.
- 0:20–0:45: Open one supporting and one challenging source; confirm the view.
- 0:45–1:15: Show ordinary tickets' extra outside-range payout versus the intended shape. Label cost normalization.
- 1:15–1:45: Obtain a funded quote, show maximum loss/payout, accept on Arc testnet.
- 1:45–2:15: Inspect locked collateral and position receipt.
- 2:15–2:45: In clearly labeled replay, show final source result and claim transaction.
- 2:45–3:00: Explain sponsor roles and the next product milestone.

Adjust exact duration to the current submission guide. For a longer live pitch, use extra time for the collateral explanation and differentiation, not more feature screens.

### 17.3 Evidence bundle

README should contain: one-sentence promise; architecture; exact Gemini endpoints/features used; exact Arc chain/deployment addresses; test token identity; source-to-settlement trust description; example acceptance/claim hashes; running instructions; tests; live vs replay status; inspiration and licensing notes; what was built during the event; known limitations.

Include a small `docs/qualification.md` table: capability, environment, evidence link, last verified date, limitation. This makes sponsor judging easier and prevents accidental overclaiming.

### 17.4 Likely judge questions

**Why not just buy two contracts?** Show the payout table and cost normalization. Two contracts can pay outside the user's range; a matching payoff is a different financial object. We do not claim it always has a better price.

**Who pays the winner?** The buyer's premium and the maker's additional collateral lock the entire maximum payout at acceptance.

**Who determines the result?** Gemini is the named source; a disclosed resolver reports its final result under an immutable policy. P0 is not a trustless oracle.

**Why Arc?** The actual position, collateral, and claims live there, in USDC, with USDC gas and compatible wallet tooling. It is a strong implementation fit, not a claim no other chain can execute the math.

**Why Gemini?** Its actual contracts, quotes, status, and results structure both the research experience and settlement reference. This is deeper than showing a price widget.

**Where is liquidity?** A funded testnet demo maker supplies bounded RFQs. Multi-maker competition is future work; we do not pretend there is organic depth.

**Can I exit early?** Not in P0. The review says hold to settlement. A later buyback requires a separate real quote.

**What is original?** The product makes the mismatch between an articulated view and a purchased payoff explicit, then connects that choice to a fully funded inspectable contract. The repo references are credited inspiration, not the originality claim.

## 18. Cursor execution instructions

Paste this document into the repository as `docs/PROJECT_SPEC.md`. Use the following prompt to begin:

> Build Thesis according to docs/PROJECT_SPEC.md. First inspect the current repository and any AGENTS.md instructions. Do not implement all future-scope features. Start with Phase 0: qualify actual Gemini data, verify a compatible market family, verify Arc testnet connectivity and USDC token units, and report concrete blockers. Then implement the pure payoff domain and local contract loop with meaningful money-conservation tests. Proceed to one complete UI journey before cosmetic expansion. Preserve the product's distinction between research, confirmed belief, payoff, quote, and position. Never fabricate live market data, liquidity, settlement outcomes, or transaction receipts. Keep replay separate and labeled. Use the reference repositories for architectural study and credit them; independently implement unless licensing explicitly permits reuse. Do not copy their visual identities. At the end of each phase, state what works, how it was verified, and which next gate remains.

### 18.1 Implementation rules Cursor should follow

1. Read the entire specification before selecting a financial model.
2. Maintain a short implementation checklist with P0/P1/P2 labels.
3. Record actual Gemini fields and contract semantics; do not rely on illustrative examples.
4. Keep all financial arithmetic fixed-point and tested.
5. Make the backend and contract validate independently.
6. Do not hide a nonfunctional control behind a beautiful UI; implement it or visibly remove it.
7. Never treat mock balances or seeded outcomes as live.
8. Avoid unsolicited features that consume the deadline.
9. Keep source attribution and deployment evidence up to date.
10. After each integration change, run the relevant tests and the affected user journey.
11. Before finalizing, check every route's loading, empty, error, and success states.
12. Keep private user notes separate from public position data.

### 18.2 Suggested first implementation tasks

- Create typed `MarketFamily`, `Scenario`, `ThesisRevision`, `PayoffSpec`, and `Quote` models.
- Implement `verifyCompatibility`, `compileDirectional`, `compileRange`, `normalizeComparison`, and `computePositionPayout` as pure functions.
- Record one actual Gemini market fixture and one final-resolution fixture.
- Implement a minimal `ThesisEscrow` with acceptance, finalization, claim, and void.
- Demonstrate conservation with unit and invariant tests.
- Build the chart and scenario table from the same compiled data.
- Wire quote acceptance through the user's actual wallet.
- Add source observation, indexer reconciliation, and portfolio.
- Polish only after the loop is complete.

### 18.3 Definition of done

A fresh user can discover the supported question, understand its rules, articulate a view, inspect the exact payout, obtain a funded quote, accept it on Arc testnet, find the resulting position, and claim a deterministic final payout/refund. Every displayed financial number is derived from a recorded source or the committed contract terms. The demo can be reproduced from the README, and the submission accurately distinguishes working live components from replay and future scope.

## 19. Research sources and unresolved checks

### Official sources checked for this plan

- UBC hackathon: https://www.universityblockchain.org/programs/hackathon
- Gemini market discovery and result metadata: https://developer.gemini.com/prediction-markets-spec/markets
- Gemini trading and batch semantics: https://developer.gemini.com/prediction-markets-spec/trading
- Gemini combo RFQ examples and availability context: https://developer.gemini.com/prediction-markets/combos-rfq/examples
- Arc connection/network and denomination reference: https://docs.arc.io/arc/references/connect-to-arc
- Circle wallet overview: https://www.circle.com/wallets
- Circle developer overview: https://www.circle.com/developer
- Linear frontend design reference: https://linear.app/now/behind-the-latest-design-refresh
- Repository links and pinned commits are listed in Section 3.

### Checks that remain implementation prerequisites

- Actual current Gemini event inventory and a valid range family: not established by documentation examples.
- The exact source rules and finality/correction policy for the chosen contracts.
- Current Gemini access terms, rate limits, stream schema, and permissible data use.
- Any native combo/RFQ account eligibility if explored later.
- Exact current canonical Arc testnet USDC address and SDK compatibility.
- Circle passkey/sponsorship support for the chosen wallet path.
- The event's linked full submission guide and any updated sponsor requirements.
- Licensing for any source code or assets proposed for reuse.

These are qualification tasks, not reasons to stop planning. The spec deliberately provides binary/replay and external-wallet fallbacks so the core product can still ship truthfully.
