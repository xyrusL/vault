import { useEffect, useState } from "react";
import { Activity, ChevronLeft, ChevronRight, ShieldAlert } from "lucide-react";
import { PageTitle } from "./DashboardUi";

const pageSize = 10;

export default function ActivityView({ activity, loading }) {
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(activity.length / pageSize));
  const visibleActivity = activity.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  return (
    <section className="panel">
      <PageTitle
        eyebrow="Security history"
        title="Activity log"
        text="Every important vault action and suspicious login attempt appears here."
      />
      {loading ? (
        <p className="py-12 text-center text-sm text-slate-400">
          Loading activity...
        </p>
      ) : (
        <div className="mt-7 divide-y divide-white/[0.06]">
          {visibleActivity.map((item) => {
            const isWarning = item.severity !== "info";

            return (
              <article key={item.id} className="flex gap-3 py-4 sm:gap-4">
                <span
                  className={`grid size-10 shrink-0 place-items-center rounded-xl ${isWarning ? "bg-orange-400/10 text-orange-300" : "bg-cyan-400/10 text-cyan-300"}`}
                >
                  {isWarning ? (
                    <ShieldAlert className="size-5" />
                  ) : (
                    <Activity className="size-5" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap justify-between gap-2">
                    <h3 className="min-w-0 break-words text-sm font-medium">
                      {item.description}
                    </h3>
                    <time className="text-xs text-slate-500">
                      {new Date(`${item.created_at}Z`).toLocaleString()}
                    </time>
                  </div>
                  <p className="mt-1 break-all font-mono text-[11px] text-slate-500">
                    {item.event_type}
                  </p>
                </div>
              </article>
            );
          })}
          {!activity.length && (
            <p className="py-12 text-center text-sm text-slate-400">
              No activity recorded yet.
            </p>
          )}
          {activity.length > pageSize && (
            <div className="flex flex-col gap-3 pt-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-slate-500">
                Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, activity.length)} of {activity.length} events
              </p>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1} className="pagination-button disabled:cursor-not-allowed disabled:opacity-30" aria-label="Previous activity page"><ChevronLeft /></button>
                <span className="min-w-20 text-center text-xs text-slate-400">Page {page} of {pageCount}</span>
                <button type="button" onClick={() => setPage((current) => Math.min(pageCount, current + 1))} disabled={page === pageCount} className="pagination-button disabled:cursor-not-allowed disabled:opacity-30" aria-label="Next activity page"><ChevronRight /></button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
