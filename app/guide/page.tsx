"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Card, Field, inputCls } from "@/components/ui";

type PageEntry = { path: string; name: string; description: string; via?: string; href?: string };
type PageGroup = { title: string; intro: string; pages: PageEntry[] };
type Surface = { name: string; where: string; behavior: string; kind: "Menu" | "Inline panel" | "Browser confirmation" | "Browser alert" | "Wallet prompt" };

const PAGE_GROUPS: PageGroup[] = [
  {
    title: "Start and navigate",
    intro: "The app shell and the places users commonly enter or resume work.",
    pages: [
      { path: "/", name: "Landing", description: "Product introduction and entry into the research journey.", href: "/" },
      { path: "/home", name: "Home", description: "Shows recent thesis work, resolved positions needing action, and a starter path for a first research journey.", href: "/home" },
      { path: "/workspace", name: "My Theses", description: "Find and resume thesis drafts, saved views, and prior work.", href: "/workspace" },
      { path: "/auth", name: "Sign in", description: "Local account sign-in for account-scoped features.", href: "/auth" },
      { path: "/onboarding", name: "Setup", description: "Four steps for interests, timezone, explanation density, and an optional wallet link; users can go back, skip, or save and finish.", href: "/onboarding" },
      { path: "/guide", name: "App guide", description: "This searchable inventory of pages and interactive surfaces.", href: "/guide" },
    ],
  },
  {
    title: "Explore and research markets",
    intro: "Market discovery, Gemini event details, and research source pages.",
    pages: [
      { path: "/explore", name: "Explore", description: "Search compatible topics, browse market movements, open Research, and manage watched topics.", href: "/explore" },
      { path: "/gemini", name: "Gemini market explorer", description: "Browse Gemini events by status/category, search, paginate, and open event details.", href: "/gemini" },
      { path: "/gemini/[ticker]", name: "Gemini event details", description: "Inspect an event, its contracts, price references, source, rules, and compatible Research links. Native order controls remain capability-gated.", via: "Gemini market explorer", href: "/gemini" },
      { path: "/topics/[slug]", name: "Topic Research", description: "Inspect the selected Gemini contract, rules, price history when supplied, evidence, view editor, and voice/text assistant.", via: "Explore or a Gemini contract", href: "/explore" },
      { path: "/topics/[slug]/evidence/[eid]", name: "Evidence detail", description: "Read one evidence item with its source and relationship to the thesis.", via: "An evidence card in Topic Research", href: "/explore" },
      { path: "/search", name: "Search", description: "Search available topics and the signed-in user's theses; results link to Research or the thesis workspace.", href: "/search" },
      { path: "/calendar", name: "Calendar", description: "Browse market events and their relevant dates.", href: "/calendar" },
      { path: "/watchlists", name: "Watchlists", description: "View and organize saved market lists; saving requires an account.", href: "/watchlists" },
      { path: "/watchlists/[id]", name: "Watchlist details", description: "Open a specific list, inspect its saved topics, and remove list metadata.", via: "Watchlists", href: "/watchlists" },
    ],
  },
  {
    title: "Thesis workspace",
    intro: "The Research, Build, Compare, Review, and History stages for one thesis.",
    pages: [
      { path: "/theses/[id]", name: "Research and view editor", description: "Clarify the thesis with text or voice, edit its supported view and rationale, save a draft, confirm it, duplicate it, or open History.", via: "My Theses or a Research action", href: "/workspace" },
      { path: "/theses/[id]/build", name: "Build a basket", description: "Edit supported legs and allocations, inspect scenario payouts, and hear or read an explanation of the basket.", via: "A confirmed thesis → Build", href: "/workspace" },
      { path: "/theses/[id]/compare", name: "Compare constructions", description: "Compare available construction choices on a stated basis and select one to review.", via: "Build → Compare", href: "/workspace" },
      { path: "/theses/[id]/review", name: "Review construction", description: "Read the selected construction's exact available terms, environment, costs, fees, payout scenarios, and execution caveats before proceeding or canceling.", via: "Compare → Review", href: "/workspace" },
      { path: "/theses/[id]/history", name: "Revision history", description: "Inspect view revisions and linked construction/position history; restore creates a new version.", via: "Research → History", href: "/workspace" },
    ],
  },
  {
    title: "Portfolio and financial records",
    intro: "Positions, quotes, activity, and the records that follow a supported action.",
    pages: [
      { path: "/portfolio", name: "Portfolio", description: "Review Gemini positions and Arc/Paper positions and outcomes, with links to related orders and theses.", href: "/portfolio" },
      { path: "/positions/[id]", name: "Position details", description: "Inspect one position's status, terms, thesis link, activity, and any supported settlement or claim action.", via: "Portfolio", href: "/portfolio" },
      { path: "/positions/[id]/exit", name: "Position exit", description: "Check whether the venue supports an exit. Unsupported exit liquidity is stated; the position is not altered to simulate a sale.", via: "A position's Exit action", href: "/portfolio" },
      { path: "/quotes/[id]", name: "Quote details and acceptance", description: "Inspect exact quote terms and payouts; explicitly accept a supported Paper quote or qualified offer.", via: "A quote created from Review", href: "/workspace" },
      { path: "/orders", name: "Gemini native orders", description: "Inspect Gemini order state and request cancellation when account permissions allow. Native order placement remains unqualified and gated.", via: "Gemini event details or a linked order", href: "/gemini" },
      { path: "/transactions/[id]", name: "Transaction details", description: "Inspect a specific recorded transaction and its current state.", via: "A transaction or position activity link", href: "/portfolio" },
      { path: "/activity", name: "Activity ledger", description: "Review recorded financial activity; an empty ledger is shown when there are no entries.", href: "/activity" },
      { path: "/alerts", name: "Position alerts", description: "Create, pause, or resume an in-app settlement alert for a position and inspect the alert inbox. Checks run when Alerts loads or refreshes.", href: "/alerts" },
      { path: "/notifications", name: "Notification inbox", description: "Read notifications and update their read state.", href: "/notifications" },
    ],
  },
  {
    title: "Wallet and account settings",
    intro: "Wallet actions, connections, preferences, and account controls.",
    pages: [
      { path: "/wallet", name: "Wallet", description: "Connect a wallet and inspect the configured wallet/network context.", href: "/wallet" },
      { path: "/wallet/deposit", name: "Deposit", description: "Copy the Arc testnet destination and review transfer guidance. The tracking button does not credit a balance.", href: "/wallet/deposit" },
      { path: "/wallet/withdraw", name: "Withdraw", description: "Enter a recipient and amount, then use the connected wallet; reserved collateral cannot be withdrawn.", href: "/wallet/withdraw" },
      { path: "/settings", name: "Settings", description: "Settings index with links to account, connections, notifications, privacy, and security.", href: "/settings" },
      { path: "/settings/account", name: "Account settings", description: "Review account details and account-level controls.", href: "/settings/account" },
      { path: "/settings/connections", name: "Connections", description: "Connect or disconnect Gemini and inspect the granted connection permissions.", href: "/settings/connections" },
      { path: "/settings/connections/gemini/callback", name: "Gemini connection callback", description: "Shows the result while Gemini OAuth returns to the app.", via: "Automatic return from Gemini authorization", href: "/settings/connections" },
      { path: "/settings/notifications", name: "Notification preferences", description: "Explains the in-app baseline, security-message handling, and optional research-alert quiet hours; this page is currently informational.", href: "/settings/notifications" },
      { path: "/settings/privacy", name: "Privacy and closure", description: "Review privacy and account-data closure controls.", href: "/settings/privacy" },
      { path: "/settings/security", name: "Security", description: "Explains how app-account recovery differs from wallet keys and why the last usable sign-in method cannot be removed without a replacement.", href: "/settings/security" },
    ],
  },
  {
    title: "Journal, sharing, help, and support",
    intro: "Reflection, exports, shared views, help articles, and support tickets.",
    pages: [
      { path: "/journal", name: "Journal", description: "Browse snapshots linked to accepted quotes; an empty state appears before any decision snapshot exists.", href: "/journal" },
      { path: "/journal/[id]", name: "Decision review", description: "Review one position-linked decision snapshot. Write reflection currently reports a session-local save.", via: "Journal", href: "/journal" },
      { path: "/reports", name: "Reports", description: "Request an accounting ledger export and see when its export job is ready.", href: "/reports" },
      { path: "/publish/[id]", name: "Publish snapshot", description: "Prepare a thesis snapshot for sharing with rationale redaction controls.", via: "A thesis share/publish action", href: "/workspace" },
      { path: "/shared/[token]", name: "Shared thesis", description: "Open a read-only thesis snapshot using its share token.", via: "A shared link", href: "/explore" },
      { path: "/profile/[handle]", name: "Profile", description: "View the profile page for a handle.", via: "A profile link", href: "/explore" },
      { path: "/help", name: "Help", description: "Browse help topics and articles.", href: "/help" },
      { path: "/help/[article]", name: "Help article", description: "Read one help article.", via: "Help", href: "/help" },
      { path: "/support", name: "Support", description: "Open the support area and its available ticket actions.", href: "/support" },
      { path: "/support/[ticket]", name: "Support ticket", description: "View an individual support ticket.", via: "Support", href: "/support" },
      { path: "/status", name: "Service status", description: "Inspect integration and capability status reported by the app.", href: "/status" },
    ],
  },
  {
    title: "Operator pages",
    intro: "Specialized operational surfaces; availability depends on operator configuration and external setup.",
    pages: [
      { path: "/maker", name: "Maker console", description: "Operator surface for maker policy and collateral actions.", href: "/maker" },
      { path: "/ops", name: "Operations", description: "Operator surface for source-backed settlement proposals and position actions.", href: "/ops" },
    ],
  },
];

const SURFACES: Surface[] = [
  { name: "Desktop More menu", where: "Header → More", behavior: "Dropdown with Gemini markets, Alerts, Journal, Activity, Reports, Help, Settings, and this App guide.", kind: "Menu" },
  { name: "Mobile navigation menu", where: "Header → Menu on small screens", behavior: "Expands the primary destinations and More links; choosing one closes the menu.", kind: "Menu" },
  { name: "Mode switch confirmation", where: "Header → Mode", behavior: "Browser confirmation before switching Replay, Live data, or Paper. Cancel keeps the current mode; switching refreshes mode-dependent data and clears open quote review/order inputs.", kind: "Browser confirmation" },
  { name: "Wallet connection / network prompt", where: "Header → Connect wallet or Switch to Arc", behavior: "Invokes the configured wallet connector. The wallet extension or wallet app asks the user to connect, switch network, or sign when a flow requires it.", kind: "Wallet prompt" },
  { name: "Unsaved Research guard", where: "Leave Research or open History with unsaved thesis edits", behavior: "Browser confirmation asks before discarding edits. Cancel keeps the user on Research; confirm allows navigation.", kind: "Browser confirmation" },
  { name: "Gemini order-cancel confirmation", where: "Native orders → Cancel", behavior: "Browser confirmation warns that a fill may occur before Gemini processes cancellation.", kind: "Browser confirmation" },
  { name: "Gemini disconnect confirmation", where: "Settings → Connections → Disconnect", behavior: "Browser confirmation explains that disconnecting revokes this app's token and does not cancel open Gemini orders.", kind: "Browser confirmation" },
  { name: "Watchlist deletion confirmation", where: "A watchlist's detail page → Delete", behavior: "Browser confirmation before deleting list metadata.", kind: "Browser confirmation" },
  { name: "Account-data closure confirmation", where: "Settings → Privacy and closure", behavior: "Browser confirmation before closing account data; it warns that onchain claims remain accessible from the wallet.", kind: "Browser confirmation" },
  { name: "Journal reflection alert", where: "Decision review → Write reflection", behavior: "Browser alert says the reflection was saved locally for this session.", kind: "Browser alert" },
  { name: "Ledger export alert", where: "Reports → Generate ledger", behavior: "Browser alert reports the export job identifier when the request succeeds.", kind: "Browser alert" },
  { name: "Deposit tracking alert", where: "Deposit → I sent funds", behavior: "Browser alert says tracking started and explicitly says this does not credit a balance.", kind: "Browser alert" },
  { name: "Withdrawal alerts", where: "Withdraw → Send", behavior: "Browser alert asks the user to review an invalid recipient address, or explains to use the wallet to send and that Thesis does not custody keys.", kind: "Browser alert" },
  { name: "Exit failure alert", where: "Position → Exit", behavior: "Browser alert shows the exit error or says no exit liquidity is available.", kind: "Browser alert" },
  { name: "Voice and proposed-view panel", where: "Topic Research and thesis Research/Build/Compare/Review", behavior: "In-page assistant panel for typed or spoken questions, transcript editing, clarification, and proposed view or payoff explanation. It is not a modal and cannot authorize a trade.", kind: "Inline panel" },
  { name: "Confirm-view summary", where: "Thesis Research → Review confirmation", behavior: "Inline summary with Confirm and Cancel. Confirm saves a version and moves to Build; Cancel leaves the draft unchanged.", kind: "Inline panel" },
  { name: "Gemini terms and order review", where: "Gemini event detail, only when order capability is available", behavior: "Inline terms acceptance and exact limit-order review cards. They are gated until account permissions and sandbox capability qualify.", kind: "Inline panel" },
  { name: "Quote review and acceptance", where: "Quote details after Review requests a quote", behavior: "Inline exact-terms, payout, status, and accept controls. Paper acceptance is explicit; live acceptance requires a qualified offer and wallet authorization.", kind: "Inline panel" },
];

const KIND_STYLES: Record<Surface["kind"], string> = {
  Menu: "bg-[#EEF1F4] text-ink",
  "Inline panel": "bg-[#E9EEFF] text-action",
  "Browser confirmation": "bg-[#FFF2D8] text-[#765300]",
  "Browser alert": "bg-[#FCE9E7] text-bad",
  "Wallet prompt": "bg-[#E6F5ED] text-[#176B43]",
};

export default function AppGuidePage() {
  const [query, setQuery] = useState("");
  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return { groups: PAGE_GROUPS, surfaces: SURFACES };
    return {
      groups: PAGE_GROUPS.map((group) => ({
        ...group,
        pages: group.pages.filter((page) => `${page.path} ${page.name} ${page.description} ${page.via || ""}`.toLowerCase().includes(normalized)),
      })).filter((group) => group.pages.length > 0),
      surfaces: SURFACES.filter((surface) => `${surface.name} ${surface.where} ${surface.behavior} ${surface.kind}`.toLowerCase().includes(normalized)),
    };
  }, [query]);

  const routeCount = PAGE_GROUPS.reduce((total, group) => total + group.pages.length, 0);

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-action">Thesis · App map</p>
        <h1 className="font-serif text-4xl">Every page, menu, and popup</h1>
        <p className="max-w-3xl text-sm leading-6 text-muted">A route-by-route guide to the current website, including where each screen opens and what the shared overlays do. Dynamic routes use bracketed values such as <code>[id]</code> or <code>[slug]</code>.</p>
        <p className="text-xs text-muted">{routeCount} page routes · {SURFACES.length} shared menus, panels, or popup behaviors</p>
      </header>

      <Card className="space-y-3">
        <h2 className="font-serif text-xl">How to move around</h2>
        <p className="text-sm leading-6 text-muted">The header links to Explore, My Theses, and Portfolio. The More menu contains Gemini markets, Alerts, Journal, Activity, Reports, Help, Settings, and App guide. On small screens, Menu expands those destinations. The Mode selector switches Replay, Live data, or Paper after confirmation. Connect wallet opens the configured wallet flow.</p>
        <Field label="Search pages and popups">
          <input className={inputCls()} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Try “History”, “Gemini”, “withdraw”, or “confirm”…" />
        </Field>
      </Card>

      <section className="space-y-4" aria-label="Page inventory">
        <div>
          <h2 className="font-serif text-2xl">Pages</h2>
          <p className="mt-1 text-sm text-muted">A dynamic page template needs a real ID, slug, token, ticker, or handle from the relevant flow.</p>
        </div>
        {visible.groups.length ? visible.groups.map((group) => (
          <section key={group.title} className="space-y-3">
            <div>
              <h3 className="font-serif text-xl">{group.title}</h3>
              <p className="text-sm text-muted">{group.intro}</p>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {group.pages.map((page) => (
                <article key={page.path} className="rounded-card border border-line bg-surface p-4 shadow-sm">
                  <code className="break-all text-xs text-action">{page.path}</code>
                  <h4 className="mt-2 font-semibold">{page.name}</h4>
                  <p className="mt-1 text-sm leading-5 text-muted">{page.description}</p>
                  {page.via ? <p className="mt-2 text-xs text-muted">Open from: {page.href ? <Link className="text-action underline" href={page.href}>{page.via}</Link> : page.via}</p> : page.href ? <Link className="mt-2 inline-block text-xs text-action underline" href={page.href}>Open page</Link> : null}
                </article>
              ))}
            </div>
          </section>
        )) : <Card><p className="text-sm text-muted">No pages match that search.</p></Card>}
      </section>

      <section className="space-y-4" aria-label="Menus, panels, and popups">
        <div>
          <h2 className="font-serif text-2xl">Menus, panels, and popups</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted">The app uses inline cards for most reviews. Confirmations and alerts listed below are browser-native dialogs; their exact appearance depends on your browser. There is no separate site-built modal dialog layer.</p>
        </div>
        {visible.surfaces.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {visible.surfaces.map((surface) => (
              <article key={surface.name} className="rounded-card border border-line bg-surface p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold">{surface.name}</h3>
                  <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${KIND_STYLES[surface.kind]}`}>{surface.kind}</span>
                </div>
                <p className="mt-2 text-xs font-medium text-muted">{surface.where}</p>
                <p className="mt-1 text-sm leading-5 text-muted">{surface.behavior}</p>
              </article>
            ))}
          </div>
        ) : <Card><p className="text-sm text-muted">No menus or popups match that search.</p></Card>}
      </section>

      <Card className="border-[#D5DDF4] bg-[#F6F8FF]">
        <h2 className="font-serif text-xl">Availability notes</h2>
        <p className="mt-2 text-sm leading-6 text-muted">Some routes are supporting or operator pages rather than part of the main MVP journey. Gemini native orders and Arc testnet execution remain gated until qualified. Paper actions are labeled Paper. Market history, evidence, balances, and other provider-backed content can be empty or unavailable when the provider does not supply it.</p>
      </Card>
    </div>
  );
}
