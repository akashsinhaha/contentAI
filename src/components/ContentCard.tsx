import type { ContentItem } from "@prisma/client";
import { submitContentForm, updateDraftForm, deleteDraftForm } from "@/lib/actions";

const EDITABLE = ["draft", "rejected", "failed"];

/** Formats a date for <input type="datetime-local"> in the server's local time. */
function toLocalInputValue(date: Date | null): string {
  if (!date) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function ContentCard({ item }: { item: ContentItem }) {
  const editable = EDITABLE.includes(item.status);
  return (
    <div className="card space-y-2 text-sm">
      {item.mediaUrl && item.kind !== "video" && /* eslint-disable-next-line @next/next/no-img-element */ <img src={item.mediaUrl} alt={item.theme ?? "content"} className="h-40 w-full rounded-lg object-cover" />}
      <div className="flex items-center gap-2"><span className="badge">{item.kind}</span><span className="badge">{item.status}</span></div>
      {item.theme && <div className="font-medium">{item.theme}</div>}
      {item.caption && <p className="whitespace-pre-wrap">{item.caption}</p>}
      {item.hashtags && <p className="text-stone-500">{item.hashtags}</p>}
      {item.script && <pre className="whitespace-pre-wrap rounded bg-stone-50 p-2 text-xs">{item.script}</pre>}
      {item.scheduledFor && <p className="text-xs text-stone-500">Planned: {item.scheduledFor.toLocaleString()}</p>}
      {item.status === "failed" && <p className="text-xs text-red-700">Publishing failed. Edit and submit again.</p>}
      {editable && item.kind === "post" && (
        <>
          <details className="rounded-lg border border-stone-200 p-2">
            <summary className="cursor-pointer text-xs font-medium text-stone-600">Edit or reschedule</summary>
            <form action={updateDraftForm} className="mt-2 space-y-2">
              <input type="hidden" name="id" value={item.id} />
              <textarea name="caption" className="input" rows={3} defaultValue={item.caption} />
              <input name="hashtags" className="input" defaultValue={item.hashtags} />
              <input type="datetime-local" name="scheduledFor" className="input" defaultValue={toLocalInputValue(item.scheduledFor)} />
              <button className="btn-ghost">Save changes</button>
            </form>
          </details>
          <form action={submitContentForm} className="flex gap-2">
            <input type="hidden" name="id" value={item.id} />
            <input type="datetime-local" name="scheduledFor" className="input" defaultValue={toLocalInputValue(item.scheduledFor)} />
            <button className="btn whitespace-nowrap">Submit for approval</button>
          </form>
        </>
      )}
      {editable && (
        <form action={deleteDraftForm}>
          <input type="hidden" name="id" value={item.id} />
          <button className="btn-danger px-2 py-1 text-xs">Delete draft</button>
        </form>
      )}
    </div>
  );
}
