/**
 * FAQ page copy, grouped into sections. Every answer leads with the
 * one-sentence answer, then expands — never the other way around.
 * Compliance lines (capital at risk, targets not guaranteed) stay verbatim.
 */
import { NO_PLATFORM_FEE_LINE } from "./consumer";

export const FAQ_META_DESCRIPTION =
  "Clear answers about parking investments, monthly income, risks, fees, and how Parkwise works.";

export const FAQ_INTRO = {
  kicker: "FAQ",
  title: "Frequently asked questions",
  lead: "Straight answers about how Parkwise works, what you might earn, and what can go wrong."
} as const;

export type FaqItem = { q: string; a: string };
export type FaqSection = { id: string; title: string; items: readonly FaqItem[] };

export const FAQ_SECTIONS: readonly FaqSection[] = [
  {
    id: "getting-started",
    title: "Getting started",
    items: [
      {
        q: "What is Parkwise?",
        a: "Parkwise is an investor platform for parking opportunities in selected European cities. You can view opportunities, review terms and risks, and invest through an account after the required checks."
      },
      {
        q: "How do I get started?",
        a: "Browse first, apply when you are ready. View opportunities, read the details and risks, then request an invitation to complete eligibility and identity checks before investing."
      },
      {
        q: "What is the minimum investment?",
        a: "It depends on the opportunity. Each opportunity page shows its own minimum before you register interest."
      },
      {
        q: "Who manages the car park?",
        a: "Professional operators run each site day to day. Parkwise sources, reviews, and structures the opportunities, and runs your investor account."
      }
    ]
  },
  {
    id: "money",
    title: "Money and returns",
    items: [
      {
        q: "How do investors make money from parking?",
        a: "Drivers pay to park, and that revenue supports the asset. Depending on the opportunity terms, available income may be distributed to investors on a target schedule. Income is not guaranteed."
      },
      {
        q: "Is monthly income guaranteed?",
        a: "No. Target monthly income is illustrative. Actual payments may be lower, higher, delayed, or not paid. Capital is at risk."
      },
      {
        q: "What does target return mean?",
        a: "A target return is the contractual aim based on the opportunity terms and expected performance. It is not a promise or a guarantee."
      }
    ]
  },
  {
    id: "risks",
    title: "Risks",
    items: [
      {
        q: "Can I exit early?",
        a: "Usually not easily. These investments are generally meant to be held for the stated term. Where an early exit exists at all, it typically requires a buyer and may involve a discount."
      }
    ]
  },
  {
    id: "fees",
    title: "Fees",
    items: [
      {
        q: "What fees will I pay?",
        a: `${NO_PLATFORM_FEE_LINE} Where an opportunity carries its own structuring, administration, or other costs, the Fees page explains how they affect returns.`
      }
    ]
  }
] as const;
