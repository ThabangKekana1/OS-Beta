"use client";

import { useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { Plus, Save, Trash2, UserCircle } from "lucide-react";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { useWorkspace } from "@/components/providers/WorkspaceProvider";
import { makeId } from "@/lib/formatting";
import type { MigrationCase } from "@/lib/types";

type LocationFormState = {
  id: string;
  label: string;
  address: string;
  city: string;
  province: string;
};

type FormState = {
  name: string;
  legalName: string;
  sector: string;
  decisionMaker: string;
  monthlySpendZar: string;
  averageMonthlyUsageKwh: string;
  locations: LocationFormState[];
};

function emptyLocation(index: number = 0): LocationFormState {
  return {
    id: makeId("location"),
    label: index === 0 ? "Primary location" : `Location ${index + 1}`,
    address: "",
    city: "",
    province: "",
  };
}

function normalizeNumberDraft(value: number) {
  return value > 0 ? String(value) : "";
}

function formStateFromCase(activeCase: MigrationCase): FormState {
  const business = activeCase.business;
  const locations =
    business.locations.length > 0
      ? business.locations.map((location) => ({
          id: location.id,
          label: location.label,
          address: location.address,
          city: location.city,
          province: location.province,
        }))
      : [emptyLocation()];

  return {
    name: business.name,
    legalName: business.legalName,
    sector: business.sector,
    decisionMaker: business.decisionMaker,
    monthlySpendZar: normalizeNumberDraft(business.monthlySpendZar),
    averageMonthlyUsageKwh: normalizeNumberDraft(business.averageMonthlyUsageKwh),
    locations: locations.map((location, index) => ({
      ...location,
      label: location.label || (index === 0 ? "Primary location" : `Location ${index + 1}`),
    })),
  };
}

export function ProfileView() {
  const { activeCase, updateBusinessProfile } = useWorkspace();

  if (!activeCase) {
    return (
      <div className="rounded-[1.5rem] border border-white/10 bg-[rgba(8,8,8,0.78)] p-8 text-center text-white/64">
        Select a business from the left rail to view its profile.
      </div>
    );
  }

  return (
    <ProfileEditor
      key={activeCase.id}
      activeCase={activeCase}
      updateBusinessProfile={updateBusinessProfile}
    />
  );
}

function ProfileEditor({
  activeCase,
  updateBusinessProfile,
}: {
  activeCase: MigrationCase;
  updateBusinessProfile: (
    caseId: string,
    updates: Partial<MigrationCase["business"]>,
  ) => void;
}) {
  const [form, setForm] = useState<FormState>(() => formStateFromCase(activeCase));
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const locations = form.locations.map((location, index) => ({
      id: location.id || makeId("location"),
      label: location.label.trim() || (index === 0 ? "Primary location" : `Location ${index + 1}`),
      address: location.address.trim(),
      city: location.city.trim(),
      province: location.province.trim(),
    }));
    const primaryLocation = locations[0] ?? emptyLocation();

    updateBusinessProfile(activeCase.id, {
      name: form.name.trim() || activeCase.business.name,
      legalName: form.legalName.trim(),
      sector: form.sector.trim(),
      decisionMaker: form.decisionMaker.trim(),
      location: primaryLocation.city,
      province: primaryLocation.province,
      locations,
      monthlySpendZar: Number(form.monthlySpendZar) || 0,
      averageMonthlyUsageKwh: Number(form.averageMonthlyUsageKwh) || 0,
      siteCount: Math.max(1, locations.length),
    });
    setSavedAt(new Date().toLocaleTimeString());
  };

  const setField = (key: Exclude<keyof FormState, "locations">) => (event: ChangeEvent<HTMLInputElement>) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  const setLocationField =
    (locationId: string, key: keyof LocationFormState) => (event: ChangeEvent<HTMLInputElement>) =>
      setForm((current) => ({
        ...current,
        locations: current.locations.map((location) =>
          location.id === locationId ? { ...location, [key]: event.target.value } : location,
        ),
      }));

  const addLocation = () => {
    setForm((current) => ({
      ...current,
      locations: [...current.locations, emptyLocation(current.locations.length)],
    }));
  };

  const removeLocation = (locationId: string) => {
    setForm((current) => {
      const nextLocations = current.locations.filter((location) => location.id !== locationId);

      return {
        ...current,
        locations: nextLocations.length > 0 ? nextLocations : [emptyLocation()],
      };
    });
  };

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-3">
        <div>
          <p className="line-label">Profile</p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-[-0.02em] text-white">
            {activeCase.business.name}
          </h1>
          <p className="mt-1 text-sm text-white/60">
            Keep each business and registered location current. 1OS uses this for multi-site
            qualification, proposals, and term sheets.
          </p>
        </div>
        <span className="hidden items-center gap-2 rounded-full border border-white/14 bg-white/[0.04] px-3 py-1.5 text-[0.65rem] uppercase tracking-[0.2em] text-white/68 sm:inline-flex">
          <UserCircle className="size-3.5" /> Customer profile
        </span>
      </header>

      <form
        onSubmit={handleSubmit}
        className="space-y-6 rounded-[1.5rem] border border-white/10 bg-[rgba(8,8,8,0.84)] p-5 shadow-[0_24px_60px_rgba(0,0,0,0.42)]"
      >
        <section className="rounded-[1.2rem] border border-white/10 bg-black/35 p-4">
          <p className="line-label">Session</p>
          <p className="mt-2 text-sm text-white/58">
            Need to switch accounts? Sign out of the Dawn workspace here.
          </p>
          <div className="mt-4">
            <SignOutButton />
          </div>
        </section>

        <Section title="Business">
          <Field label="Trading name" value={form.name} onChange={setField("name")} />
          <Field label="Legal name" value={form.legalName} onChange={setField("legalName")} />
          <Field label="Sector" value={form.sector} onChange={setField("sector")} />
          <Field label="Decision maker" value={form.decisionMaker} onChange={setField("decisionMaker")} />
        </Section>

        <fieldset className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="line-label">Locations</p>
            <button
              type="button"
              onClick={addLocation}
              className="inline-flex items-center gap-2 rounded-full border border-white/16 bg-white/[0.04] px-4 py-2 text-[0.62rem] font-medium uppercase tracking-[0.18em] text-white/84 transition hover:border-white/26 hover:bg-white/[0.07]"
            >
              <Plus className="size-3.5" />
              Add location
            </button>
          </div>

          <div className="space-y-4">
            {form.locations.map((location, index) => (
              <div
                key={location.id}
                className="rounded-[1.2rem] border border-white/10 bg-black/35 p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-white">
                      {location.label.trim() || `Location ${index + 1}`}
                    </p>
                    <p className="mt-1 text-xs text-white/46">
                      {index === 0 ? "Primary registered location" : "Additional registered location"}
                    </p>
                  </div>
                  {form.locations.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => removeLocation(location.id)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-white/12 px-3 py-1.5 text-[0.62rem] uppercase tracking-[0.18em] text-white/70 transition hover:border-white/24 hover:text-white"
                    >
                      <Trash2 className="size-3.5" />
                      Remove location
                    </button>
                  ) : null}
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <Field
                    label="Location name"
                    value={location.label}
                    onChange={setLocationField(location.id, "label")}
                  />
                  <Field
                    label="Street address"
                    value={location.address}
                    onChange={setLocationField(location.id, "address")}
                  />
                  <Field
                    label="City / Suburb"
                    value={location.city}
                    onChange={setLocationField(location.id, "city")}
                  />
                  <Field
                    label="Province"
                    value={location.province}
                    onChange={setLocationField(location.id, "province")}
                  />
                </div>
              </div>
            ))}
          </div>
        </fieldset>

        <Section title="Energy footprint">
          <Field
            label="Monthly spend (ZAR)"
            type="number"
            value={form.monthlySpendZar}
            onChange={setField("monthlySpendZar")}
          />
          <Field
            label="Avg monthly usage (kWh)"
            type="number"
            value={form.averageMonthlyUsageKwh}
            onChange={setField("averageMonthlyUsageKwh")}
          />
          <ReadOnlyField
            label="Registered locations"
            value={`${form.locations.length} location${form.locations.length === 1 ? "" : "s"}`}
          />
        </Section>

        <div className="flex items-center justify-between gap-3 border-t border-white/8 pt-5">
          <p className="text-xs text-white/48">
            {savedAt ? `Saved at ${savedAt}` : "Changes are saved to your workspace."}
          </p>
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white px-5 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-black transition hover:bg-white/85"
          >
            <Save className="size-3.5" />
            Save Profile
          </button>
        </div>
      </form>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-3">
      <legend className="line-label">{title}</legend>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  type?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[0.62rem] font-medium uppercase tracking-[0.22em] text-white/54">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={onChange}
        className="h-10 rounded-[0.9rem] border border-white/12 bg-black/55 px-3 text-sm text-white outline-none transition focus:border-white/32"
      />
    </label>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[0.62rem] font-medium uppercase tracking-[0.22em] text-white/54">
        {label}
      </span>
      <div className="flex h-10 items-center rounded-[0.9rem] border border-white/12 bg-black/35 px-3 text-sm text-white/74">
        {value}
      </div>
    </div>
  );
}
