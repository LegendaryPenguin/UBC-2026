# Product restructure map

This map applies the user's November 18, 2026 **Thesis Dashboard + Contextual Assistant** direction. It supersedes the previous three-item navigation and route-heavy VFINAL presentation. The prior product journey remains intact: Explore → Research and confirm a view → Build → optional Compare → Review → optional supported action → Portfolio → History. Consolidate presentation without removing working backend behavior or weakening permissions, validation, recovery, or record integrity.

## Route dispositions

**Keep** means a main destination or thesis-workspace stage. **Merge** means move the useful controls into a named destination and keep a legacy redirect/deep link where needed. **Supporting deep link** means the page remains reachable from an object/action, but is not promoted as a top-level destination. **Private operational** means available only to configured operators. **Defer/retire UI** means remove from normal navigation and preserve underlying records/API until dependencies have been checked.

| Existing route | Disposition | Target surface and preserved behavior |
| --- | --- | --- |
| `/` | Keep | Dashboard; greeting, Start a thesis, prominent Continue card, recent work, verified updates, compact portfolio summary, Ask Thesis. |
| `/home` | Merge | Legacy URL redirects to `/`; retain useful recent-thesis and action-required content in Dashboard. |
| `/explore` | Keep + merge | One Explore destination for supported Gemini markets, search, category/status/horizon filters, watched markets, and evidenced market movements. |
| `/gemini` | Merge | Catalog controls move into Explore. Legacy URL opens the Gemini view within Explore. |
| `/gemini/[ticker]` | Supporting deep link | Event/contract details remain reachable from a market card and can open Research or attach a compatible market. Keep exact event/contract rules and order qualification gates. |
| `/search` | Merge | Search moves into Explore; legacy URL focuses Explore search. Preserve topic and authorized-thesis result links. |
| `/calendar` | Merge | Relevant cutoff/observation/settlement dates move into Explore as a timeline/horizon view. Do not imply background reminders. |
| `/watchlists` | Merge | Watched-market summary and simple watch/unwatch actions move into Explore. |
| `/watchlists/[id]` | Merge / deep link | List details are available from the watched-markets panel. Do not require elaborate list management to follow a market. Preserve ownership and deletion safeguards if the control remains. |
| `/workspace` | Merge | Legacy URL redirects to the My Theses library at `/theses`. |
| `/theses` | Keep | Full My Theses library: search, status filters, open/continue, rename, duplicate, archive, and permitted draft deletion. Archive/delete never mutate immutable financial records. |
| `/theses/[id]` | Keep | Thesis Research workspace with question/view anchored, saved state, contextual assistant, exact contract/rules, evidence, and explicit confirm. |
| `/topics/[slug]` | Merge / deep link | Opening a contract starts an unsaved thesis draft or offers attach-to-existing when compatible; keep a legacy route/deep link during migration. |
| `/topics/[slug]/evidence/[eid]` | Supporting deep link | Evidence opens in a Research-context panel or focused detail view; preserve source and thesis association. |
| `/theses/[id]/build` | Keep | Build stage; preserve leg editing, allocation, scenarios, cost/payout distinction, mismatch warnings, and draft recovery. |
| `/theses/[id]/compare` | Keep, optional | Compare two or three actually supported constructions on an explicit common basis; users can skip it. |
| `/theses/[id]/review` | Merge / deep link | Exact review becomes part of the connected selection→quote→accept sequence; retain a deep link for recovery and external return paths. |
| `/theses/[id]/history` | Keep as workspace tab | History is reachable throughout the thesis workspace. Merge useful journal reflection into this history; keep restore-as-new-version. |
| `/quotes/[id]` | Supporting deep link / panel | Preserve exact quote terms, explicit acceptance, wallet authorization where applicable, pending/unknown recovery, and immutable quote record. Open contextually from Review or a position. |
| `/portfolio` | Keep | One Portfolio destination with open Positions, Settled history, Orders, Activity, and Alerts/Notifications tabs. Keep Paper/Gemini/Arc records distinct. |
| `/positions/[id]` | Supporting deep link / panel | Position detail opens contextually from Portfolio and links the original thesis, construction, evidence, venue, and actual available actions. |
| `/positions/[id]/exit` | Merge / supporting | Put exit availability in position details. Show an action only if the venue supports it; preserve the holding when unsupported. |
| `/orders` | Merge | Orders panel within Portfolio; preserve Gemini scopes, cancel confirmation, and venue-confirmed status. Legacy URL opens the Portfolio Orders panel. |
| `/activity` | Merge | Activity panel within Portfolio; keep the ledger and financial record links. |
| `/transactions/[id]` | Supporting deep link / panel | Show transaction details in Portfolio context while retaining a direct link for receipts and recovery. |
| `/alerts` | Merge | Position alerts panel within Portfolio; preserve create/pause/resume and load/refresh evaluation behavior. |
| `/notifications` | Merge | Notification inbox panel within Portfolio; preserve read/unread and ownership checks. |
| `/wallet` | Supporting contextual surface | Offer wallet connection/funding guidance only when needed (for example, from Review). Do not require wallet connection for research or saving a thesis. |
| `/wallet/deposit` | Merge / redirect | Redirect to Wallet balance view; no deposit tracking or transfer control is presented as completed. |
| `/wallet/withdraw` | Merge / redirect | Redirect to Wallet balance view; no unsupported withdrawal control is shown. |
| `/settings` | Keep, profile menu | Single account/settings destination from the profile menu. Merge account, connection, notification, privacy, and security settings as sections. |
| `/settings/account` | Merge | Account section within Settings. |
| `/settings/security` | Merge | Security section within Settings; retain authentication and recovery safeguards. |
| `/settings/connections` | Merge | Connections section within Settings; connect Gemini only when the user needs a supported action. |
| `/settings/connections/gemini/callback` | Supporting required callback | Keep the OAuth callback and its success/failure state; not a navigation destination. |
| `/settings/notifications` | Merge | Notification settings section. |
| `/settings/privacy` | Merge | Privacy/account-data section with explicit destructive confirmation. |
| `/auth` | Keep, supporting | The current local email-code flow is development-only, labeled as such, and migrates guest-owned work after verification. Google and signed-wallet authentication are not configured; do not imply production account sync. |
| `/onboarding` | Merge / redirect | Redirect to Settings → Account preferences; guests can explore first. |
| `/journal` | Merge / redirect | Redirect to Portfolio; thesis revisions and execution history remain in each thesis History tab. |
| `/journal/[id]` | Merge / redirect | Redirect to the linked Position → thesis tab; the old session-only reflection control is removed rather than presented as saved. |
| `/publish/[id]` | Supporting deep link | Keep explicit snapshot publication available from a direct context, but do not add a social-feed or profile destination. Existing share tokens remain read-only. |
| `/shared/[token]` | Supporting deep link | Preserve authorized read-only shared snapshots that already have valid tokens; do not promote a social feed. |
| `/profile/[handle]` | Retire placeholder | The current route is static placeholder content with no profile data; redirect it to Explore. Account identity stays in Settings. |
| `/reports` | Merge / redirect | Redirect ledger review to Portfolio Activity; retain report APIs/records pending dependency review. |
| `/support` | Supporting contextual route | Keep the support form available from transaction recovery; do not place it in primary navigation. |
| `/support/[ticket]` | Defer/retire UI / deep link | Existing ticket records must not be silently deleted; no primary navigation. |
| `/help` | Keep, contextual | Keep concise context help, surfaced from the profile menu or the page where it applies. |
| `/help/[article]` | Supporting deep link | Keep useful help articles linked from contextual help. |
| `/status` | Supporting deep link | Keep provider status reachable from Profile and show provider-specific failures in context. |
| `/maker` | Private operational | Keep outside user navigation; require configured operator access. |
| `/ops` | Private operational | Keep outside user navigation; require configured operator and deployment access. |

## Shared interactions to consolidate

- One assistant system: a persistent Ask Thesis side panel outside a thesis workspace and thesis-linked conversation in the built-in VoicePanel rail inside the workspace. The global thread list includes linked thesis conversations so the same history can be reopened. Never show both at once.
- On mobile the assistant becomes a bottom sheet/full-height view with a clear return action.
- Assistant navigation uses bounded, structured app actions, not arbitrary generated URLs or DOM clicks. Direct destination requests may navigate; inferred thesis/view changes require a visible proposal and user confirmation.
- Guest research and drafts stay usable without sign-in. Guest data is server-scoped to a guest cookie; verified development email-code sign-in transfers mutable guest-owned records without changing their record IDs. Conversations are server-side and linked either generally or to a thesis.
- Keep manual text controls equal to voice controls. Voice can prepare a review, never approve/sign/submit a financial action.
- Preserve old URLs only as redirects, required callbacks, object deep links, or recovery links. A route can remain technically available without appearing in navigation.

## Migration rules

1. Migrate the user-visible controls and entry points before redirecting a route.
2. Keep backend APIs, immutable quote/position/transaction records, ownership checks, and private operator tools unless a dependency review authorizes a separate change.
3. Never archive/delete a thesis in a way that removes its associated financial record. A duplicate is an independent draft; restore creates a new revision.
4. Update the active scope, checklist, route coverage, and UI inventory together so documentation no longer presents deferred pages as active destinations.
