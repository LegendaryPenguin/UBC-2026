# Thesis website: pre-restructure page and popup inventory

This document records the **51 route templates that existed before the Dashboard + Contextual Assistant restructure**. It is the migration baseline, not a requirement to keep every route visible. See [product-restructure-map.md](product-restructure-map.md) for the target disposition of each route. API endpoints are not listed because they do not render user-facing pages. Routes with bracketed values are templates: for example, `/theses/[id]` needs a real thesis ID.

## Main navigation and shared shell

- **Thesis logo** returns to `/explore`.
- **Explore**, **My Theses**, and **Portfolio** are the primary destinations. On desktop they appear in the header; on mobile they appear in the bottom navigation.
- **More** is a desktop dropdown with Gemini markets, Alerts, Journal, Activity, Reports, Help, and Settings. On mobile, the **Menu** button expands the primary and More destinations in a panel.
- **Mode** selects Replay, Live data, or Paper. Changing modes prompts for confirmation and refreshes mode-dependent data. Existing orders and positions remain in their original environment.
- **Connect wallet / Switch to Arc** invokes the configured wallet connection or network-switch flow.
- **Account** opens `/auth`.
- A **Skip to content** link is available for keyboard navigation.
- Thesis workspaces expose **Research, Build, Compare, and History** tabs. Build requires a confirmed view; the other tabs link back into the same thesis.

## Page routes

### Entry and workspace

| Route | Page | What it contains |
| --- | --- | --- |
| `/` | Landing | Product introduction and entry points into the research journey. |
| `/home` | Home | Recent thesis work, resolved positions that need action, and a starter research journey when the account is empty. |
| `/workspace` | My Theses | Owned drafts and saved theses to reopen or continue. |
| `/auth` | Sign in | The app's local account sign-in flow for account-scoped features. |
| `/onboarding` | Setup | Four steps: select interests, set a display timezone, choose explanation density, and optionally open Wallet. Users can go back, skip, or save and finish. |

### Explore and research

| Route | Page | What it contains |
| --- | --- | --- |
| `/explore` | Explore | Mode-aware topic search and discovery, watched topics, market movements, and links into Research. Watching a topic requires an account. A live-data failure can be retried or followed by a confirmed switch to Replay. |
| `/gemini` | Gemini market explorer | Gemini event browsing, status/category filters, search, pagination, and links to event details. |
| `/gemini/[ticker]` | Gemini event details | Event and contract descriptions, source, event-level and contract-level rules links, available price references, provenance, and compatible Research links. Native Gemini order controls are capability-gated. |
| `/topics/[slug]` | Topic Research | The selected contract's question/rules, history when provided, evidence, view editor, and text/voice assistant. Missing provider data is shown as missing rather than fabricated. |
| `/topics/[slug]/evidence/[eid]` | Evidence detail | One evidence item, its source, and its relation to the thesis. |
| `/search` | Search | Search topics and the signed-in user's theses; results link to Research or the thesis workspace. |
| `/calendar` | Calendar | Market events and their relevant dates. |
| `/watchlists` | Watchlists | The user's saved market lists. |
| `/watchlists/[id]` | Watchlist details | One list's saved topics and list controls, including deletion of list metadata. |

### Thesis workspace

| Route | Page | What it contains |
| --- | --- | --- |
| `/theses/[id]` | Research and view editor | A saved thesis's research, voice/text clarification, supported view fields, rationale, save, confirm, duplicate, and History controls. Unsaved edits are guarded when navigating away. |
| `/theses/[id]/build` | Build a basket | Supported contract legs and allocations, scenario payout chart/table, mismatch warnings, and voice/text basket explanation. Basket edits do not place an order. |
| `/theses/[id]/compare` | Compare constructions | Available constructions on a stated basis, with scenario outcomes, cost/fee availability, and execution differences. Users can return to Build or open Review. |
| `/theses/[id]/review` | Review construction | Read-only review of the selected construction, venue/environment, exact terms, available costs and fees, payouts, settlement rules, and execution caveats. A quote is requested only after an explicit action. |
| `/theses/[id]/history` | Revision history | View revisions and linked quote/position history. Restore creates a new version rather than rewriting earlier history. |

### Portfolio and financial records

| Route | Page | What it contains |
| --- | --- | --- |
| `/portfolio` | Portfolio | Gemini positions, Arc/Paper positions and outcomes, and links to related orders, theses, or positions. |
| `/positions/[id]` | Position details | One position's current status, venue/environment, saved thesis and entry reasoning, activity, and supported settlement or claim actions. |
| `/positions/[id]/exit` | Position exit | Shows whether the venue supports an exit. Unsupported exit liquidity is reported; the app does not simulate a sale by changing the position. |
| `/quotes/[id]` | Quote details | Exact premium/fee, maximum-loss and payout information, scenario table, status, and an explicit Paper acceptance or qualified live-offer action. |
| `/orders` | Gemini native orders | Gemini order history and cancellation when account scopes permit. New native order execution stays disabled until sandbox behavior is qualified. |
| `/transactions/[id]` | Transaction details | Details and status for one recorded transaction. |
| `/activity` | Activity ledger | Financial activity records, with an empty state before any ledger entries exist. |
| `/alerts` | Position alerts | Create, pause, or resume an in-app settlement alert and inspect the alert inbox. Position state is checked when this page loads or refreshes; there is no background/push delivery. |
| `/notifications` | Notification inbox | Open notifications and mark them read or unread. Notifications do not place trades. |

### Wallet and settings

| Route | Page | What it contains |
| --- | --- | --- |
| `/wallet` | Wallet | Wallet connection and configured wallet/network context. |
| `/wallet/deposit` | Deposit | Arc testnet destination and transfer guidance. The “I sent funds” action does not credit a balance. |
| `/wallet/withdraw` | Withdraw | Recipient and amount fields with wallet-send guidance. Reserved escrow collateral cannot be withdrawn. |
| `/settings` | Settings | Links into account, connections, notification, privacy, and security settings. |
| `/settings/account` | Account | Name and handle fields, save action, and account-closure link. |
| `/settings/connections` | Connections | Gemini connection status, OAuth connection, permission information, and disconnect action. |
| `/settings/connections/gemini/callback` | Gemini OAuth callback | Connection-in-progress, success, or failure state after Gemini redirects back to the app. |
| `/settings/notifications` | Notification preferences | Informational description of the in-app baseline, security messages, and quiet hours for optional research alerts. |
| `/settings/privacy` | Privacy and closure | Privacy and account-data closure controls. |
| `/settings/security` | Security | Explains app-account recovery versus wallet-key recovery and the last-usable-sign-in-method rule. |

### Journal, sharing, help, and support

| Route | Page | What it contains |
| --- | --- | --- |
| `/journal` | Journal | Decision snapshots linked to accepted quotes; an empty state appears before a snapshot exists. |
| `/journal/[id]` | Decision review | One position-linked decision snapshot and a Write reflection action. The current action reports a session-local save. |
| `/reports` | Reports | A request to generate an accounting ledger export and the resulting export job notice. |
| `/publish/[id]` | Publish snapshot | Prepare a thesis snapshot for sharing, with rationale redaction controls. |
| `/shared/[token]` | Shared thesis | Read-only thesis snapshot opened through a share token. |
| `/profile/[handle]` | Profile | Profile page for a handle. |
| `/help` | Help | Help topics and article links. |
| `/help/[article]` | Help article | One selected help article. |
| `/support` | Support | Support landing page and available ticket actions. |
| `/support/[ticket]` | Support ticket | One support ticket's details. |
| `/status` | Service status | Integration and capability status reported by the app. |

### Operator pages

| Route | Page | What it contains |
| --- | --- | --- |
| `/maker` | Maker console | Operator surface for maker policy and collateral operations. Requires the configured operator access and wallet setup. |
| `/ops` | Operations | Operator surface for source-backed settlement proposals and position actions. Requires operator and external deployment/provider setup. |

## Menus, panels, and popup behavior

The app does not use a site-built modal-dialog framework. Most review surfaces are regular in-page cards. Browser-native confirmation and alert boxes use the browser's own appearance and wording.

### Menus and wallet prompts

| Surface | Where it opens | Behavior |
| --- | --- | --- |
| Desktop More dropdown | Header → More | Links to Gemini markets, Alerts, Journal, Activity, Reports, Help, and Settings. |
| Mobile navigation panel | Header → Menu on small screens | Expands the primary destinations and More destinations; selecting a link closes the panel. |
| Mode confirmation | Header → Mode | Browser confirmation before changing Replay, Live data, or Paper. Cancel keeps the existing mode. Switching refreshes mode-dependent data and clears open quote review/order-form inputs. Existing orders and positions remain in their original environment. |
| Wallet connection/network prompt | Header → Connect wallet or Switch to Arc; wallet actions elsewhere | The configured wallet connector, extension, or wallet app requests connection, network change, or signature when needed. These prompts belong to the wallet provider, not Thesis. |

### Browser confirmation boxes

| Trigger | What it confirms |
| --- | --- |
| Leave Research or open History with unsaved view edits | Whether to discard the unsaved edits. Cancel keeps the user on the current Research page. |
| Cancel a Gemini native order | Warns that a fill can occur before Gemini processes cancellation. |
| Disconnect Gemini | Warns that the app token will be revoked and open Gemini orders will not be canceled. |
| Delete a watchlist | Confirms deletion of the list metadata. |
| Close account data | Confirms account-data closure and warns that onchain claims remain accessible from the wallet. |

### Browser alert boxes

| Trigger | Current message/result |
| --- | --- |
| Journal → Write reflection | Reports “Saved locally for this session.” |
| Reports → Generate ledger | Reports the export job ID after a successful request. |
| Deposit → I sent funds | Says tracking started and explicitly says this does not credit a balance. |
| Withdraw → Send with an invalid address | Asks the user to review the recipient address. |
| Withdraw → Send with a valid-looking address | Directs the user to use the wallet and says Thesis does not custody keys. |
| Position → Exit after an error | Shows the exit error, or “No exit liquidity.” |

### In-page panels that may look like popups

- **Voice / research assistant:** A side panel on Research and related thesis stages. It accepts typed or spoken questions, shows an editable transcript, asks clarifying questions, and can show a proposed-view preview. It is part of the page, not a modal.
- **Confirm-view summary:** Appears inline in thesis Research after the user chooses to review confirmation. Confirm saves a thesis version and proceeds to Build; Cancel leaves the draft unconfirmed.
- **Gemini terms and native-order review cards:** Appear inline on Gemini event details when the native order path is available. Current sandbox/account qualification gates this path.
- **Selected-quote details and acceptance controls:** Appear inline on `/quotes/[id]`. Paper acceptance is a separate explicit action. A live wallet action requires a qualified offer and provider authorization.
- **Loading, error, empty, and success notices:** Most pages show these inline instead of opening a popup. Their exact controls vary by page and can include retry, return, cancel, or a next-step link.

## Availability notes

- Replay, Live data, and Paper are separate modes. Replay content is illustrative and is not labeled as live Gemini data.
- Gemini market discovery/detail data is available, while authenticated native Gemini order execution remains gated pending sandbox qualification.
- Arc custom construction appears only where it adds value and the configured path is available. Arc testnet execution is not presented as verified without qualification.
- Voice and text share the same research actions. Physical microphone/browser behavior has not been qualified on every device.
- Empty, missing, or unavailable provider data is shown explicitly. The app should not present a simulated result as a live execution, fill, balance, or settlement.
