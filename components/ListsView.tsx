"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ListSkeleton } from "./Loading";
import ListPrintModal from "./ListPrintModal";
import { useMe } from "./Me";

type L = { id: string; name: string; visible: boolean; products: number; is_market: boolean };

/** All price lists. Open one to edit its products, or print it on A4. */
export default function ListsView() {
  const { can } = useMe();
  const [lists, setLists] = useState<L[] | null>(null);
  const [error, setError] = useState("");
  const [print, setPrint] = useState<L | null>(null);
  const [saving, setSaving] = useState("");
  async function setVisible(l: L, visible: boolean) {
    setSaving(l.id);
    const r = await fetch("/api/inventory/lists", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: l.id, visible }) });
    const j = await r.json().catch(() => ({}));
    setSaving("");
    if (!r.ok) return setError(j.error || "Could not save");
    setError(""); setLists((ls) => ls && ls.map((x) => (x.id === l.id ? { ...x, visible } : x)));
  }
  useEffect(() => {
    fetch("/api/inventory/lists").then((r) => r.json()).then((j) => (j.error ? setError(j.error) : setLists(j.lists))).catch(() => setError("Could not load the lists"));
  }, []);
  return (
    <div className="p-3 lg:px-5 lg:py-4">
      <h1 className="mb-1 text-lg font-bold">Price lists</h1>
      <p className="mb-3 text-sm text-muted">Open a list to add, edit or delete its products, or print it on A4. Hide a list to remove it from the stock screens, or show it again.</p>
      {error && <p role="alert" className="rounded-lg bg-red-bg p-2 text-sm text-red">{error}</p>}
      {!lists && !error && <ListSkeleton rows={6} />}
      <ul className="grid gap-2 lg:grid-cols-2">
        {lists?.map((l) => (
          <li key={l.id} className={"card flex flex-wrap items-center gap-3 p-3 " + (l.visible ? "" : "opacity-70")}>
            <Link href={"/lists/" + l.id} className="min-w-0 flex-1 active:opacity-70">
              <p className="break-words font-semibold">{l.name}{l.is_market && <span className="pill ml-2 border border-amber bg-amber-bg text-amber">Market list</span>}{!l.visible && <span className="pill ml-2 bg-bg text-muted">Hidden</span>}</p>
              <p className="text-xs text-muted">{l.products.toLocaleString()} products</p>
            </Link>
            {(can("stock.manage") || can("settings.edit")) && <button className="btn min-h-9 px-3" disabled={saving === l.id} onClick={() => setVisible(l, !l.visible)}>{l.visible ? "Hide" : "Show"}</button>}
            <button className="btn min-h-9 px-3" onClick={() => setPrint(l)}>Print A4</button>
            <Link href={"/lists/" + l.id} className="btn btn-primary min-h-9 px-3">Open</Link>
          </li>
        ))}
      </ul>
      {lists && !lists.length && <p className="py-6 text-center text-sm text-muted">No lists yet. They appear after the product import.</p>}
      {print && <ListPrintModal listId={print.id} name={print.name} onClose={() => setPrint(null)} />}
    </div>
  );
}
