"use client";

import { Building2, MapPin, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/components/providers/WorkspaceProvider";
import { caseStageLabels } from "@/lib/types";

export function WorkspaceSwitcher() {
  const router = useRouter();
  const { activeCase, cases, createBusinessCase } = useWorkspace();

  const totalLocations = cases.reduce(
    (count, migrationCase) => count + migrationCase.business.locations.length,
    0,
  );
  const visibleLocations = activeCase?.business.locations ?? [];
  const locationPreview = visibleLocations
    .slice(0, 2)
    .map((location) => location.label || location.city || "Location pending")
    .join(" • ");

  const handleCreateBusiness = () => {
    createBusinessCase();
    router.push("/workspace");
  };

  return (
    <div className="rounded-[1.2rem] border border-white/10 bg-white/[0.03] p-4">
      <div className="rounded-[1rem] border border-white/8 bg-black/60 px-3 py-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[0.62rem] uppercase tracking-[0.32em] text-white/42">
              Business Portfolio
            </p>
            <p className="mt-2 text-sm font-medium text-white">
              {activeCase?.business.name ?? "No business selected"}
            </p>
          </div>
          <button
            type="button"
            onClick={handleCreateBusiness}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/16 bg-white/[0.05] px-3 py-1.5 text-[0.62rem] font-medium uppercase tracking-[0.18em] text-white transition hover:border-white/28 hover:bg-white/[0.08]"
          >
            <Plus className="size-3.5" />
            Add business
          </button>
        </div>

        <p className="mt-2 text-xs leading-5 text-white/48">
          {cases.length} businesses registered across {totalLocations} locations.
        </p>

        {activeCase ? (
          <>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/14 px-2.5 py-1 text-[0.62rem] uppercase tracking-[0.18em] text-white/58">
                <Building2 className="size-3.5" />
                {caseStageLabels[activeCase.stage]}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/14 px-2.5 py-1 text-[0.62rem] uppercase tracking-[0.18em] text-white/58">
                <MapPin className="size-3.5" />
                {visibleLocations.length} location{visibleLocations.length === 1 ? "" : "s"}
              </span>
            </div>
            <p className="mt-3 text-xs leading-5 text-white/48">
              {locationPreview || "Add your first registered location in the profile screen."}
              {visibleLocations.length > 2 ? ` +${visibleLocations.length - 2} more` : ""}
            </p>
          </>
        ) : (
          <p className="mt-3 text-xs leading-5 text-white/48">
            Create your first business and Dawn will open a new registration thread immediately.
          </p>
        )}
      </div>
    </div>
  );
}
