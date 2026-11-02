"use client";
import { useEffect, useState } from "react";
import InvoiceBuilder from "./InvoiceBuilder";
import InvoiceGrid from "./InvoiceGrid";
import { PageLoading } from "./Loading";

/** Desktop gets the keyboard-first grid, phones and small tablets keep the touch form. */
export default function InvoiceEntry({ customerId }: { customerId?: string }) {
  const [wide, setWide] = useState<boolean | null>(null);
  useEffect(() => {
    const m = window.matchMedia("(min-width: 1024px)");
    const on = () => setWide(m.matches);
    on();
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  if (wide === null) return <PageLoading />;
  return wide ? <InvoiceGrid customerId={customerId} /> : <InvoiceBuilder customerId={customerId} />;
}
