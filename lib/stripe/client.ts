import Stripe from "stripe";

// STRIPE_SECRET_KEY may not be set during the Next.js build phase.
// Stripe's constructor accepts an empty string; errors only surface at API call time,
// which is already wrapped in try/catch throughout the app.
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "", {
  apiVersion: "2024-12-18.acacia",
});
