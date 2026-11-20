"use client";

import { useEffect, useId, useRef, useState, type ComponentProps } from "react";
import { AppDialog } from "@/components/AppDialog";
import { Icon } from "@/components/thesis";
import { VoicePanel } from "@/components/VoicePanel";

export function WorkspaceAssistant({ openRequest, ...props }: ComponentProps<typeof VoicePanel> & { openRequest?: number }) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const sheetId = useId();
  const dock = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (props.prefillQuestion) setOpen(true);
  }, [props.prefillQuestion]);
  useEffect(() => { if (openRequest) setOpen(true); }, [openRequest]);

  function close() {
    setOpen(false);
    window.requestAnimationFrame(() => dock.current?.focus({ preventScroll: true }));
  }

  return (
    <div className="workspace-assistant">
      {!open ? <button ref={dock} className="workspace-assistant-dock" type="button" aria-haspopup="dialog" aria-expanded={false} aria-controls={sheetId} onClick={() => setOpen(true)}>
        <Icon name="assistant" size={20} /><span>Ask Thesis</span><Icon name="chevron-up" size={19} />
      </button> : null}
      <AppDialog open={open} keepMounted titleId={titleId} onClose={close} className="workspace-assistant-sheet" backdropClassName="workspace-assistant-surface">
        <div id={sheetId}>
          <div className="workspace-assistant-sheet__header"><h2 id={titleId}><Icon name="assistant" size={19} /> Ask Thesis</h2><button className="th-button th-button--ghost th-button--icon" type="button" aria-label="Close workspace assistant" onClick={close}><Icon name="close" size={19} /></button></div>
          <VoicePanel {...props} compact visible={open} />
        </div>
      </AppDialog>
    </div>
  );
}
