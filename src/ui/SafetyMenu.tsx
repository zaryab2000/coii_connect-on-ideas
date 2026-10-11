import { useId, useState } from "react";

import { useActions, useApp } from "@/app/context";
import { REPORT_LABELS, REPORT_REASONS } from "@/data/report";
import type { ReportReason } from "@/data/report";
import type { Person } from "@/data/types";
import { firstName } from "@/ui/meet";

type Step = "closed" | "open" | "reported";

/**
 * Backend mode, once you've joined: report someone to the moderators (three reports hide a
 * bean) or block them (no waves, chais or addas between you, and they leave your map).
 */
export function SafetyMenu({ person }: { readonly person: Person }) {
  const actions = useActions();
  const shown = useApp((s) => s.mode === "backend" && s.you !== null);
  const [step, setStep] = useState<Step>("closed");
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [busy, setBusy] = useState(false);
  const headingId = useId();
  if (!shown) return null;
  const name = firstName(person.name);

  if (step === "closed") {
    return (
      <button type="button" className="btn btn--quiet safety-open" onClick={() => setStep("open")}>
        Report or block {name}
      </button>
    );
  }
  if (step === "reported") {
    return (
      <p className="confirm confirm__text" role="status">
        Thanks. The moderators will take a look. {name} won't know it was you.
      </p>
    );
  }
  const send = async (): Promise<void> => {
    if (!reason || busy) return;
    setBusy(true);
    const ok = await actions.report(person.id, reason);
    setBusy(false);
    if (ok) setStep("reported");
  };
  const block = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    const ok = await actions.block(person.id);
    setBusy(false);
    if (!ok) return;
    actions.closePanel();
    actions.pushToast(`Blocked ${name}. You won't see each other on coii.`, "shield", "info");
  };
  return (
    <fieldset className="confirm safety-menu" aria-labelledby={headingId}>
      <legend id={headingId} className="confirm__text">
        What's wrong?
      </legend>
      {REPORT_REASONS.map((r) => (
        <label key={r} className="safety-menu__reason">
          <input
            type="radio"
            name={`${headingId}-reason`}
            checked={reason === r}
            onChange={() => setReason(r)}
          />
          {REPORT_LABELS[r]}
        </label>
      ))}
      <div className="confirm__actions">
        <button
          type="button"
          className="btn btn--danger"
          aria-disabled={!reason || busy || undefined}
          onClick={() => void send()}
        >
          Report
        </button>
        <button type="button" className="btn btn--secondary" onClick={() => void block()}>
          Block {name}
        </button>
        <button type="button" className="btn btn--quiet" onClick={() => setStep("closed")}>
          Cancel
        </button>
      </div>
    </fieldset>
  );
}
