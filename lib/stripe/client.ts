import Stripe from "stripe";

// STRIPE_SECRET_KEY may not be set during the Next.js build phase.
// stripe@17.7.0 throws on an empty-string key ("Neither apiKey nor config.authenticator
// provided"), so fall back to a non-empty stub. All Stripe API calls are already wrapped
// in try/catch and will surface a graceful error when the stub is used at runtime.
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "sk_build_stub", {
  apiVersion: "2024-12-18.acacia" as unknown as Stripe.LatestApiVersion,
});
