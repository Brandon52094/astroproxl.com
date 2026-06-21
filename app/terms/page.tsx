"use client";

import React from "react";
import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";

export default function TermsPage() {
  const router = useRouter();

  return (
    <div
      className="h-screen overflow-y-auto overscroll-none bg-[#050816] text-slate-100"
      style={{ WebkitOverflowScrolling: "touch" }}
    >
      <div className="mx-auto w-full max-w-md px-4 pb-16 pt-4">
        <header className="mb-6 flex items-center gap-3 py-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-slate-300 transition hover:border-teal-300/30 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">
              AstroProXL
            </p>
            <p className="mt-0.5 text-sm font-medium text-white">
              Terms &amp; Conditions
            </p>
          </div>
        </header>

        <div className="space-y-7 text-sm leading-7 text-slate-300">
          <p className="text-xs text-slate-500">
            Last updated: June 21, 2026
          </p>

          <section>
            <h2 className="mb-2 text-base font-semibold text-white">
              1. Introduction
            </h2>
            <p>
              These Terms and Conditions (&ldquo;Terms&rdquo;) govern your access
              to and use of the AstroProXL application and related services
              (collectively, the &ldquo;Application&rdquo;). By creating an
              account, accessing, or using the Application, you agree to be
              bound by these Terms.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-white">
              2. Proprietary Rights &amp; Code Protection
            </h2>
            <p className="mb-2">
              <span className="font-medium text-slate-200">2.1 Ownership.</span>{" "}
              The Application, including its source code, object code,
              databases, user interface, design elements, predictive
              algorithms, mathematical engines, structural formulas, written
              content, and all other intellectual property (collectively, the
              &ldquo;Proprietary Property&rdquo;), is the sole and exclusive
              property of the Developer.
            </p>
            <p className="mb-2">
              <span className="font-medium text-slate-200">
                2.2 Limited License.
              </span>{" "}
              Subject to your continued compliance with these Terms, you are
              granted a limited, revocable, non-exclusive, non-transferable
              license to access and use the Application strictly for your
              personal, non-commercial use.
            </p>
            <p className="mb-2">
              <span className="font-medium text-slate-200">
                2.3 Prohibited Actions.
              </span>{" "}
              You agree that you will not:
            </p>
            <ul className="ml-4 list-disc space-y-1.5 text-slate-300">
              <li>
                Copy, modify, adapt, translate, or create derivative works based
                on the Application or any portion of it.
              </li>
              <li>
                Reverse-engineer, decompile, deconstruct, disassemble, or
                otherwise attempt to derive the source code, underlying logic,
                or structural models of the Application.
              </li>
              <li>
                Scrape, mine, or otherwise extract data, algorithms, or models
                from the Application by automated or manual means.
              </li>
            </ul>
            <p className="mt-2">
              Any unauthorized use of the Proprietary Property may result in
              immediate termination of your access to the Application and may
              give rise to civil and/or criminal liability.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-white">
              3. Data Storage &amp; Privacy
            </h2>
            <p className="mb-2">
              <span className="font-medium text-slate-200">
                3.1 Minimal Data Collection.
              </span>{" "}
              We collect and store only the account and chart-input information
              reasonably necessary to operate the service, including your
              registration email and certain birth-related chart inputs you
              choose to provide.
            </p>
            <p className="mb-2">
              <span className="font-medium text-slate-200">
                3.2 Data Storage and Processing.
              </span>{" "}
              The Application uses two forms of storage. Raw user birth details
              and related chart input data, including date, time, place,
              coordinates, and timezone, are stored in account metadata through
              our authentication and account infrastructure so the Application
              can regenerate chart calculations across sessions and devices.
              Separately, certain calculated chart outputs are stored locally in
              your browser for performance and convenience, and that local cache
              may expire or be cleared by your browser or device settings.
            </p>
            <p className="mb-2">
              <span className="font-medium text-slate-200">
                3.3 Privacy-First Design.
              </span>{" "}
              The Application is designed to limit unnecessary exposure of your
              personal chart data. We do not sell your personal chart inputs,
              journal information, or calculated outputs to data brokers or
              other third parties. We aim to collect and retain only the
              information reasonably necessary to operate, secure, and improve
              the service.
            </p>
            <p className="mb-2">
              <span className="font-medium text-slate-200">
                3.4 Limited Administrative Access.
              </span>{" "}
              Certain account information and raw chart inputs, including birth
              date, birth time, birth place, coordinates, and timezone, may be
              stored with our account and authentication provider as part of
              your account record. The Developer generally does not access this
              information in the ordinary course of providing the Application,
              but such data may be visible through administrative tools or
              accessed when reasonably necessary for account support, security,
              maintenance, legal compliance, or service operations.
            </p>
            <p className="mb-2">
              <span className="font-medium text-slate-200">
                3.5 Local Cache Behavior.
              </span>{" "}
              If local browser storage is deleted, unavailable, expired, or
              cleared, the Application will regenerate chart data using the
              account-level birth details associated with your profile.
            </p>
            <p>
              <span className="font-medium text-slate-200">
                3.6 No Data Monetization.
              </span>{" "}
              User inputs and account information are not sold, rented, or
              otherwise monetized through third-party data brokers. The
              Application does not use your user inputs for targeted advertising
              or commercial profiling.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-white">
              4. Nature of Outputs &amp; Risk Allocation
            </h2>
            <p className="mb-2">
              <span className="font-medium text-slate-200">
                4.1 Nature of Outputs.
              </span>{" "}
              The Application generates chart interpretations, temporal
              frameworks, and projected patterns using astronomical data,
              time-based calculations, algorithmic processing, and metaphysical
              interpretive models. These outputs are intended to provide
              structured insight, reflection, and guidance based on the
              Application&rsquo;s methodology, and are interpretive and
              model-based in nature rather than statements of guaranteed future
              fact.
            </p>
            <p className="mb-2">
              <span className="font-medium text-slate-200">
                4.2 User Responsibility and No Guaranteed Outcomes.
              </span>{" "}
              The Application&rsquo;s outputs reflect the operation of its
              underlying models and systems, but lived outcomes depend on many
              variables, including personal choices, external conditions, and
              events beyond the Developer&rsquo;s control. You remain solely
              responsible for any decisions, actions, or reliance based on the
              Application&rsquo;s content.
            </p>
            <p className="mb-2">
              <span className="font-medium text-slate-200">
                4.3 No Professional Advice.
              </span>{" "}
              The Application does not provide and is not intended to provide
              professional financial, medical, legal, psychological, or
              therapeutic advice. You agree not to rely on the Application as a
              substitute for professional consultations, and you should always
              seek the advice of qualified professionals regarding any decisions
              that may affect your financial status, health, legal rights, or
              personal safety.
            </p>
            <p>
              <span className="font-medium text-slate-200">
                4.4 Limitation of Liability.
              </span>{" "}
              To the maximum extent permitted by applicable law, the Application
              and all outputs, content, and features are provided &ldquo;as
              is&rdquo; and &ldquo;as available,&rdquo; without warranties of
              any kind. The Developer shall not be liable for any direct,
              indirect, incidental, consequential, special, exemplary, or
              punitive damages arising out of or relating to your use of, or
              inability to use, the Application. The total aggregate liability
              of the Developer for any claim arising out of or relating to the
              Application or these Terms shall be limited to the amount you have
              paid (if any) for access to the Application in the twelve (12)
              months preceding the event giving rise to the claim.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-white">
              5. User Conduct
            </h2>
            <p className="mb-2">
              You agree not to use the Application to:
            </p>
            <ul className="ml-4 list-disc space-y-1.5 text-slate-300">
              <li>Violate any applicable law, regulation, or court order.</li>
              <li>
                Upload or transmit any content that is unlawful, harmful,
                abusive, harassing, defamatory, or otherwise objectionable.
              </li>
              <li>
                Interfere with or disrupt the operation of the Application or
                any servers, networks, or systems connected to it.
              </li>
              <li>
                Attempt unauthorized access to other users&rsquo; accounts,
                data, or the Application&rsquo;s backend or infrastructure.
              </li>
            </ul>
            <p className="mt-2">
              The Developer reserves the right to suspend or terminate access to
              the Application if user conduct poses a risk to the service, other
              users, or third parties.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-white">
              6. Accounts, Access, and Security
            </h2>
            <p className="mb-2">
              <span className="font-medium text-slate-200">
                6.1 Account Registration.
              </span>{" "}
              To use certain features, you may be required to create an account
              using a valid email address. You agree to provide accurate and
              complete information and to keep your account information current.
            </p>
            <p className="mb-2">
              <span className="font-medium text-slate-200">
                6.2 Credentials.
              </span>{" "}
              You are responsible for maintaining the confidentiality of your
              login credentials and for all activities conducted under your
              account.
            </p>
            <p className="mb-2">
              <span className="font-medium text-slate-200">
                6.3 Account Termination by User.
              </span>{" "}
              You may stop using the Application at any time. Deleting your
              account may result in deletion or irreversible anonymization of
              your associated data, subject to any legal obligations to retain
              certain information.
            </p>
            <p>
              <span className="font-medium text-slate-200">
                6.4 Suspension and Termination by Developer.
              </span>{" "}
              The Developer may suspend or terminate your access to the
              Application if you violate these Terms, your use poses a security,
              legal, or operational risk, or the Application is discontinued or
              materially modified.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-white">
              7. Payments &amp; Subscriptions
            </h2>
            <p>
              Certain features of the Application require payment, including
              one-time reading purchases, follow-up questions, JXL sessions, and
              monthly subscriptions. Pricing is displayed at the time of
              purchase. Subscriptions renew automatically unless canceled before
              the next billing date. You may cancel through your account
              settings or any other method we make available. Cancellation stops
              future renewals only and does not retroactively refund charges
              already incurred, except where required by applicable law.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-white">
              8. Changes to the Application and Terms
            </h2>
            <p>
              The Developer may update the Application, introduce new features,
              or modify these Terms from time to time. Your continued use of the
              Application after the effective date of any changes constitutes
              your acceptance of the revised Terms.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-white">
              9. Governing Law and Dispute Resolution
            </h2>
            <p>
              These Terms shall be governed by and construed in accordance with
              the laws of the State of Washington, without regard to its
              conflict of laws principles. Any dispute arising out of or
              relating to these Terms or the Application shall be resolved in
              the state or federal courts located in King County, Washington,
              and you consent to the personal jurisdiction of such courts.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-white">
              10. Miscellaneous
            </h2>
            <p className="mb-2">
              <span className="font-medium text-slate-200">
                Entire Agreement.
              </span>{" "}
              These Terms constitute the entire agreement between you and the
              Developer regarding the Application.
            </p>
            <p className="mb-2">
              <span className="font-medium text-slate-200">
                Severability.
              </span>{" "}
              If any provision of these Terms is found to be invalid or
              unenforceable, the remaining provisions will remain in full force
              and effect.
            </p>
            <p className="mb-2">
              <span className="font-medium text-slate-200">No Waiver.</span> The
              failure to enforce any right or provision of these Terms shall not
              be deemed a waiver of such right or provision.
            </p>
            <p>
              <span className="font-medium text-slate-200">Assignment.</span>{" "}
              You may not assign or transfer these Terms or any rights or
              obligations under them without the Developer&rsquo;s prior written
              consent.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-white">
              11. Contact
            </h2>
            <p>
              Questions about these Terms can be directed to
              {" "}
              <span className="font-medium text-slate-200">
                support@astroproxl.com
              </span>
              .
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}