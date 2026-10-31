/* Shared loading indicators: spinner, inline "Loading…" row, thin progress bar, list skeleton and a full page placeholder. */

export function Spinner({ className = "" }: { className?: string }) {
  return <span aria-hidden className={"spinner " + className} />;
}

/** Spinner with a label, for a panel or section that is waiting for data. */
export function Loading({ label = "Loading…", className = "" }: { label?: string; className?: string }) {
  return (
    <div role="status" aria-live="polite" className={"flex items-center justify-center gap-2 py-6 text-sm text-muted " + className}>
      <Spinner />{label}
    </div>
  );
}

/** Thin animated line. Always takes its 2px of space so the layout does not jump when it turns on. */
export function LoadingBar({ active, className = "" }: { active: boolean; className?: string }) {
  return <div className={"loadbar " + (active ? "loadbar-on " : "") + className} role={active ? "progressbar" : undefined} aria-label={active ? "Loading" : undefined} aria-hidden={active ? undefined : true} />;
}

/** Grey placeholder cards shown while the first page of a list loads. */
export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <ul className="space-y-2 p-3 lg:px-5" role="status" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="card animate-pulse p-3">
          <div className="h-4 w-2/3 rounded bg-line" />
          <div className="mt-2 h-3 w-1/2 rounded bg-line" />
          <div className="mt-2 h-3 w-1/3 rounded bg-line" />
        </li>
      ))}
    </ul>
  );
}

/** Whole page placeholder: used by the route loading.tsx files and by detail screens waiting for their data. */
export function PageLoading() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading">
      <div className="px-3 pt-4 lg:px-5"><div className="h-6 w-40 animate-pulse rounded bg-line" /></div>
      <ListSkeleton rows={5} />
      <Loading />
    </div>
  );
}
