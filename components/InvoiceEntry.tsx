"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import InvoiceBuilder from "./InvoiceBuilder";
import InvoiceGrid from "./InvoiceGrid";
import { PageLoading } from "./Loading";

/** Desktop gets the keyboard-first grid, phones and small tablets keep the touch form. Editing an order needs the desktop screen. */
export default function InvoiceEntry({ customerId, editId }: { customerId?: string; editId?: string }) {
  const [wide, setWide] = useState<boolean | null>(null);
  useEffect(() => {
    const m = window.matchMedia("(min-width: 1024px)");
    const on = () => setWide(m.matches);
    on();
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  if (wide === null) return <PageLoading />;
  if (wide) return <InvoiceGrid customerId={customerId} editId={editId} />;
  if (editId) {
    return (
      <div className="space-y-3 p-4">
        <h1 className="text-lg font-bold">Edit order</h1>
        <p className="text-sm text-muted">Editing an order needs a larger screen. Open this page on a computer or a tablet held sideways.</p>
        <Link href={"/sales/" + editId} className="btn">Back to the invoice</Link>
      </div>
    );
  }
  return <InvoiceBuilder customerId={customerId} />;
}
