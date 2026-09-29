"use client";

import React from "react";
import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";

const TERMS_VERSION = "2026-09-29";

function Section({
  kicker,
  title,
  children,
}: {
  kicker: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-black/[0.08] pt-7 first:border-t-0 first:pt-0">
      <p className="mb-1.5 text-[9px] uppercase tracking-[0.28em] text-[#777777]">
        {kicker}
      </p>
      <h2 className="mb-3 font-serif text-[17px] font-medium tracking-[0.015em] text-[#111111]">
        {title}
      </h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Lead({ children }: { children: React.ReactNode }) {
  return <span className="font-medium text-[#111111]">{children}</span>;
}

export default function TermsPage() {
  const router = useRouter();

  const acceptAndContinue = () => {
    // This device record improves continuity. For a complete audit trail,
    // mirror the terms version and acceptance timestamp to the signed-in
    // user's server-side account record as well.
    try {
      localStorage.setItem(
        "astroproxl_terms_acceptance",
        JSON.stringify({
          version: TERMS_VERSION,
          acceptedAt: new Date().toISOString(),
        }),
      );
    } catch {
      // Storage can be unavailable in private browsing. Do not trap the user.
    }

    router.push("/reading/intake");
  };

  return (
    <main
      className="relative min-h-[100dvh] overflow-y-auto overscroll-none bg-white text-[#222222]"
      style={{
        WebkitOverflowScrolling: "touch",
      }}
    >
      <div
        className="relative z-10 mx-auto w-full max-w-[460px] px-4 pt-4"
        style={{ paddingBottom: "calc(2.5rem + env(safe-area-inset-bottom))" }}
      >
        <header className="mb-4 flex items-center gap-3 py-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-black/10 bg-black/[0.02] text-[#555555] transition hover:border-black/25 hover:text-black"
            aria-label="Go back"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <p className="font-serif text-[11px] uppercase tracking-[0.28em] text-[#555555]">
            Terms &amp; Conditions
          </p>
        </header>

        <article className="overflow-hidden rounded-[30px] border border-black/[0.09] bg-white shadow-[0_18px_55px_rgba(0,0,0,0.07)]">
          <div className="border-b border-black/[0.08] bg-white px-6 pb-8 pt-9 text-center">
            <p className="text-[9px] uppercase tracking-[0.34em] text-[#777777]">
              AstroProXL
            </p>
            <p className="mt-3 font-serif text-[22px] tracking-[0.04em] text-[#111111]">
              The Astrology Engine
            </p>
            <p className="mx-auto mt-3 max-w-[310px] font-serif text-[12px] uppercase leading-6 tracking-[0.18em] text-[#555555]">
              What&rsquo;s Coming. What&rsquo;s Changing.<br />What You Need to Know.
            </p>
            <div className="mx-auto my-6 h-px w-14 bg-gradient-to-r from-transparent via-black/35 to-transparent" />
            <p className="mx-auto max-w-[350px] text-[13px] leading-6 text-[#444444]">
              AstroProXL was built for the moment when vague astrology is no longer
              enough. We calculate before we interpret, prioritize what matters,
              and turn a highly structured chart into guidance that feels direct,
              personal, and human.
            </p>
          </div>

          <div className="space-y-8 px-6 pb-8 pt-7 text-[13px] leading-[1.85] text-[#444444] sm:px-7">
          <p className="text-[10px] uppercase tracking-[0.2em] text-[#888888]">
            Last updated: September 29, 2026
          </p>

          <Section kicker="Entering the experience" title="1. Agreement and Eligibility">
            <p>
              These Terms and Conditions (&ldquo;Terms&rdquo;) govern your access to and use
              of the AstroProXL application, website, content, and related services
              (collectively, the &ldquo;Application&rdquo;). By selecting &ldquo;Agree &amp;
              Continue,&rdquo; creating an account, purchasing a feature, or using the
              Application, you agree to these Terms.
            </p>
            <p>
              You must be at least eighteen (18) years old and legally capable of
              entering into a binding agreement to use the Application. If you do
              not agree to these Terms, do not use the Application.
            </p>
          </Section>

          <Section kicker="Built differently" title="2. The AstroProXL Engine">
            <p>
              AstroProXL is a proprietary, multi-stage astrology system. It combines
              astronomical calculations, natal and transit data, predictive
              techniques, rules-based analysis, algorithmic prioritization,
              topic-specific routing, and structured interpretive frameworks to
              generate personalized chart information, readings, forecasts,
              explanations, and related content.
            </p>
            <p>
              AI-assisted synthesis is one communication layer within that larger
              system. It helps organize and express analysis determined by the
              Application&rsquo;s calculations, methods, and interpretive architecture;
              it does not replace the underlying engine or independently determine
              the chart data on which a reading is based.
            </p>
            <p>
              The Application may include automated readings, daily horoscopes,
              birth-chart explanations, voice transcription, follow-up questions,
              saved readings, subscriptions, and other features that may change over
              time.
            </p>
          </Section>

          <Section kicker="Precision without false certainty" title="3. Interpretive Content and User Responsibility">
            <p>
              <Lead>3.1 Interpretive nature.</Lead>{" "}
              AstroProXL outputs are engine-guided interpretations intended for
              informational, educational, and personal-reflection purposes. They
              are not guaranteed statements of future fact. Any automated or
              AI-assisted synthesis may occasionally be incomplete, inaccurate,
              inconsistent, or affected by incorrect information supplied by a user.
            </p>
            <p>
              <Lead>3.2 No guaranteed outcomes.</Lead>{" "}
              Real-world outcomes depend on personal decisions, third parties,
              external conditions, and events outside AstroProXL&rsquo;s control. You
              remain responsible for how you interpret and use any output and for
              every decision or action you take.
            </p>
            <p>
              <Lead>3.3 No professional advice.</Lead>{" "}
              The Application does not provide medical, mental-health, therapeutic,
              legal, financial, tax, investment, employment, or other licensed
              professional advice. Do not use AstroProXL as a substitute for a
              qualified professional or as the sole basis for decisions affecting
              your health, safety, finances, legal rights, employment, or important
              relationships.
            </p>
          </Section>

          <Section kicker="Care is part of the architecture" title="4. Safety Features and Crisis Situations">
            <p>
              AstroProXL uses automated safety measures that assess certain
              user-provided language before and during generation. Depending on the
              assessed level and type of risk, the Application may stop a reading
              and display a fixed emergency or crisis response, allow the reading
              while adding a supportive care note, limit or redirect an output, or
              suggest outside resources. These measures are designed to respond more
              cautiously to possible suicide, self-harm, violence, medical emergency,
              abuse, sexual assault, immediate danger, severe distress, or related
              safety signals.
            </p>
            <p>
              These automated systems use rules and contextual model assessment and
              can produce false positives or false negatives. They may misunderstand
              negation, quotations, sarcasm, fiction, song lyrics, third-person
              disclosures, ambiguous statements, or unfamiliar phrasing. A safety
              response does not mean that AstroProXL has diagnosed you or determined
              that an emergency exists.
            </p>
            <p>
              AstroProXL is not an emergency service, crisis line, healthcare
              provider, or substitute for immediate assistance. No person is
              continuously reading or monitoring your submissions, and the
              Application cannot contact emergency services or another person on
              your behalf. Its safety features do not create a duty to diagnose,
              monitor, intervene, rescue, or guarantee detection or a response. If
              you or another person may be in immediate danger, contact emergency
              services. In the United States, call or text 988 for the Suicide &amp;
              Crisis Lifeline or call 911 for an emergency. Outside the United
              States, contact the appropriate local emergency or crisis service.
            </p>
          </Section>

          <Section kicker="Your voice, protected by design" title="5. User Inputs, Voice Features, and Generated Content">
            <p>
              <Lead>5.1 Your inputs.</Lead>{" "}
              You retain ownership of information and content you submit. You grant
              AstroProXL a limited, non-exclusive license to host, transmit,
              reproduce, and process those inputs only as reasonably necessary to
              operate, secure, maintain, and improve the Application and provide the
              features you request.
            </p>
            <p>
              <Lead>5.2 Voice transcription and assisted processing.</Lead>{" "}
              When you use voice or generative features, audio, transcripts,
              questions, chart data, and relevant conversation context may be sent
              to service providers that perform speech recognition, artificial-
              intelligence-assisted synthesis, hosting, security, or other technical
              functions. Processing is also subject to our Privacy Policy and the
              applicable providers&rsquo; terms and policies.
            </p>
            <p>
              <Lead>5.3 Your responsibility.</Lead>{" "}
              Do not submit information you lack the right to use, confidential
              information belonging to another person, or content that violates
              law or another person&rsquo;s rights. Review voice transcripts before
              relying on them because transcription errors can occur.
            </p>
          </Section>

          <Section kicker="Personal by necessity, private by principle" title="6. Privacy, Chart Data, and Local Storage">
            <p>
              AstroProXL collects and processes account information, birth details,
              location and timezone inputs, chart data, questions, and other
              information reasonably necessary to provide requested features. Our
              Privacy Policy describes our data practices and your available privacy
              choices and rights.
            </p>
            <p>
              Certain account and chart inputs may be maintained through our
              authentication, hosting, payment, analytics, transcription, and
              artificial-intelligence service providers. We do not sell personal
              chart inputs or reading content to data brokers.
            </p>
            <p>
              Some calculated chart data, preferences, daily horoscopes, and saved
              readings may be stored only in your browser or on your device. Local
              data may be lost when you clear browser data, use another browser or
              device, uninstall the Application, use private browsing, or when your
              device or browser removes stored data. Unless a feature expressly says
              otherwise, local content is not a cloud backup, and AstroProXL is not
              responsible for local data loss.
            </p>
          </Section>

          <Section kicker="Your account is your doorway" title="7. Accounts and Security">
            <p>
              You agree to provide accurate information, maintain the security of
              your login credentials, and promptly notify us of suspected
              unauthorized access. You are responsible for activity performed
              through your account unless applicable law provides otherwise.
            </p>
            <p>
              We may suspend or terminate access when reasonably necessary to
              address a Terms violation, suspected fraud, nonpayment, security or
              legal risk, harm to another person, interference with the Application,
              or discontinuation of a feature or the Application.
            </p>
          </Section>

          <Section kicker="Premium access, plainly explained" title="8. Payments, Credits, and Subscriptions">
            <p>
              <Lead>8.1 Purchases.</Lead>{" "}
              Prices, included features, billing intervals, and material purchase
              terms are displayed before payment. Taxes and third-party payment fees
              may apply. Except where required by law or expressly stated in a
              written refund policy, completed purchases of digital readings,
              credits, replies, and other immediately delivered digital features are
              final.
            </p>
            <p>
              <Lead>8.2 Credits.</Lead>{" "}
              Credits are a limited, revocable license to access designated features.
              They are not money, property, a bank account, or transferable value;
              have no cash value; and may not be sold or transferred. Promotional or
              complimentary credits may expire according to the offer presented.
            </p>
            <p>
              <Lead>8.3 Recurring subscriptions.</Lead>{" "}
              A recurring subscription automatically renews at the disclosed price
              and interval until canceled. By subscribing, you authorize recurring
              charges to your selected payment method. You may cancel using the
              account or billing controls made available to you. Cancellation stops
              future renewals and does not retroactively refund an already completed
              billing period, except where required by law.
            </p>
            <p>
              Payment processing is handled by third-party payment providers, and
              their terms and privacy practices also apply to payment information.
            </p>
          </Section>

          <Section kicker="Built here, protected here" title="9. Ownership and Limited License">
            <p>
              The Application—including its code, interfaces, designs, databases,
              prompts, workflows, selection and arrangement of information,
              calculation methods, reading structures, brand elements, and original
              content—is owned by AstroProXL or its licensors and protected by
              applicable intellectual-property law.
            </p>
            <p>
              Subject to these Terms, you receive a limited, personal, revocable,
              non-exclusive, non-transferable license to use the Application for
              lawful, non-commercial purposes. No ownership interest is transferred
              to you. You may retain and personally use readings generated for your
              account, but you may not use the Application or its output to recreate,
              train, benchmark, reverse-engineer, or compete with AstroProXL or to
              operate a commercial reading service without written permission.
            </p>
          </Section>

          <Section kicker="Use it with integrity" title="10. Prohibited Conduct">
            <p>You may not:</p>
            <ul className="ml-4 list-disc space-y-1.5">
              <li>Violate any applicable law, regulation, court order, or third-party right.</li>
              <li>Reverse-engineer, decompile, disassemble, or attempt to discover source code, prompts, models, private APIs, security controls, or underlying logic.</li>
              <li>Scrape, crawl, harvest, bulk-download, or systematically extract content or data, whether manually or with automated tools.</li>
              <li>Use Application content or output to develop, train, evaluate, or improve another model, dataset, astrology engine, or competing product.</li>
              <li>Bypass access controls, payment requirements, usage limits, safety measures, or technical restrictions.</li>
              <li>Probe, disrupt, overload, damage, or gain unauthorized access to accounts, systems, networks, or data.</li>
              <li>Use the Application to threaten, harass, exploit, impersonate, defraud, or harm another person.</li>
              <li>Resell, sublicense, commercially redistribute, or falsely present AstroProXL content as your own service.</li>
            </ul>
          </Section>

          <Section kicker="A powerful system still relies on infrastructure" title="11. Third-Party Services and Links">
            <p>
              The Application relies on third-party services and may contain links
              to third-party websites. AstroProXL does not control and is not
              responsible for third-party availability, security, content, terms,
              acts, or omissions. Your use of third-party services may be governed
              by separate agreements with those providers.
            </p>
          </Section>

          <Section kicker="The engine evolves" title="12. Availability and Changes">
            <p>
              We may modify, update, limit, suspend, discontinue, or introduce
              features at any time. We do not guarantee that the Application will be
              uninterrupted, error-free, compatible with every device, or available
              in every location. Maintenance, provider failures, internet conditions,
              legal requirements, and events outside our control may affect access.
            </p>
          </Section>

          <Section kicker="Excellence without impossible promises" title="13. Disclaimers and Limitation of Liability">
            <p>
              To the maximum extent permitted by law, the Application and all
              outputs are provided &ldquo;as is&rdquo; and &ldquo;as available,&rdquo; without
              express or implied warranties, including warranties of accuracy,
              merchantability, fitness for a particular purpose, title, and
              non-infringement.
            </p>
            <p>
              To the maximum extent permitted by law, AstroProXL and the Developer
              will not be liable for indirect, incidental, special, consequential,
              exemplary, or punitive damages; loss of profits, data, opportunity,
              goodwill, or business; or decisions or actions based on Application
              content. Our total aggregate liability for all claims relating to the
              Application or these Terms will not exceed the greater of one hundred
              U.S. dollars (US $100) or the amount you paid to AstroProXL during the
              twelve months before the event giving rise to the claim.
            </p>
            <p>
              Some jurisdictions do not permit certain warranty exclusions or
              liability limitations. In those jurisdictions, these provisions apply
              only to the maximum extent allowed by law. Nothing in these Terms
              limits a right or remedy that cannot legally be waived.
            </p>
          </Section>

          <Section kicker="Responsibility travels both ways" title="14. Indemnification">
            <p>
              To the extent permitted by law, you agree to defend, indemnify, and
              hold harmless AstroProXL and the Developer from third-party claims,
              losses, liabilities, and reasonable expenses arising from your
              unlawful misuse of the Application, your violation of these Terms, or
              your infringement of another person&rsquo;s rights.
            </p>
          </Section>

          <Section kicker="Washington built" title="15. Governing Law and Disputes">
            <p>
              These Terms are governed by the laws of the State of Washington,
              without regard to conflict-of-laws principles. To the extent a dispute
              may lawfully be brought in court, the state and federal courts located
              in King County, Washington will have exclusive jurisdiction, and you
              consent to personal jurisdiction there. Nothing in this section
              prevents either party from seeking relief in an eligible small-claims
              court or limits a consumer protection that cannot legally be waived.
            </p>
          </Section>

          <Section kicker="Growth requires revision" title="16. Changes to These Terms">
            <p>
              We may revise these Terms to reflect legal, operational, or product
              changes. If a revision is material, we may provide notice through the
              Application, by email, or by requesting renewed acceptance. Continued
              use after the effective date of non-material changes constitutes
              acceptance. Where law or the nature of the change requires affirmative
              consent, we will request it.
            </p>
          </Section>

          <Section kicker="The legal foundation" title="17. Miscellaneous">
            <p>
              These Terms and any policies expressly incorporated into them are the
              entire agreement concerning the Application. If a provision is held
              unenforceable, it will be enforced to the maximum permissible extent
              and the remaining provisions will remain effective. Failure to enforce
              a provision is not a waiver. You may not assign these Terms without our
              written consent. We may assign them as part of a merger, acquisition,
              financing, restructuring, or transfer of the Application or business.
            </p>
          </Section>

          <Section kicker="Talk to the builder" title="18. Contact">
            <p>
              Questions about these Terms may be sent to{" "}
              <a
                href="mailto:contactbrandonjohnson@gmail.com"
                className="font-medium text-[#111111] underline decoration-black/25 underline-offset-4"
              >
                contactbrandonjohnson@gmail.com
              </a>
              .
            </p>
          </Section>
          </div>

        <footer className="border-t border-black/[0.08] bg-[#fafafa] px-6 pb-7 pt-7">
          <p className="mx-auto max-w-sm text-center text-[11px] leading-5 text-[#666666]">
            By selecting Agree &amp; Continue, you confirm that you are at least 18
            years old and agree to these Terms &amp; Conditions.
          </p>
          <button
            type="button"
            onClick={acceptAndContinue}
            className="mt-4 inline-flex h-14 w-full items-center justify-center rounded-[18px] border border-black bg-black font-serif text-[13px] uppercase tracking-[0.18em] text-white shadow-[0_10px_24px_rgba(0,0,0,0.16)] transition hover:bg-[#1b1b1b] active:scale-[0.99]"
          >
            Agree &amp; Continue →
          </button>
        </footer>
        </article>
      </div>
    </main>
  );
}
