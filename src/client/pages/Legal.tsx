import { Link } from "react-router-dom";
import { IconArrowLeft } from "../components/icons";
import { useLang } from "../lib/i18n";

/** Date these documents were last revised. Bump when the text below changes. */
const LAST_UPDATED = "2026-09-09";

export function Legal({ tab }: { tab: "privacy" | "terms" }) {
  const { t, lang } = useLang();
  return (
    <div className="mx-auto max-w-2xl px-5 py-10">
      <Link
        to="/"
        className="mb-8 inline-flex items-center gap-1 text-sm font-semibold text-navy-500 hover:text-navy"
      >
        <IconArrowLeft size={16} /> {t("contact.back")}
      </Link>

      <div className="mb-8 inline-flex gap-1 rounded-2xl border border-paper-line bg-paper-soft p-1 text-sm font-semibold">
        <Link
          to="/privacy"
          className={`rounded-xl px-4 py-2 transition-colors ${
            tab === "privacy"
              ? "bg-paper-card text-navy shadow-sm"
              : "text-navy-400 hover:text-navy"
          }`}
        >
          {t("footer.privacy")}
        </Link>
        <Link
          to="/terms"
          className={`rounded-xl px-4 py-2 transition-colors ${
            tab === "terms"
              ? "bg-paper-card text-navy shadow-sm"
              : "text-navy-400 hover:text-navy"
          }`}
        >
          {t("footer.terms")}
        </Link>
      </div>

      {lang !== "en" && (
        <p className="mb-4 rounded-xl bg-paper-soft px-4 py-3 text-sm text-navy-500">
          {t("legal.englishOnly")}
        </p>
      )}

      <article className="card p-6 sm:p-8">
        {tab === "privacy" ? <Privacy /> : <Terms />}
      </article>

      <p className="mt-6 px-1 text-xs text-navy-400">
        This is a template covering VIBIN's actual data practices for the MVP.
        Have a lawyer review it before a public launch.
      </p>
    </div>
  );
}

const P = ({ children }: { children: React.ReactNode }) => (
  <p className="mt-3 text-sm leading-relaxed text-navy-500">{children}</p>
);
const H = ({ children }: { children: React.ReactNode }) => (
  <h2 className="mt-7 text-base font-bold first:mt-0">{children}</h2>
);

function Privacy() {
  return (
    <article>
      <h1 className="text-2xl font-extrabold">Privacy Policy</h1>
      <P>Last updated: {LAST_UPDATED}</P>
      <H>What we collect</H>
      <P>
        Account data: your email address and a hashed password. Profile data you
        choose to add: display name, photo, and optionally age, location label
        and a short bio. Usage data needed to run the product: the groups you
        belong to, your swipes and votes, and messages you send in a group.
      </P>
      <H>What we do not collect</H>
      <P>
        We do not track your precise location continuously. Location is only a
        text label or coordinates you enter for a group. We do not sell personal
        data and we do not use third-party advertising trackers.
      </P>
      <H>How votes are used</H>
      <P>
        Your individual activity votes are used only to compute the group
        result. VIBIN shows the collective outcome to the group — it does not
        reveal who voted “no”.
      </P>
      <H>Legal basis (GDPR)</H>
      <P>
        We process your data to perform the service you asked for (Art. 6(1)(b))
        and, for security and abuse prevention, on the basis of our legitimate
        interest (Art. 6(1)(f)).
      </P>
      <H>Your rights</H>
      <P>
        You can export all your data as JSON and permanently delete your account
        from Profile &amp; settings. Deletion removes your profile, memberships,
        votes and tokens. You may also contact us to exercise any GDPR right.
      </P>
      <H>Retention</H>
      <P>
        Data is kept while your account is active. When you delete your account,
        personal data is removed immediately; group content you created may be
        retained in anonymised form so other members’ plans stay intact.
      </P>
      <H>Contact</H>
      <P>privacy@vibin.be</P>
    </article>
  );
}

function Terms() {
  return (
    <article>
      <h1 className="text-2xl font-extrabold">Terms of Service</h1>
      <P>Last updated: {LAST_UPDATED}</P>
      <H>The service</H>
      <P>
        VIBIN helps groups decide what to do together. Activity information in
        VIBIN is provided for planning only and is not a live availability or
        pricing guarantee. Always confirm with the provider before booking.
      </P>
      <H>Your account</H>
      <P>
        You are responsible for keeping your login secure and for activity in
        your groups. Don’t use VIBIN to harass others, post illegal content, or
        abuse the platform.
      </P>
      <H>Content</H>
      <P>
        You keep ownership of messages and content you post. You grant VIBIN the
        licence needed to display it to your group members.
      </P>
      <H>Bookings and payments</H>
      <P>
        VIBIN does not process payments or bookings. Any purchase happens on the
        provider’s own website under their terms.
      </P>
      <H>Liability</H>
      <P>
        VIBIN is provided “as is” during this early phase. To the extent
        permitted by law, we are not liable for plans that fall through,
        inaccurate activity data, or third-party providers.
      </P>
      <H>Changes</H>
      <P>
        We may update these terms as the product develops. Material changes will
        be announced in the app.
      </P>
      <H>Contact</H>
      <P>hello@vibin.be</P>
    </article>
  );
}
