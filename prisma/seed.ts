import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  await db.business.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default", name: "Sweet Crumbs Bakery", type: "Home bakery", website: "", phone: "+910000000000" },
  });
  await db.brandProfile.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      voice: "Warm, homely and personal",
      tone: "Cheerful and helpful, never pushy",
      dos: "Mention freshness and that everything is baked to order",
      donts: "Do not promise delivery times or discounts without owner approval",
      hashtags: "#homebaker #freshlybaked",
      faqs: JSON.stringify([{ q: "Do you deliver?", a: "Yes, locally. The owner confirms the slot." }]),
    },
  });
  if ((await db.product.count()) === 0) {
    await db.product.createMany({
      data: [
        { name: "Chocolate truffle cake", description: "Rich, eggless option available", price: 900 },
        { name: "Cupcake box (6)", description: "Assorted flavours", price: 450 },
        { name: "Tea-time cookies", description: "Butter cookies, 250g", price: 250 },
      ],
    });
  }
  console.log("Seeded demo business.");
}

main().finally(() => db.$disconnect());
