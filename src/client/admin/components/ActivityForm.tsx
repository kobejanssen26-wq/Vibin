import { useState } from "react";
import { Btn, Field, Input, Panel, Select } from "../ui";
import { ACTIVITY_CATEGORIES } from "@shared/constants";

const DAYS: [string, string][] = [
  ["mon", "Mon"],
  ["tue", "Tue"],
  ["wed", "Wed"],
  ["thu", "Thu"],
  ["fri", "Fri"],
  ["sat", "Sat"],
  ["sun", "Sun"],
];

export interface ActivityFormValues {
  title: string;
  description: string;
  categoryId: string;
  subcategory: string;
  provider: string;
  providerWebsite: string;
  locationLabel: string;
  address: string;
  city: string;
  country: string;
  lat: string;
  lng: string;
  priceType: string;
  priceCents: string;
  priceBand: string;
  durationMin: string;
  minParticipants: string;
  maxParticipants: string;
  minAge: string;
  indoorOutdoor: string;
  accessibility: string;
  hours: Record<string, string>;
  websiteUrl: string;
  bookingUrl: string;
  ticketUrl: string;
  imageUrl: string;
  imageSource: string;
  imageAttribution: string;
  tags: string;
  source: string;
  sourceUrl: string;
  status: string;
  active: boolean;
}

export const EMPTY_ACTIVITY_FORM: ActivityFormValues = {
  title: "",
  description: "",
  categoryId: ACTIVITY_CATEGORIES[0]!.id,
  subcategory: "",
  provider: "",
  providerWebsite: "",
  locationLabel: "",
  address: "",
  city: "",
  country: "BE",
  lat: "",
  lng: "",
  priceType: "per_person",
  priceCents: "",
  priceBand: "free",
  durationMin: "",
  minParticipants: "",
  maxParticipants: "",
  minAge: "",
  indoorOutdoor: "",
  accessibility: "",
  hours: {},
  websiteUrl: "",
  bookingUrl: "",
  ticketUrl: "",
  imageUrl: "",
  imageSource: "",
  imageAttribution: "",
  tags: "",
  source: "admin",
  sourceUrl: "",
  status: "needs_review",
  active: true,
};

/** Values -> the exact body shape activityInput (worker-side) expects. */
export function activityFormToBody(v: ActivityFormValues) {
  const numOrNull = (s: string) => (s.trim() === "" ? null : Number(s));
  const strOrNull = (s: string) => (s.trim() === "" ? null : s.trim());
  return {
    title: v.title.trim(),
    description: v.description.trim(),
    categoryId: v.categoryId,
    subcategory: strOrNull(v.subcategory),
    provider: strOrNull(v.provider),
    providerWebsite: strOrNull(v.providerWebsite),
    locationLabel: v.locationLabel.trim() || `${v.provider || v.title}, ${v.city}`.trim(),
    address: strOrNull(v.address),
    city: strOrNull(v.city),
    country: v.country.trim() || "BE",
    lat: numOrNull(v.lat),
    lng: numOrNull(v.lng),
    priceType: v.priceType,
    priceCents: numOrNull(v.priceCents),
    priceBand: v.priceBand,
    durationMin: numOrNull(v.durationMin),
    minParticipants: numOrNull(v.minParticipants),
    maxParticipants: numOrNull(v.maxParticipants),
    minAge: numOrNull(v.minAge),
    indoorOutdoor: v.indoorOutdoor || null,
    accessibility: strOrNull(v.accessibility),
    openingHours: Object.fromEntries(Object.entries(v.hours).filter(([, h]) => h.trim())),
    websiteUrl: strOrNull(v.websiteUrl),
    bookingUrl: strOrNull(v.bookingUrl),
    ticketUrl: strOrNull(v.ticketUrl),
    imageUrl: strOrNull(v.imageUrl),
    imageSource: strOrNull(v.imageSource),
    imageAttribution: strOrNull(v.imageAttribution),
    tags: v.tags.split(",").map((t) => t.trim()).filter(Boolean),
    source: v.source.trim() || "admin",
    sourceUrl: strOrNull(v.sourceUrl),
    status: v.status,
    active: v.active,
  };
}

export function ActivityForm({
  value,
  onChange,
  onSubmit,
  onCancel,
  submitLabel,
  busy,
  error,
}: {
  value: ActivityFormValues;
  onChange: (v: ActivityFormValues) => void;
  onSubmit: () => void;
  onCancel?: () => void;
  submitLabel: string;
  busy?: boolean;
  error?: string | null;
}) {
  const set = <K extends keyof ActivityFormValues>(k: K, v: ActivityFormValues[K]) =>
    onChange({ ...value, [k]: v });
  const [urlWarning, setUrlWarning] = useState<string | null>(null);

  const checkUrls = () => {
    if (value.websiteUrl && !value.bookingUrl && !value.ticketUrl) {
      setUrlWarning(
        "Only a website URL is set — that's fine, but don't add a booking/ticket CTA unless that page genuinely sells tickets.",
      );
    } else {
      setUrlWarning(null);
    }
  };

  return (
    <div className="space-y-4">
      <Panel title="A · Basic info">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Title *">
              <Input value={value.title} onChange={(e) => set("title", e.target.value)} />
            </Field>
          </div>
          <Field label="Category *">
            <Select value={value.categoryId} onChange={(e) => set("categoryId", e.target.value)}>
              {ACTIVITY_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Subcategory" hint="optional, free text">
            <Input value={value.subcategory} onChange={(e) => set("subcategory", e.target.value)} />
          </Field>
          <Field label="Provider / venue name">
            <Input value={value.provider} onChange={(e) => set("provider", e.target.value)} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Description">
              <textarea
                className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-[13px] focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                rows={3}
                value={value.description}
                onChange={(e) => set("description", e.target.value)}
              />
            </Field>
          </div>
        </div>
      </Panel>

      <Panel title="B · Location" subtitle="Coordinates must be the real location — never a random guess">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Address">
              <Input value={value.address} onChange={(e) => set("address", e.target.value)} />
            </Field>
          </div>
          <Field label="City">
            <Input value={value.city} onChange={(e) => set("city", e.target.value)} />
          </Field>
          <Field label="Country">
            <Input value={value.country} onChange={(e) => set("country", e.target.value.toUpperCase())} maxLength={2} />
          </Field>
          <Field label="Latitude" hint="decimal degrees, e.g. 50.8503">
            <Input value={value.lat} onChange={(e) => set("lat", e.target.value)} inputMode="decimal" />
          </Field>
          <Field label="Longitude" hint="decimal degrees, e.g. 4.3517">
            <Input value={value.lng} onChange={(e) => set("lng", e.target.value)} inputMode="decimal" />
          </Field>
          <Field label="Location label" hint="shown on the card, e.g. 'Venue name, City' — auto-filled if left blank">
            <Input value={value.locationLabel} onChange={(e) => set("locationLabel", e.target.value)} />
          </Field>
        </div>
      </Panel>

      <Panel
        title="C · Website & links"
        subtitle="Only mark something a booking/ticket link if that destination genuinely sells one"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Official website">
            <Input value={value.websiteUrl} onChange={(e) => set("websiteUrl", e.target.value)} onBlur={checkUrls} placeholder="https://…" />
          </Field>
          <Field label="Provider website" hint="if different from the official site above">
            <Input value={value.providerWebsite} onChange={(e) => set("providerWebsite", e.target.value)} placeholder="https://…" />
          </Field>
          <Field label="Booking URL">
            <Input value={value.bookingUrl} onChange={(e) => set("bookingUrl", e.target.value)} onBlur={checkUrls} placeholder="https://…" />
          </Field>
          <Field label="Ticket URL">
            <Input value={value.ticketUrl} onChange={(e) => set("ticketUrl", e.target.value)} onBlur={checkUrls} placeholder="https://…" />
          </Field>
        </div>
        {urlWarning && <p className="mt-2 text-xs text-amber-700">{urlWarning}</p>}
      </Panel>

      <Panel title="D · Image" subtitle="Only a real photo of this place/activity — never a stock or AI image passed off as real">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Image URL">
              <Input value={value.imageUrl} onChange={(e) => set("imageUrl", e.target.value)} placeholder="https://…" />
            </Field>
          </div>
          <Field label="Image source" hint="e.g. Wikimedia Commons, provider">
            <Input value={value.imageSource} onChange={(e) => set("imageSource", e.target.value)} />
          </Field>
          <Field label="Image attribution">
            <Input value={value.imageAttribution} onChange={(e) => set("imageAttribution", e.target.value)} />
          </Field>
        </div>
        {value.imageUrl && (
          <img src={value.imageUrl} alt="" className="mt-3 h-28 w-44 rounded object-cover" />
        )}
      </Panel>

      <Panel title="E · Price">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Price type">
            <Select value={value.priceType} onChange={(e) => set("priceType", e.target.value)}>
              <option value="free">Free</option>
              <option value="per_person">Per person</option>
              <option value="per_group">Per group</option>
              <option value="from_per_person">From (per person)</option>
              <option value="varies">Varies</option>
            </Select>
          </Field>
          <Field label="Price (cents)" hint="leave blank if unknown — never €0 as a guess">
            <Input
              value={value.priceCents}
              onChange={(e) => set("priceCents", e.target.value)}
              inputMode="numeric"
              disabled={value.priceType === "free"}
            />
          </Field>
          <Field label="Price band *">
            <Select value={value.priceBand} onChange={(e) => set("priceBand", e.target.value)}>
              <option value="free">Free</option>
              <option value="0_10">€0 - €10</option>
              <option value="10_25">€10 - €25</option>
              <option value="25_50">€25 - €50</option>
              <option value="50_100">€50 - €100</option>
              <option value="100_plus">€100+</option>
            </Select>
          </Field>
        </div>
      </Panel>

      <Panel title="F · Opening hours" subtitle="Leave a day blank if unknown — never invent hours">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {DAYS.map(([key, label]) => (
            <Field key={key} label={label}>
              <Input
                placeholder="9:00-18:00"
                value={value.hours[key] ?? ""}
                onChange={(e) => set("hours", { ...value.hours, [key]: e.target.value })}
              />
            </Field>
          ))}
        </div>
      </Panel>

      <Panel title="G · Logistics" bodyClassName="p-4">
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Duration (min)">
            <Input value={value.durationMin} onChange={(e) => set("durationMin", e.target.value)} inputMode="numeric" />
          </Field>
          <Field label="Min participants">
            <Input value={value.minParticipants} onChange={(e) => set("minParticipants", e.target.value)} inputMode="numeric" />
          </Field>
          <Field label="Max participants">
            <Input value={value.maxParticipants} onChange={(e) => set("maxParticipants", e.target.value)} inputMode="numeric" />
          </Field>
          <Field label="Min age">
            <Input value={value.minAge} onChange={(e) => set("minAge", e.target.value)} inputMode="numeric" />
          </Field>
          <Field label="Indoor / outdoor">
            <Select value={value.indoorOutdoor} onChange={(e) => set("indoorOutdoor", e.target.value)}>
              <option value="">Unspecified</option>
              <option value="indoor">Indoor</option>
              <option value="outdoor">Outdoor</option>
              <option value="both">Both</option>
            </Select>
          </Field>
          <div className="sm:col-span-3">
            <Field label="Accessibility notes">
              <Input value={value.accessibility} onChange={(e) => set("accessibility", e.target.value)} />
            </Field>
          </div>
          <div className="sm:col-span-4">
            <Field label="Tags" hint="comma-separated">
              <Input value={value.tags} onChange={(e) => set("tags", e.target.value)} />
            </Field>
          </div>
        </div>
      </Panel>

      <Panel title="H · Source & verification">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Source" hint="e.g. admin, osm, web">
            <Input value={value.source} onChange={(e) => set("source", e.target.value)} />
          </Field>
          <Field label="Source URL">
            <Input value={value.sourceUrl} onChange={(e) => set("sourceUrl", e.target.value)} placeholder="https://…" />
          </Field>
          <Field label="Status">
            <Select value={value.status} onChange={(e) => set("status", e.target.value)}>
              <option value="needs_review">Needs review</option>
              <option value="verified">Verified</option>
              <option value="outdated">Outdated</option>
              <option value="inactive">Inactive</option>
            </Select>
          </Field>
          <Field label="Active">
            <Select value={value.active ? "1" : "0"} onChange={(e) => set("active", e.target.value === "1")}>
              <option value="1">Active (visible in swipe)</option>
              <option value="0">Inactive (hidden)</option>
            </Select>
          </Field>
        </div>
      </Panel>

      {error && <p className="text-sm font-medium text-rose-600">{error}</p>}
      <div className="flex gap-2">
        <Btn variant="primary" loading={busy} onClick={onSubmit}>
          {submitLabel}
        </Btn>
        {onCancel && (
          <Btn variant="ghost" onClick={onCancel}>
            Cancel
          </Btn>
        )}
      </div>
    </div>
  );
}
