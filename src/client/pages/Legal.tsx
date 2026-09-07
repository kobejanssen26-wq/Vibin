import { Link } from "react-router-dom";
import { Wordmark } from "../components/Logo";

export function Legal({ tab }: { tab: "privacy" | "terms" }) {
  return (
    <div className="mx-auto max-w-2xl px-5 py-10">
      <Link to="/" className="mb-6 inline-block">
        <Wordmark />
      </Link>
      <div className="mb-6 flex gap-2 text-sm font-semibold">
        <Link
          to="/privacy"
          className={tab === "privacy" ? "chip-on" : "chip"}
        >
          Privacy Policy
        </Link>
        <Link to="/terms" className={tab === "terms" ? "chip-on" : "chip"}>
          Terms of Service
        </Link>
      </div>

      {tab === "privacy" ? <Privacy /> : <Terms />}

      <p className="mt-10 text-xs text-navy-400">
        This is a template covering VIBIN’s actual data practices for the MVP.
        Have a lawyer review it before a public launch.
      </p>
    </div>
  );
}

const P = ({ children }: { children: React.ReactNode }) => (
  <p className="mt-3 text-sm leading-relaxed text-navy-700">{children}</p>
);
const H = ({ children }: { children: React.ReactNode }) => (
  <h2 className="mt-7 text-lg font-bold">{children}</h2>
);

function Privacy() {
  return (
    <article>
      <h1 className="text-2xl font-extrabold">Privacy Policy</h1>
      <P>Last updated: {new Date().toISOString().slice(0, 10)}</P>
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
      <P>Last updated: {new Date().toISOString().slice(0, 10)}</P>
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
