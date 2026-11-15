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

const TABS: { id: Bucket; label: string }[] = [
  { id: "active", label: "Open / partial" },
  { id: "filled", label: "Completed" },
  { id: "cancelled", label: "Canceled" },
  { id: "rejected", label: "Rejected" },
];

export default function Orders() {
  const [connection, setConnection] = useState<ConnectionStatus | null>(null);
  const [bucket, setBucket] = useState<Bucket>("active");
  const [orders, setOrders] = useState<GeminiOrder[]>([]);
  const [loadingConnection, setLoadingConnection] = useState(true);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [cancelling, setCancelling] = useState<string | null>(null);

  useEffect(() => {
    api<ConnectionStatus>("/api/gemini/oauth")
      .then(setConnection)
      .catch((err) => setError(err instanceof Error ? err.message : "Gemini connection status could not be loaded"))
      .finally(() => setLoadingConnection(false));
  }, []);

  useEffect(() => {
    if (!connection?.connection?.canReadOrders || bucket === "rejected") {
      setOrders([]);
      return;
    }
    let current = true;
    setLoadingOrders(true);
    setError("");
    api<{ orders?: GeminiOrder[] }>(`/api/gemini/orders?bucket=${bucket}`)
      .then((response) => { if (current) setOrders(response.orders || []); })
      .catch((err) => { if (current) { setOrders([]); setError(err instanceof Error ? err.message : "Gemini orders could not be loaded"); } })
      .finally(() => { if (current) setLoadingOrders(false); });
    return () => { current = false; };
  }, [connection, bucket]);

  async function cancelOrder(orderId: string) {
    if (!window.confirm("Send Gemini a cancel request for this order? A fill can occur before the request is processed.")) return;
    setCancelling(orderId);
    setError("");
    setNotice("");
    try {
      const response = await api<{ message: string }>("/api/gemini/orders", {
        method: "POST",
        body: JSON.stringify({ action: "cancel", orderId }),
      });
      setNotice(response.message);
      const refreshed = await api<{ orders?: GeminiOrder[] }>("/api/gemini/orders?bucket=active");
      setOrders(refreshed.orders || []);
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
      const response = await api<{ orders?: GeminiOrder[] }>(`/api/gemini/orders?bucket=${bucket}`);
      setOrders(response.orders || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gemini orders could not be refreshed");
    } finally {
      setLoadingOrders(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-xs uppercase tracking-wide text-muted">Gemini prediction markets</p>
      <h1 className="font-serif text-3xl">Native orders</h1>
      <p className="text-sm text-muted">This page reads your Gemini account directly. Arc balances and paper positions are separate.</p>
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
                    {canCancel ? <Button kind="danger" disabled={cancelling === id} onClick={() => cancelOrder(id)}>{cancelling === id ? "Canceling…" : "Cancel order"}</Button> : null}
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
    </div>
  );
}
