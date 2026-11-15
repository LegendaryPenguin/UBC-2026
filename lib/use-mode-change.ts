"use client";

import { useEffect, useRef } from "react";
import { MODE_CHANGE_EVENT } from "@/lib/client";

export function useModeChange(handler: () => void) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const onModeChange = () => handlerRef.current();
    window.addEventListener(MODE_CHANGE_EVENT, onModeChange);
    return () => window.removeEventListener(MODE_CHANGE_EVENT, onModeChange);
  }, []);
}
