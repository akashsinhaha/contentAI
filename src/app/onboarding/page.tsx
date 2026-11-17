import { db } from "@/lib/db";
import { saveBrandForm, learnBrandForm, addProductForm } from "@/lib/actions";

export default async function BrandPage() {
  const [brand, business, products] = await Promise.all([
    db.brandProfile.findUnique({ where: { id: "default" } }),
    db.business.findUnique({ where: { id: "default" } }),
    db.product.findMany({ orderBy: { createdAt: "desc" } }),
  ]);
  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-xl font-semibold">Brand control</h1>
      <p className="text-sm text-stone-600">You set the rules. Every post, reply and campaign uses this profile, and nothing goes live without your approval.</p>

      <form action={learnBrandForm} className="card space-y-2">
        <h2 className="font-semibold">Learn from my website and past captions</h2>
        <div><label className="label">Website URL</label><input name="websiteUrl" className="input" defaultValue={business?.website ?? ""} placeholder="https://..." /></div>
        <div><label className="label">Sample captions (optional)</label><textarea name="sampleCaptions" className="input" rows={3} /></div>
        <button className="btn">Learn my brand</button>
      </form>

      <form action={saveBrandForm} className="card space-y-2">
        <h2 className="font-semibold">Brand guidelines (editable)</h2>
        {(["voice", "tone", "dos", "donts", "hashtags"] as const).map((field) => (
          <div key={field}>
            <label className="label">{{ voice: "Voice", tone: "Tone", dos: "Always do", donts: "Never do", hashtags: "Default hashtags" }[field]}</label>
            <textarea name={field} className="input" rows={2} defaultValue={brand?.[field] ?? ""} />
          </div>
        ))}
        <button className="btn">Save guidelines</button>
      </form>

      <div className="card space-y-2">
        <h2 className="font-semibold">Products</h2>
        <ul className="text-sm">{products.map((product) => <li key={product.id}>{product.name}{product.price ? ` - ${product.price}` : ""}: {product.description}</li>)}</ul>
        <form action={addProductForm} className="grid gap-2 md:grid-cols-4">
          <input name="name" className="input" placeholder="Name" required />
          <input name="description" className="input" placeholder="Description" />
          <input name="price" type="number" step="any" className="input" placeholder="Price" />
          <button className="btn">Add product</button>
        </form>
      </div>
    </div>
  );
}
