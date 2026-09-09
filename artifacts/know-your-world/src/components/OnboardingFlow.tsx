/**
 * OnboardingFlow — full multi-step onboarding after first sign-in.
 *
 * Steps:
 *   1. Plan selection (Individual, Startup, Organization)
 *   2. Payment method (Stripe or Pi)
 *   3. Plan-specific details (Startup: website + MVPs; Org: workspace name)
 *   4. Success screen
 */
import { useState } from "react";
import { createPiPayment } from "../lib/pi";

type Plan = "individual" | "startup" | "organization";
type PaymentMethod = "stripe" | "pi";
type Step = "select-plan" | "payment" | "details" | "success";

const STRIPE_LINKS: Record<Plan, string> = {
  individual: "https://donate.stripe.com/28E28kg1gaWL8lXc28fbq00",
  startup: "https://donate.stripe.com/28E28kg1gaWL8lXc28fbq00",
  organization: "https://donate.stripe.com/28E28kg1gaWL8lXc28fbq00",
};

const PI_PRICES: Record<Plan, number> = {
  individual: 750,
  startup: 1500,
  organization: 3000,
};

const PLAN_INFO: Record<
  Plan,
  { name: string; naira: string; icon: string; features: string[] }
> = {
  individual: {
    name: "Individual",
    naira: "\u20A65,000",
    icon: "\uD83C\uDF93",
    features: [
      "Pro voices (30%)",
      "Global leaderboard",
      "Ambient music",
      "Voices: \u20A6500 / 200\u03C0 each",
    ],
  },
  startup: {
    name: "Startup",
    naira: "\u20A612,000",
    icon: "\uD83D\uDD25",
    features: [
      "Everything in Individual",
      "Marketplace workspace",
      "Showcase AI products",
      "Bio + links",
      "Products: \u20A61k each",
    ],
  },
  organization: {
    name: "Organization",
    naira: "\u20A617,000",
    icon: "\uD83C\uDFE2",
    features: [
      "ALL pro voices",
      "Workspace + classroom",
      "Tutor dashboard",
      "Bulk onboarding",
      "Priority support",
    ],
  },
};

interface OnboardingFlowProps {
  onComplete: (plan: Plan) => void;
  onSkip: () => void;
  play: (s: "click") => void;
}

export function OnboardingFlow({
  onComplete,
  onSkip,
  play,
}: OnboardingFlowProps) {
  const [step, setStep] = useState<Step>("select-plan");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Startup-specific fields
  const [startupName, setStartupName] = useState("");
  const [website, setWebsite] = useState("");
  const [mvp1, setMvp1] = useState("");
  const [mvp2, setMvp2] = useState("");
  const [bio, setBio] = useState("");

  // Organization-specific fields
  const [orgName, setOrgName] = useState("");

  const handleSelectPlan = (selected: Plan) => {
    play("click");
    setPlan(selected);
    setStep("payment");
  };

  const handlePayment = async () => {
    if (!plan || !paymentMethod) return;
    play("click");
    setLoading(true);
    setError(null);

    if (paymentMethod === "stripe") {
      // Redirect to Stripe
      window.open(STRIPE_LINKS[plan], "_blank");
      setLoading(false);
      // After payment, user comes back — go to details step
      setStep("details");
    } else if (paymentMethod === "pi") {
      // Create Pi payment
      const result = await createPiPayment(
        PI_PRICES[plan],
        `Know Your World - ${PLAN_INFO[plan].name} plan`,
        { plan, type: "pro_access" },
      );

      if (result.ok) {
        setLoading(false);
        setStep("details");
      } else {
        setError(result.error ?? "Pi payment failed");
        setLoading(false);
      }
    }
  };

  const handleDetails = () => {
    play("click");
    if (plan === "startup" && (!startupName || !website || !mvp1 || !mvp2)) {
      setError("Please fill in all required fields");
      return;
    }
    if (plan === "organization" && !orgName) {
      setError("Please enter your organization name");
      return;
    }
    setError(null);
    setStep("success");
  };

  const handleComplete = () => {
    play("click");
    if (plan) onComplete(plan);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content onboarding-flow-modal">
        {/* Step 1: Plan Selection */}
        {step === "select-plan" && (
          <>
            <h2>{"\uD83C\uDF1F"} Choose Your Plan</h2>
            <p className="onboarding-subtitle">
              Unlock pro features. Cancel anytime.
            </p>
            <div className="onboarding-plans">
              {(Object.keys(PLAN_INFO) as Plan[]).map((p) => (
                <div
                  key={p}
                  className="onboarding-plan"
                  onClick={() => handleSelectPlan(p)}
                >
                  <div className="onboarding-plan-icon">
                    {PLAN_INFO[p].icon}
                  </div>
                  <div className="onboarding-plan-name">
                    {PLAN_INFO[p].name}
                  </div>
                  <div className="onboarding-plan-price">
                    {PLAN_INFO[p].naira}
                  </div>
                  <div className="onboarding-plan-pi">
                    or {PI_PRICES[p]} \u03C0
                  </div>
                  <ul className="onboarding-plan-features">
                    {PLAN_INFO[p].features.map((f, i) => (
                      <li key={i}>
                        {"\u2713"} {f}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <button className="onboarding-skip-btn" onClick={onSkip}>
              Skip for now \u2014 I'll play free
            </button>
          </>
        )}

        {/* Step 2: Payment Method */}
        {step === "payment" && plan && (
          <>
            <h2>
              {PLAN_INFO[plan].icon} {PLAN_INFO[plan].name} Plan
            </h2>
            <p className="onboarding-subtitle">
              {PLAN_INFO[plan].naira} or {PI_PRICES[plan]} \u03C0
            </p>
            <div className="payment-options">
              <button
                className={`payment-option-btn${paymentMethod === "stripe" ? " selected" : ""}`}
                onClick={() => {
                  play("click");
                  setPaymentMethod("stripe");
                }}
              >
                <span className="payment-option-icon">{"\uD83D\uDCB3"}</span>
                <span className="payment-option-name">Pay with Card</span>
                <span className="payment-option-price">
                  {PLAN_INFO[plan].naira}
                </span>
              </button>
              <button
                className={`payment-option-btn${paymentMethod === "pi" ? " selected" : ""}`}
                onClick={() => {
                  play("click");
                  setPaymentMethod("pi");
                }}
              >
                <span className="payment-option-icon">{"\uD83D\uDFE1"}</span>
                <span className="payment-option-name">Pay with Pi</span>
                <span className="payment-option-price">
                  {PI_PRICES[plan]} \u03C0
                </span>
              </button>
            </div>
            {error && <div className="auth-error">{error}</div>}
            <div className="onboarding-nav">
              <button
                className="auth-back-btn"
                onClick={() => {
                  play("click");
                  setStep("select-plan");
                  setPaymentMethod(null);
                  setError(null);
                }}
              >
                {"\u2190"} Back
              </button>
              <button
                className="menu-btn"
                onClick={handlePayment}
                disabled={!paymentMethod || loading}
              >
                {loading
                  ? "Processing..."
                  : `Pay ${paymentMethod === "pi" ? PI_PRICES[plan] + " \u03C0" : PLAN_INFO[plan].naira}`}
              </button>
            </div>
          </>
        )}

        {/* Step 3: Plan-specific details */}
        {step === "details" && plan && (
          <>
            <h2>{"\u2705"} Payment Confirmed!</h2>
            <p className="onboarding-subtitle">
              Complete your {PLAN_INFO[plan].name} profile:
            </p>

            {plan === "startup" && (
              <div className="onboarding-form">
                <input
                  className="auth-input"
                  placeholder="Startup name *"
                  value={startupName}
                  onChange={(e) => setStartupName(e.target.value)}
                />
                <input
                  className="auth-input"
                  placeholder="Website URL *"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                />
                <input
                  className="auth-input"
                  placeholder="MVP 1 link *"
                  value={mvp1}
                  onChange={(e) => setMvp1(e.target.value)}
                />
                <input
                  className="auth-input"
                  placeholder="MVP 2 link *"
                  value={mvp2}
                  onChange={(e) => setMvp2(e.target.value)}
                />
                <textarea
                  className="auth-input"
                  placeholder="Bio (what does your startup do?)"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  rows={3}
                />
              </div>
            )}

            {plan === "organization" && (
              <div className="onboarding-form">
                <input
                  className="auth-input"
                  placeholder="Organization name *"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                />
                <p className="onboarding-note">
                  Workspace + classroom features will be available after setup.
                </p>
              </div>
            )}

            {plan === "individual" && (
              <p className="onboarding-note">
                You're all set! Individual accounts get instant access to pro
                features.
              </p>
            )}

            {error && <div className="auth-error">{error}</div>}
            <button className="menu-btn" onClick={handleDetails}>
              {"\u2705"} Complete Setup
            </button>
          </>
        )}

        {/* Step 4: Success */}
        {step === "success" && plan && (
          <div className="onboarding-success">
            <div className="onboarding-success-icon">{"\uD83C\uDF89"}</div>
            <h2>Welcome aboard!</h2>
            <p className="onboarding-subtitle">
              Your {PLAN_INFO[plan].name} account is ready.
            </p>
            <ul className="onboarding-success-features">
              {PLAN_INFO[plan].features.map((f, i) => (
                <li key={i}>
                  {"\u2713"} {f}
                </li>
              ))}
            </ul>
            <button className="menu-btn" onClick={handleComplete}>
              {"\uD83C\uDD95"} Start Playing
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
