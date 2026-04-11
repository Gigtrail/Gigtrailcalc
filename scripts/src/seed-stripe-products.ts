import { getUncachableStripeClient } from "./stripeClient";

async function createProducts() {
  try {
    const stripe = await getUncachableStripeClient();
    console.log("Creating Gig Trail subscription products in Stripe...");

    const existingFree = await stripe.products.search({ query: "name:'Gig Trail Free' AND active:'true'" });
    const existingPro = await stripe.products.search({ query: "name:'Gig Trail Pro' AND active:'true'" });
    const existingUnlimited = await stripe.products.search({ query: "name:'Gig Trail Unlimited Bands' AND active:'true'" });

    if (existingPro.data.length > 0) {
      console.log("Products already exist:");
      for (const p of [existingFree.data[0], existingPro.data[0], existingUnlimited.data[0]].filter(Boolean)) {
        const prices = await stripe.prices.list({ product: p!.id, active: true });
        console.log(`  ${p!.name} (${p!.id}) — prices: ${prices.data.map((pr) => `${pr.id} ${pr.unit_amount} ${pr.currency}`).join(", ")}`);
      }
      return;
    }

    const proProduct = await stripe.products.create({
      name: "Gig Trail Pro",
      description: "Unlimited runs, full Tour Builder, ticketed show tools, routing & fuel estimates.",
      metadata: { plan: "pro" },
    });
    console.log(`Created: ${proProduct.name} (${proProduct.id})`);

    const proPrice = await stripe.prices.create({
      product: proProduct.id,
      unit_amount: 500,
      currency: "aud",
      recurring: { interval: "month" },
    });
    console.log(`  Pro price: AU$5.00/mo (${proPrice.id})`);

    const unlimitedProduct = await stripe.products.create({
      name: "Gig Trail Unlimited Bands",
      description: "Unlimited profiles, vehicles, runs, tours — everything in Pro.",
      metadata: { plan: "unlimited" },
    });
    console.log(`Created: ${unlimitedProduct.name} (${unlimitedProduct.id})`);

    const unlimitedPrice = await stripe.prices.create({
      product: unlimitedProduct.id,
      unit_amount: 799,
      currency: "aud",
      recurring: { interval: "month" },
    });
    console.log(`  Unlimited price: AU$7.99/mo (${unlimitedPrice.id})`);

    console.log("\nDone! Webhooks will sync products to the database.");
  } catch (error: any) {
    console.error("Error creating products:", error.message);
    process.exit(1);
  }
}

createProducts();
