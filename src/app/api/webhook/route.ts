import { getStripe } from "@/lib/stripe";
import { createServerClient } from "@/lib/supabase-server";
import type Stripe from "stripe";

export async function POST(req: Request) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig) {
    return Response.json({ error: "No signature" }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = getStripe().webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }

  const supabase = createServerClient();

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.supabase_user_id;
      const plan = session.metadata?.plan;

      if (userId && plan) {
        await supabase
          .from("profiles")
          .update({
            plan,
            stripe_customer_id: session.customer as string,
            stripe_subscription_id: session.subscription as string,
          })
          .eq("id", userId);
      }
      break;
    }

    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = subscription.customer as string;

      // Map price to plan
      const priceId = subscription.items.data[0]?.price?.id;
      let plan = "free";
      if (priceId === process.env.STRIPE_SOLO_PRICE_ID) plan = "solo";
      else if (priceId === process.env.STRIPE_FIRM_PRICE_ID) plan = "firm";
      else if (priceId === process.env.STRIPE_ENTERPRISE_PRICE_ID)
        plan = "enterprise";

      if (subscription.status === "active") {
        await supabase
          .from("profiles")
          .update({ plan })
          .eq("stripe_customer_id", customerId);
      }
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = subscription.customer as string;

      await supabase
        .from("profiles")
        .update({ plan: "free", stripe_subscription_id: null })
        .eq("stripe_customer_id", customerId);
      break;
    }
  }

  return Response.json({ received: true });
}
