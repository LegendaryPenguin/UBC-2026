"use client";

import { AppDialog } from "@/components/AppDialog";

type AppDrawerProps = {
  open: boolean;
  titleId: string;
  children: React.ReactNode;
  onClose: () => void;
  side?: "right" | "left";
  labelledBy?: string;
  describedBy?: string;
};

export function AppDrawer({
  open,
  titleId,
  children,
  onClose,
  side = "right",
  labelledBy,
  describedBy,
}: AppDrawerProps) {
  return (
    <AppDialog
      open={open}
      titleId={titleId}
      labelledBy={labelledBy}
      describedBy={describedBy}
      onClose={onClose}
      className={`app-drawer app-drawer--${side}`}
    >
      {children}
    </AppDialog>
  );
}
