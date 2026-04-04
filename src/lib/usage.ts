import { createServerClient } from "./supabase-server";
import { PLANS, PlanKey } from "./stripe";

export async function checkUsageLimit(userId: string): Promise<{
  allowed: boolean;
  used: number;
  limit: number;
  plan: PlanKey;
}> {
  const supabase = createServerClient();

  // Get user's plan
  const { data: profile } = await supabase
    .from("profiles")
    .select("plan, stripe_customer_id")
    .eq("id", userId)
    .single();

  const plan: PlanKey = profile?.plan || "free";
  const planConfig = PLANS[plan];
  const limit = planConfig.briefsPerMonth;

  // Unlimited plans
  if (limit === -1) {
    return { allowed: true, used: 0, limit: -1, plan };
  }

  // Count briefs this month
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const { count } = await supabase
    .from("briefs")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", startOfMonth.toISOString());

  const used = count || 0;

  return {
    allowed: used < limit,
    used,
    limit,
    plan,
  };
}

export async function recordBriefUsage(
  userId: string,
  input: Record<string, string>,
  briefContent: string
) {
  const supabase = createServerClient();

  await supabase.from("briefs").insert({
    user_id: userId,
    building_type: input.buildingType,
    location: input.location,
    square_footage: input.squareFootage,
    stories: input.stories,
    occupancy_type: input.occupancyType || null,
    brief_content: briefContent,
    input_json: input,
  });
}
