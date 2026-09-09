/**
 * OnboardingModal — shown after first sign-in.
 * User selects: Individual, Startup, or Organization.
 * Each option shows pricing and what's included.
 */
import { useState } from "react";

interface OnboardingModalProps {
  onClose: () => void;
  onSelect: (plan: "individual" | "startup" | "organization") => void;
  play: (s: "click") => void;
}

export function OnboardingModal({
  onClose,
  onSelect,
  play,
}: OnboardingModalProps) {
  const [selected, setSelected] = useState<
    "individual" | "startup" | "organization" | null
  >(null);

  const plans = [
    {
      id: "individual" as const,
      name: "Individual",
      price: "\u20A65,000",
      piPrice: "750 \u03C0",
      icon: "\uD83C\uDF93",
      features: [
        "Full access to pro voices (30%)",
        "Global leaderboard ranking",
        "Cloud Atlas Sextet ambient music",
        "Additional voices: \u20A6500 / 200\u03C0 each",
      ],
      color: "#4da6ff",
    },
    {
      id: "startup" as const,
      name: "Startup",
      price: "\u20A612,000",
      piPrice: "1,500 \u03C0",
      icon: "\uD83D\uDD25",
      features: [
        "Everything in Individual",
        "Marketplace workspace",
        "Showcase AI products",
        "Bio + links section",
        "Add products: \u20A61,000 each",
      ],
      color: "#E07A5F",
    },
    {
      id: "organization" as const,
      name: "Organization",
      price: "\u20A617,000",
      piPrice: "3,000 \u03C0",
      icon: "\uD83C\uDFE2",
      features: [
        "Full access to ALL pro voices",
        "Workspace + classroom feature",
        "Tutor management dashboard",
        "Bulk student onboarding",
        "Priority support",
      ],
      color: "#81B29A",
    },
  ];

  return (
    <div className="modal-overlay">
      <div className="modal-content onboarding-modal">
        <h2>{"\uD83C\uDF1F"} Welcome to Know Your World!</h2>
        <p className="onboarding-subtitle">
          Choose your plan to unlock pro features.
        </p>

        <div className="onboarding-plans">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`onboarding-plan${selected === plan.id ? " onboarding-plan-selected" : ""}`}
              onClick={() => {
                play("click");
                setSelected(plan.id);
              }}
              style={
                selected === plan.id ? { borderColor: plan.color } : undefined
              }
            >
              <div className="onboarding-plan-icon">{plan.icon}</div>
              <div className="onboarding-plan-name">{plan.name}</div>
              <div className="onboarding-plan-price">{plan.price}</div>
              <div className="onboarding-plan-pi">or {plan.piPrice}</div>
              <ul className="onboarding-plan-features">
                {plan.features.map((feature, i) => (
                  <li key={i}>
                    {"\u2713"} {feature}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {selected && (
          <div className="onboarding-actions">
            <p className="onboarding-disclaimer">
              GitHub Student Pack users get 10% off.
            </p>
            <button
              className="menu-btn"
              onClick={() => {
                play("click");
                onSelect(selected);
              }}
            >
              {"\u2705"} Proceed to Payment
            </button>
          </div>
        )}

        <button
          className="onboarding-skip-btn"
          onClick={() => {
            play("click");
            onClose();
          }}
        >
          Skip for now — I'll play free
        </button>
      </div>
    </div>
  );
}
