"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Banner, Button, Card, Empty } from "@/components/ui";
import { formatTime } from "@/lib/format";

type Bucket = "active" | "filled" | "cancelled" | "rejected";
type ConnectionStatus = {
  configured: boolean;
  missing: string[];
  connection: null | { canReadOrders: boolean; canTrade: boolean; scopes: string[] };
};
type GeminiOrder = {
  orderId: string | number;
  status: string;
  symbol: string;
  side: string;
  outcome: string;
  orderType: string;
  quantity: string;
  filledQuantity: string;
  remainingQuantity: string;
  price: string;
  avgExecutionPrice?: string | null;
  createdAt: string;
  updatedAt?: string;
  cancelledAt?: string | null;
  contractMetadata?: { eventName?: string; contractName?: string; expiryDate?: string | null };
};
type GeminiOrderIntent = {
  id: string;
  status: "submitting" | "unknown";
  ticker: string;
  symbol: string;
  side: string;
  outcome: string;
  quantity: string;
  price: string;
  createdAt: string;
  message: string;
};

const TABS: { id: Bucket; label: string }[] = [
  { id: "active", label: "Open / partial" },
  { id: "filled", label: "Completed" },
  { id: "cancelled", label: "Canceled" },
  { id: "rejected", label: "Rejected" },
];

export function PortfolioOrders({ embedded = false }: { embedded?: boolean }) {
  const [connection, setConnection] = useState<ConnectionStatus | null>(null);
  const [bucket, setBucket] = useState<Bucket>("active");
  const [orders, setOrders] = useState<GeminiOrder[]>([]);
  const [unresolvedIntents, setUnresolvedIntents] = useState<GeminiOrderIntent[]>([]);
  const [loadingConnection, setLoadingConnection] = useState(true);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [cancelOrderId, setCancelOrderId] = useState<string | null>(null);

  useEffect(() => {
    api<ConnectionStatus>("/api/gemini/oauth")
      .then(setConnection)
      .catch((err) => setError(err instanceof Error ? err.message : "Gemini connection status could not be loaded"))
      .finally(() => setLoadingConnection(false));
  }, []);

  useEffect(() => {
    if (!connection?.connection?.canReadOrders || bucket === "rejected") {
      setOrders([]);
      setUnresolvedIntents([]);
      return;
    }
    let current = true;
    setLoadingOrders(true);
    setError("");
    api<{ orders?: GeminiOrder[]; unresolvedIntents?: GeminiOrderIntent[] }>(`/api/gemini/orders?bucket=${bucket}`)
      .then((response) => {
        if (current) {
          setOrders(response.orders || []);
          setUnresolvedIntents(response.unresolvedIntents || []);
        }
      })
      .catch((err) => { if (current) { setOrders([]); setUnresolvedIntents([]); setError(err instanceof Error ? err.message : "Gemini orders could not be loaded"); } })
      .finally(() => { if (current) setLoadingOrders(false); });
    return () => { current = false; };
  }, [connection, bucket]);

  async function cancelOrder() {
    if (!cancelOrderId) return;
    const orderId = cancelOrderId;
    setCancelling(orderId);
    setError("");
    setNotice("");
    try {
      const response = await api<{ message: string }>("/api/gemini/orders", {
        method: "POST",
        body: JSON.stringify({ action: "cancel", orderId }),
      });
      setNotice(response.message);
      const refreshed = await api<{ orders?: GeminiOrder[]; unresolvedIntents?: GeminiOrderIntent[] }>("/api/gemini/orders?bucket=active");
      setOrders(refreshed.orders || []);
      setUnresolvedIntents(refreshed.unresolvedIntents || []);
      setCancelOrderId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gemini could not cancel this order");
    } finally {
      setCancelling(null);
    }
  }

  async function refresh() {
    setNotice("");
    setError("");
    if (!connection?.connection?.canReadOrders || bucket === "rejected") return;
    setLoadingOrders(true);
    try {
      const response = await api<{ orders?: GeminiOrder[]; unresolvedIntents?: GeminiOrderIntent[] }>(`/api/gemini/orders?bucket=${bucket}`);
      setOrders(response.orders || []);
      setUnresolvedIntents(response.unresolvedIntents || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gemini orders could not be refreshed");
    } finally {
      setLoadingOrders(false);
    }
  }

  return (
    <div className="space-y-4">
      {!embedded ? <p className="text-xs uppercase tracking-wide text-muted">Gemini prediction markets</p> : null}
      {embedded ? <h2 className="font-serif text-2xl">Gemini orders</h2> : <h1 className="font-serif text-3xl">Native orders</h1>}
      <p className="text-sm text-muted">This view reads your Gemini account directly. Arc balances and paper positions are separate.</p>
      {error ? <p role="alert" className="rounded-lg border border-bad/30 bg-white p-3 text-sm text-bad">{error}</p> : null}
      {notice ? <Banner title="Order update">{notice}</Banner> : null}
      {loadingConnection ? <p className="text-sm text-muted">Checking Gemini access…</p> : null}

      {!loadingConnection && !connection?.connection ? (
        <Banner title={connection?.configured ? "Connect a Gemini account" : "Gemini linking is not configured"}>
          {connection?.configured
            ? <>Connect from <a className="underline" href="/settings/connections">Connection settings</a> to see your account orders.</>
            : <>The OAuth app needs {connection?.missing.join(", ") || "configuration"}. Public Gemini market browsing remains separate from account access.</>}
        </Banner>
      ) : null}
      {connection?.connection && !connection.connection.canReadOrders ? (
        <Banner title="Order access was not granted">Add the <code>orders:read</code> permission in <a className="underline" href="/settings/connections">Connection settings</a>. This page will not show simulated orders.</Banner>
      ) : null}

      {connection?.connection?.canReadOrders ? (
        <>
          {!connection.connection.canTrade ? <Banner title="Read-only connection">Order cancellation and trading require separate <code>orders:create</code> permission.</Banner> : null}
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter orders by status">
            {TABS.map((tab) => (
              <Button key={tab.id} kind={bucket === tab.id ? "primary" : "ghost"} onClick={() => setBucket(tab.id)}>{tab.label}</Button>
            ))}
            <Button kind="ghost" onClick={refresh} disabled={loadingOrders}>{loadingOrders ? "Refreshing…" : "Refresh"}</Button>
          </div>

          {bucket === "rejected" ? (
            <Empty title="Rejected-order history is not available here">
              Gemini's REST history endpoint exposes filled and canceled orders. Rejected order events require a live authenticated order stream, which this app has not yet qualified or persisted. No rejected orders are fabricated.
            </Empty>
          ) : null}
          {bucket === "active" ? unresolvedIntents.map((intent) => (
            <Card key={intent.id}>
              <p className="text-xs uppercase tracking-wide text-muted">{intent.status === "unknown" ? "Submission status unknown" : "Submission in progress"} · {intent.ticker}</p>
              <h2 className="mt-1 font-serif text-xl">{intent.side.toUpperCase()} {intent.outcome.toUpperCase()} · {intent.quantity} at {intent.price}</h2>
              <p className="mt-1 break-all text-xs text-muted">{intent.symbol} · {formatTime(intent.createdAt)}</p>
              <p className="mt-2 text-sm">{intent.message}</p>
              <p className="mt-2 text-xs text-muted">Do not resubmit this intent. Check Gemini's active, filled, or canceled order history before taking another action.</p>
            </Card>
          )) : null}
          {bucket !== "rejected" && !loadingOrders && orders.length === 0 ? <Empty title="No orders in this view">Gemini returned no orders for this account and status.</Empty> : null}

          <div className="grid gap-3">
            {orders.map((order) => {
              const id = String(order.orderId);
              const canCancel = bucket === "active" && connection.connection?.canTrade && Number(order.remainingQuantity) > 0 && ["open", "partially_filled", "partial"].includes(order.status.toLowerCase());
              return (
                <Card key={id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs uppercase tracking-wide text-muted">{order.status.replaceAll("_", " ")} · {order.orderType} · #{id}</p>
                      <h2 className="mt-1 font-serif text-xl">{order.contractMetadata?.eventName || order.symbol}</h2>
                      <p className="text-sm text-muted">{order.contractMetadata?.contractName || order.symbol}</p>
                    </div>
                    {canCancel ? <Button kind="danger" disabled={cancelling === id} onClick={() => setCancelOrderId(id)}>{cancelling === id ? "Canceling…" : "Cancel order"}</Button> : null}
                  </div>
                  <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
                    <div><dt className="text-xs text-muted">Side / outcome</dt><dd>{order.side} · {order.outcome}</dd></div>
                    <div><dt className="text-xs text-muted">Limit / average execution</dt><dd>{order.price} / {order.avgExecutionPrice || "—"}</dd></div>
                    <div><dt className="text-xs text-muted">Requested / filled / remaining</dt><dd>{order.quantity} / {order.filledQuantity} / {order.remainingQuantity}</dd></div>
                    <div><dt className="text-xs text-muted">Created</dt><dd>{formatTime(order.createdAt)}</dd></div>
                    <div><dt className="text-xs text-muted">Updated</dt><dd>{formatTime(order.updatedAt || order.cancelledAt || order.createdAt)}</dd></div>
                    <div><dt className="text-xs text-muted">Market expiry</dt><dd>{formatTime(order.contractMetadata?.expiryDate)}</dd></div>
                  </dl>
                  <p className="mt-3 break-all text-xs text-muted">{order.symbol}</p>
                </Card>
              );
            })}
          </div>
        </>
      ) : null}
      {cancelOrderId ? (() => {
        const order = orders.find((item) => String(item.orderId) === cancelOrderId);
        if (!order) return null;
        return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && cancelling !== cancelOrderId) setCancelOrderId(null); }}>
          <section className="dialog-panel" role="dialog" aria-modal="true" aria-labelledby="cancel-order-title">
            <p className="source-pill">Gemini order · {cancelOrderId}</p>
            <h2 id="cancel-order-title" className="mt-3 font-serif text-2xl font-bold">Request order cancellation?</h2>
            <p className="mt-3 text-sm">{order.contractMetadata?.contractName || order.symbol} · {order.side} {order.outcome} · {order.remainingQuantity} remaining</p>
            <p className="mt-3 rounded-lg bg-[#FFF8E7] p-3 text-sm text-muted">This sends Gemini a cancellation request. A fill may happen before Gemini processes it, so the order can become partially filled or complete. Existing filled quantities remain in your Portfolio.</p>
            {error ? <p role="alert" className="mt-3 text-sm text-bad">{error}</p> : null}
            <div className="mt-5 flex flex-wrap justify-end gap-2"><button type="button" className="app-button min-h-11 rounded-lg border border-line px-4 text-sm font-semibold" onClick={() => setCancelOrderId(null)} disabled={cancelling === cancelOrderId}>Keep order</button><button type="button" className="app-button min-h-11 rounded-lg bg-bad px-5 text-sm font-semibold text-white disabled:opacity-50" onClick={() => void cancelOrder()} disabled={cancelling === cancelOrderId}>{cancelling === cancelOrderId ? "Sending request…" : "Send cancel request"}</button></div>
          </section>
        </div>;
      })() : null}
    </div>
  );
}
