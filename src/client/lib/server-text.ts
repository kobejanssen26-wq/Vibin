import { translate, type Key } from "./i18n";

/**
 * The worker stores group-chat system messages and notification titles/bodies
 * as final English strings built from a small fixed set of templates
 * (engine-run.ts, groups.ts, invites.ts, votes.ts, messages.ts, dates.ts,
 * admin-support.ts). Each rule below mirrors one of those templates; on a
 * match the text is re-rendered in the active language, otherwise it is shown
 * exactly as stored. If a server template changes, its rule simply stops
 * matching and the English text keeps showing — never a wrong translation.
 */
const RULES: [RegExp, Key, string[]][] = [
  [/^Group "(.+)" created\. Invite your crew!$/, "srv.groupCreated", ["name"]],
  [/^Swiping has started — (\d+) activities in the deck\. Everyone needs to like the same one for it to match\. 🔥$/, "srv.swipingStarted", ["n"]],
  [/^Someone left the group\.$/, "srv.someoneLeft", []],
  [/^(.+) joined the group\. 👋$/, "srv.joined", ["name"]],
  [/^🔥 Everyone matched on (.+)!$/, "srv.matched", ["title"]],
  [/^🎉 It's a plan! (.+) is locked in\.$/, "srv.planLocked", ["title"]],
  [/^📅 (.+) is closed at your usual time — pick a real time below\.$/, "srv.closedUsual", ["title"]],
  [/^📅 Now let's find a date for (.+) — vote on the options\.$/, "srv.findDate", ["title"]],
  [/^📅 Everyone agreed on (.+)! It's a plan\. 🎉$/, "srv.dateAgreed", ["label"]],
  [/^A new date option was added: (.+)$/, "srv.dateOptionAdded", ["label"]],
  [/^The swipe session was restarted — everyone can vote again\.$/, "srv.swipeReset", []],

  [/^It's a plan — (.+)!$/, "srv.n.planTitle", ["title"]],
  [/^Everyone's going\. Open the plan for details\.$/, "srv.n.planBody", []],
  [/^Date voting started for (.+)$/, "srv.n.dateVotingTitle", ["title"]],
  [/^Say which times work for you\.$/, "srv.n.dateVotingBody", []],
  [/^Date locked: (.+)$/, "srv.n.dateLockedTitle", ["label"]],
  [/^(.+) is fully planned\.$/, "srv.n.fullyPlanned", ["title"]],
  [/^VIBIN support replied$/, "srv.n.supportReplied", []],
  [/^Swiping started in (.+)$/, "srv.n.swipingStartedTitle", ["name"]],
  [/^Open VIBIN and start swiping\.$/, "srv.n.swipingStartedBody", []],
  [/^(.+) joined (.+)$/, "srv.n.memberJoined", ["name", "group"]],
  [/^(.+) in the group chat$/, "srv.n.chatMessage", ["name"]],
];

export function localizeServerText(text: string): string {
  for (const [re, key, names] of RULES) {
    const m = re.exec(text);
    if (m) return translate(key, Object.fromEntries(names.map((n, i) => [n, m[i + 1]!])));
  }
  return text;
}
