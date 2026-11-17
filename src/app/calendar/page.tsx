import { db } from "@/lib/db";
import { planMonthForm } from "@/lib/actions";
import ContentCard from "@/components/ContentCard";

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { month } = await searchParams;
  const current = month ?? new Date().toISOString().slice(0, 7);
  const [year, monthNumber] = current.split("-").map(Number);
  const start = new Date(year, monthNumber - 1, 1);
  const end = new Date(year, monthNumber, 1);
  const items = await db.contentItem.findMany({ where: { scheduledFor: { gte: start, lt: end } }, orderBy: { scheduledFor: "asc" } });
  const byDay = new Map<number, typeof items>();
  for (const item of items) {
    const day = item.scheduledFor!.getDate();
    byDay.set(day, [...(byDay.get(day) ?? []), item]);
  }
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Content calendar</h1>
      <form action={planMonthForm} className="card grid gap-2 md:grid-cols-4">
        <input type="month" name="month" defaultValue={current} className="input" />
        <input name="focus" className="input md:col-span-2" placeholder="Focus (optional), e.g. Diwali gifting boxes" />
        <button className="btn">Generate month plan</button>
      </form>
      <form className="flex gap-2"><input type="month" name="month" defaultValue={current} className="input w-48" /><button className="btn-ghost">View month</button></form>
      <p className="text-sm text-stone-600">Posts are drafts. Submit each for approval; approved future posts publish automatically at the planned time.</p>
      <div className="space-y-4">
        {[...byDay.entries()].map(([day, dayItems]) => (
          <div key={day}>
            <h2 className="mb-1 text-sm font-semibold text-stone-600">{new Date(year, monthNumber - 1, day).toDateString()}</h2>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{dayItems.map((item) => <ContentCard key={item.id} item={item} />)}</div>
          </div>
        ))}
        {items.length === 0 && <p className="text-sm text-stone-500">No posts planned for this month.</p>}
      </div>
    </div>
  );
}
