"use client";

import type { MarketFamily, ThesisRevision } from "@/lib/domain/types";
import { formatThreshold } from "@/lib/payoffs/compile";
import { Button, Card } from "@/components/ui";

export function thesisViewLabel(thesis: ThesisRevision, family?: MarketFamily | null) {
  const unit = family?.predicates[0]?.unit || "USD";
  if (thesis.template === "binary") {
    const proposition = family?.contracts[0]?.label || "selected contract";
    return thesis.direction ? `${thesis.direction.toUpperCase()} · ${proposition}` : `Choose YES or NO · ${proposition}`;
  }
  if (thesis.template === "directional") {
    if (!thesis.direction) return "Choose a direction and threshold";
    const threshold = thesis.lowerThreshold == null ? "a threshold" : formatThreshold(thesis.lowerThreshold, unit);
    return thesis.direction === "no" ? `Below ${threshold}` : `At or above ${threshold}`;
  }
  const lower = thesis.lowerThreshold == null ? "a lower bound" : formatThreshold(thesis.lowerThreshold, unit);
  const upper = thesis.upperThreshold == null ? "an upper bound" : formatThreshold(thesis.upperThreshold, unit);
  if (thesis.template === "outside") return `Outside ${lower} to ${upper}`;
  return `Between ${lower} and ${upper}`;
}

export function ThesisViewPanel({
  thesis,
  family,
  selectedScenarioId,
  scenarioOutcome,
  scenarioOutcomeLabel = "Gross payout in this scenario",
  onScenarioChange,
  action,
  editAction,
}: {
  thesis: ThesisRevision;
  family?: MarketFamily | null;
  selectedScenarioId?: string;
  scenarioOutcome?: string;
  scenarioOutcomeLabel?: string;
  onScenarioChange?: (scenarioId: string) => void;
  action?: { label: string; href?: string; onClick?: () => void; disabled?: boolean };
  editAction?: { label: string; href?: string; onClick?: () => void; disabled?: boolean };
}) {
  const selectedScenario = family?.scenarios.find((scenario) => scenario.id === selectedScenarioId);
  const confirmed = thesis.status === "confirmed" || thesis.status === "quoted";
  return (
    <Card className="view-summary">
      <div className="view-summary__content space-y-4">
      <div>
        <div className="flex items-center justify-between gap-2"><p className="section-label">Your view</p><span className={`status-pill ${confirmed ? "status-pill--good" : ""}`}>{confirmed ? "Confirmed" : "Draft · not confirmed"}</span></div>
        <h2 className="mt-3 font-serif text-2xl font-bold tracking-tight">{thesisViewLabel(thesis, family)}</h2>
        <p className="mt-2 text-xs text-muted">Revision {thesis.revision}</p>
      </div>
      {thesis.rationale ? <p className="border-t border-line pt-3 text-sm text-muted">{thesis.rationale}</p> : null}
      {family && onScenarioChange ? (
        <div className="border-t border-line pt-3">
          <h3 className="text-sm font-medium">What if I’m wrong?</h3>
          <p className="mt-1 text-xs text-muted">Choose a settlement scenario to inspect this construction.</p>
          <div className="mt-2 grid gap-2">
            {family.scenarios.map((scenario) => (
              <button
                key={scenario.id}
                type="button"
                aria-pressed={scenario.id === selectedScenarioId}
                onClick={() => onScenarioChange(scenario.id)}
                className={`scenario-button text-xs ${scenario.id === selectedScenarioId ? "font-semibold text-action" : "text-muted hover:text-ink"}`}
              >
                {scenario.label}
              </button>
            ))}
          </div>
          {selectedScenario ? (
            <p className="mt-3 rounded-lg bg-[#F4F2ED] p-3 text-sm">
              <span className="block text-xs text-muted">{scenarioOutcomeLabel}</span>
              <span className="font-semibold">{scenarioOutcome ?? "Select a construction to see the payout."}</span>
            </p>
          ) : null}
        </div>
      ) : null}
      <div className="border-t border-line pt-3">
        {action ? (
          action.href ? <Button href={action.href} disabled={action.disabled}>{action.label}</Button> : <Button onClick={action.onClick} disabled={action.disabled}>{action.label}</Button>
        ) : <Button href={`/theses/${thesis.id}`} kind="ghost">Edit view</Button>}
        {editAction ? <div className="mt-2">{editAction.href ? <Button href={editAction.href} kind="ghost" disabled={editAction.disabled}>{editAction.label}</Button> : <Button onClick={editAction.onClick} kind="ghost" disabled={editAction.disabled}>{editAction.label}</Button>}</div> : null}
        <p className="mt-2 text-xs text-muted">Changing your view never changes a position you already hold.</p>
      </div>
      </div>
    </Card>
  );
}
