"use client";
import { useEffect } from "react";

export default function Toast({ msg, onHide }: { msg: string; onHide: () => void }) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { const t = setTimeout(onHide, 3500); return () => clearTimeout(t); }, [msg]);
  return (
    <div role="status" className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+5rem)] z-[60] mx-auto w-fit max-w-[90vw] rounded-xl bg-ink px-4 py-2 text-sm text-bg shadow-lg lg:bottom-6">
      {msg}
    </div>
  );
}
