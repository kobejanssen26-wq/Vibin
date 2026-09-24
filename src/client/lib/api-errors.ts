import { getActiveLang } from "./i18n";

/**
 * The worker answers with fixed English error messages (src/worker/lib/errors.ts
 * and the routes). Users see them in forms and dialogs, so the user-facing ones
 * are re-rendered per language here, keyed by the exact English text. If the
 * worker's wording ever changes, that message simply falls back to English —
 * never a wrong translation (api-errors.test.ts also checks every key still
 * exists in the worker source). Admin/owner/setup messages stay English.
 */
const NL: Record<string, string> = {
  "You need to sign in.": "Je moet inloggen.",
  "You don't have access to this.": "Je hebt hier geen toegang toe.",
  "Not found.": "Niet gevonden.",
  "Too many requests. Slow down a little.": "Te veel verzoeken. Doe het even rustiger aan.",
  "Something went wrong on our side.": "Er ging iets mis aan onze kant.",
  "Some fields are invalid.": "Sommige velden zijn ongeldig.",
  "Invalid query parameters.": "Ongeldige zoekparameters.",
  "Invalid or missing CSRF token. Refresh and retry.": "Ongeldig of ontbrekend beveiligingstoken. Vernieuw de pagina en probeer opnieuw.",
  "An account with that email already exists.": "Er bestaat al een account met dat e-mailadres.",
  "Email or password is incorrect.": "E-mailadres of wachtwoord is onjuist.",
  "That email is already in use.": "Dat e-mailadres is al in gebruik.",
  "That's already your email.": "Dat is al je e-mailadres.",
  "Current password is incorrect.": "Huidig wachtwoord is onjuist.",
  "Password is incorrect.": "Wachtwoord is onjuist.",
  "Password re-entry failed.": "Het wachtwoord opnieuw invoeren is mislukt.",
  "This reset link is invalid or has expired.": "Deze resetlink is ongeldig of verlopen.",
  "This verification link is invalid or has expired.": "Deze verificatielink is ongeldig of verlopen.",
  "Group not found.": "Groep niet gevonden.",
  "That group doesn't exist.": "Die groep bestaat niet.",
  "That group is no longer available.": "Die groep is niet meer beschikbaar.",
  "Group isn't archived.": "De groep is niet gearchiveerd.",
  "That invite link isn't valid.": "Die uitnodigingslink is niet geldig.",
  "This invite link has already been used up.": "Deze uitnodigingslink is al opgebruikt.",
  "This invite link has been revoked.": "Deze uitnodigingslink is ingetrokken.",
  "This invite link has expired. Ask for a new one.": "Deze uitnodigingslink is verlopen. Vraag een nieuwe aan.",
  "Only the group creator can do that.": "Alleen de maker van de groep kan dat doen.",
  "You're not a member of this group.": "Je bent geen lid van deze groep.",
  "You're currently marked inactive in this group.": "Je staat momenteel als inactief in deze groep.",
  "That person isn't in this group.": "Die persoon zit niet in deze groep.",
  "You can't change your own status.": "Je kunt je eigen status niet wijzigen.",
  "Configure the group first.": "Stel eerst de groep in.",
  "Group has no settings yet.": "De groep heeft nog geen instellingen.",
  "Settings are locked once a plan is in progress.": "Instellingen zijn vergrendeld zodra er een plan loopt.",
  "Pick at least one category, or choose “All activities”.": "Kies minstens één categorie, of kies ‘Alle activiteiten’.",
  "Set up the group before swiping.": "Stel de groep in voor je begint te swipen.",
  "This group isn't swiping right now.": "Deze groep is momenteel niet aan het swipen.",
  "This group has already moved past swiping.": "Deze groep is al voorbij het swipen.",
  "Nothing to undo.": "Niets om ongedaan te maken.",
  "That card already matched — it can't be undone.": "Die kaart is al gematcht — dat kan niet ongedaan worden gemaakt.",
  "That activity isn't in this group's deck.": "Die activiteit zit niet in de stapel van deze groep.",
  "This group already has a plan — restarting would lose it.": "Deze groep heeft al een plan — opnieuw beginnen zou dat kwijtmaken.",
  "Activity not found.": "Activiteit niet gevonden.",
  "Plan not found.": "Plan niet gevonden.",
  "This plan doesn't have a confirmed date yet.": "Dit plan heeft nog geen bevestigde datum.",
  "Choose a specific date.": "Kies een specifieke datum.",
  "Pick a time at least an hour from now.": "Kies een tijdstip minstens een uur vanaf nu.",
  "That time is already an option.": "Dat tijdstip is al een optie.",
  "That's enough options — vote on these.": "Dat zijn genoeg opties — stem over deze.",
  "The date is already decided.": "De datum ligt al vast.",
  "The date is already locked in for this plan.": "De datum ligt al vast voor dit plan.",
  "No match is waiting on a date yet.": "Er wacht nog geen match op een datum.",
  "No match is waiting on a date.": "Er wacht nog geen match op een datum.",
  "That date option doesn't belong to this group.": "Die datumoptie hoort niet bij deze groep.",
  "This activity has no outbound link of that kind.": "Deze activiteit heeft geen link van dat type.",
  "Image must be under 5 MB.": "De afbeelding moet kleiner zijn dan 5 MB.",
  "Use a JPEG, PNG or WebP image.": "Gebruik een JPEG-, PNG- of WebP-afbeelding.",
  "No file uploaded.": "Geen bestand geüpload.",
  "Image not found.": "Afbeelding niet gevonden.",
  "This ticket is closed. Start a new one.": "Dit gesprek is gesloten. Begin een nieuw gesprek.",
  "Ticket not found.": "Gesprek niet gevonden.",
  "Report not found.": "Melding niet gevonden.",
  "You cannot delete your own account.": "Je kunt je eigen account niet verwijderen.",
  "Account not found.": "Account niet gevonden.",
  "User not found.": "Account niet gevonden.",
  "Nothing to update.": "Niets om bij te werken.",
  "Thanks — our team will take a look.": "Bedankt — ons team kijkt ernaar.",
};

const PATTERNS_NL: [RegExp, (m: RegExpExecArray) => string][] = [
  [/^Groups are capped at (\d+) members\.$/, (m) => `Groepen zijn beperkt tot ${m[1]} leden.`],
];

/** Exported for the drift test. */
export const API_ERROR_KEYS = Object.keys(NL);

export function localizeApiError(message: string): string {
  if (getActiveLang() !== "nl") return message;
  const hit = NL[message];
  if (hit) return hit;
  for (const [re, fn] of PATTERNS_NL) {
    const m = re.exec(message);
    if (m) return fn(m);
  }
  return message;
}
