import { getStripe, PLANS } from "@/lib/stripe";
import { createServerClient } from "@/lib/supabase-server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  try {
    const { plan } = await req.json();

    if (!plan || !PLANS[plan as keyof typeof PLANS]) {
      return Response.json({ error: "Invalid plan" }, { status: 400 });
    }

    const planConfig = PLANS[plan as keyof typeof PLANS];
    if (!planConfig.priceId) {
      return Response.json({ error: "Plan not available for purchase" }, { status: 400 });
    }

    // Get the current user from the auth header
    const authHeader = req.headers.get("authorization");
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: authHeader || "" } } }
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return Response.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Get or create Stripe customer
    const serverSupabase = createServerClient();
    const { data: profile } = await serverSupabase
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .single();

    let customerId = profile?.stripe_customer_id;

    if (!customerId) {
      const customer = await getStripe().customers.create({
        email: user.email,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;

      await serverSupabase
        .from("profiles")
        .update({ stripe_customer_id: customerId })
        .eq("id", user.id);
    }

    // Create checkout session
    const session = await getStripe().checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [{ price: planConfig.priceId, quantity: 1 }],
      success_url: `${req.headers.get("origin")}/dashboard?upgraded=true`,
      cancel_url: `${req.headers.get("origin")}/dashboard`,
      metadata: { supabase_user_id: user.id, plan },
    });

    return Response.json({ url: session.url });
  } catch (err) {
    console.error("Checkout error:", err);
    return Response.json({ error: "Failed to create checkout" }, { status: 500 });
  }
}
