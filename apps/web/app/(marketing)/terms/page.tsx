import type { Metadata } from "next";
import { LegalPage, type LegalSection } from "@/features/marketing/legal";

export const metadata: Metadata = { title: "Terms of service", description: "Template terms of service for TripWeave. To be reviewed by legal counsel before production use." };

const SECTIONS: LegalSection[] = [
  {
    title: "Agreement and eligibility",
    body: [
      "These Terms govern access to and use of the TripWeave service (the \"Service\") provided by [Company name] (\"we\", \"us\"). By creating an account or using the Service you agree to these Terms on behalf of yourself and the organisation you represent.",
      "You must be authorised to bind your organisation and be at least 18 years old. If you do not agree to these Terms, do not use the Service.",
    ],
  },
  {
    title: "The Service",
    body: [
      "TripWeave helps tour operators and hotel management companies capture enquiries, build itineraries, search accommodation combinations, calculate prices and prepare quotations.",
      "The Service calculates prices from the costs, rates, exchange rates and pricing rules you provide or enable. You are responsible for the accuracy of that input data and for checking every quotation before sending it to a client.",
      "Optional AI features may assist with reading enquiries and suggesting draft itineraries. AI output is a suggestion only, may be wrong, and is never used to set prices.",
    ],
  },
  {
    title: "Accounts and security",
    body: [
      "You are responsible for activity under your organisation's accounts, for keeping credentials confidential, and for the roles and permissions you assign to your team. Notify us promptly of any suspected unauthorised access.",
      "Where you create accounts for colleagues with a temporary password, you must ask them to change it on first sign-in.",
    ],
  },
  {
    title: "Your data",
    body: [
      "You retain ownership of the data you submit, including customer details, rates, contracts and quotations (\"Customer Data\"). You grant us a limited licence to host and process Customer Data solely to provide and secure the Service.",
      "You are responsible for having a lawful basis to submit personal data about your customers and for honouring their rights. Our handling of personal data is described in the Privacy Policy.",
      "Platform staff access Customer Data only to provide support, and only through a time-limited, recorded access grant with a stated reason.",
    ],
  },
  {
    title: "Third-party suppliers and data",
    body: [
      "Rates and availability may come from your own contracts, from suppliers, or from live provider checks, and are labelled by source. Estimated, supplier-reported and illustrative data may not reflect what a supplier will honour. Illustrative data must never be quoted to a client.",
      "Use of an external supplier integration may be subject to that supplier's own terms.",
    ],
  },
  {
    title: "Acceptable use",
    body: ["You must not misuse the Service, including by attempting to access other organisations' data, probing or disrupting the platform, reverse engineering it, uploading unlawful or malicious content, or using it to mislead your clients."],
  },
  {
    title: "Fees and subscription",
    body: ["Plans, seat limits and usage limits are set out in your subscription. [Fees, billing cycle, taxes, and refund terms to be inserted.] We may suspend an organisation for non-payment or breach of these Terms, and will give notice where practicable."],
  },
  {
    title: "Availability and changes",
    body: ["We aim to keep the Service available but do not guarantee uninterrupted operation. We may update the Service and these Terms; material changes will be notified in advance where practicable. Continued use after a change takes effect means you accept it."],
  },
  {
    title: "Disclaimers and liability",
    body: [
      "The Service is provided \"as is\" to the extent permitted by law. We do not warrant that outputs, including prices, packages and itineraries, are error-free or fit for a particular commercial decision.",
      "[Limitation of liability, indemnities, and governing law to be completed by counsel.]",
    ],
  },
  {
    title: "Termination",
    body: ["You may stop using the Service at any time. We may suspend or terminate access for material breach. [Data export and deletion periods after termination to be inserted.]"],
  },
  {
    title: "Contact",
    body: ["Questions about these Terms: [legal contact email and postal address]."],
  },
];

export default function TermsPage() {
  return <LegalPage title="Terms of service" updated="[date]" intro="Please read these Terms carefully. They explain what you can expect from the Service and what we expect from you." sections={SECTIONS} />;
}
