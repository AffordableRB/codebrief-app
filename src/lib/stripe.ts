import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: "2025-03-31.basil",
    });
  }
  return _stripe;
}

export const PLANS = {
  free: {
    name: "Free",
    price: 0,
    briefsPerMonth: 2,
    priceId: null,
  },
  solo: {
    name: "Solo",
    price: 49,
    briefsPerMonth: 15,
    priceId: process.env.STRIPE_SOLO_PRICE_ID || "",
  },
  firm: {
    name: "Firm",
    price: 99,
    briefsPerMonth: -1, // unlimited
    priceId: process.env.STRIPE_FIRM_PRICE_ID || "",
  },
  enterprise: {
    name: "Enterprise",
    price: 199,
    briefsPerMonth: -1, // unlimited
    priceId: process.env.STRIPE_ENTERPRISE_PRICE_ID || "",
  },
} as const;

export type PlanKey = keyof typeof PLANS;
