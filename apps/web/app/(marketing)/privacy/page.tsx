import type { Metadata } from "next";
import { LegalPage, type LegalSection } from "@/features/marketing/legal";

export const metadata: Metadata = { title: "Privacy policy", description: "Template privacy policy for TripWeave. To be reviewed by legal counsel before production use." };

const SECTIONS: LegalSection[] = [
  {
    title: "Who we are",
    body: ["[Company name] (\"we\", \"us\") operates TripWeave. For personal data that you submit about your own customers, you are the controller and we act as your processor. For account and usage data about you and your colleagues, we are the controller. [Confirm roles and registered address with counsel.]"],
  },
  {
    title: "Data we handle",
    body: [
      "Account data: name, work email, role, organisation and a salted, hashed password. We never store passwords in readable form.",
      "Customer Data you enter: customer names and contact details, travel enquiries and preferences, itineraries, rates and contracts, quotations and notes.",
      "Operational data: audit events (who did what and when), IP address and request identifiers for security, provider usage statistics, and the content of emails queued for delivery.",
    ],
  },
  {
    title: "How we use it",
    body: ["To provide, secure and support the Service; to authenticate users and enforce roles; to detect abuse; to send service emails such as password resets and quotation links; and to meet legal obligations. [Add any analytics or marketing uses, with their legal bases.]"],
  },
  {
    title: "AI features",
    body: ["If an organisation leaves the AI engine on, text from an enquiry may be sent to an AI model operated by the platform or an external provider configured by the platform operator, in order to extract trip details or suggest an itinerary. Organisations can switch this to rules-only in Settings, in which case no text is sent to an AI model. AI is not used to calculate prices."],
  },
  {
    title: "Sharing and sub-processors",
    body: ["We use infrastructure providers to host and deliver the Service and, if enabled, email and supplier or routing providers. [List sub-processors and their locations.] Data is not sold. Information is shared with partner organisations only where you choose to share it, for example through partner sharing or a quotation link."],
  },
  {
    title: "Access by our staff",
    body: ["Each organisation's data is kept separate from others. Platform staff cannot browse customer data by default; support access requires a recorded reason, is limited to a short time window, and is written to your organisation's audit log."],
  },
  {
    title: "Retention and deletion",
    body: ["We keep Customer Data while your organisation's account is active. [Retention periods, backup retention, and the process for deletion or export on request or termination to be inserted.]"],
  },
  {
    title: "Security",
    body: ["We use access controls, encrypted connections, hashed credentials, role-based permissions and audit logging. No system is perfectly secure; tell us promptly if you suspect a problem. [Describe incident notification commitments.]"],
  },
  {
    title: "Your rights",
    body: ["Depending on where you live, you may have rights to access, correct, delete, restrict or port personal data, and to object to or complain about its processing. If your data is in an organisation's account, contact that organisation first; we will assist them as their processor. [Add contact and supervisory-authority details.]"],
  },
  {
    title: "Cookies",
    body: ["We use a strictly necessary session cookie to keep you signed in and for security. [Describe any other cookies or similar technologies, if introduced.]"],
  },
  {
    title: "Changes and contact",
    body: ["We will post updates to this policy here and notify you of material changes where practicable. Contact: [privacy contact email and postal address]."],
  },
];

export default function PrivacyPage() {
  return <LegalPage title="Privacy policy" updated="[date]" intro="This policy explains what personal data TripWeave handles, why, and the choices you have." sections={SECTIONS} />;
}
