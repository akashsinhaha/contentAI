import { db } from "@/lib/db";
import { generateContentForm } from "@/lib/actions";
import ContentCard from "@/components/ContentCard";

export default async function ContentPage() {
  const items = await db.contentItem.findMany({ orderBy: { createdAt: "desc" }, take: 60 });
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Content</h1>
      <form action={generateContentForm} className="card grid gap-2 md:grid-cols-4">
        <input name="theme" className="input md:col-span-2" placeholder="What is it about? e.g. new chocolate truffle cake" />
        <select name="kind" className="input">
          <option value="post">Post + caption + image</option>
          <option value="image">Product image only</option>
          <option value="video">UGC-style video</option>
        </select>
        <button className="btn">Generate draft</button>
      </form>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => <ContentCard key={item.id} item={item} />)}
        {items.length === 0 && <p className="text-sm text-stone-500">No content yet. Generate your first draft above.</p>}
      </div>
    </div>
  );
}
