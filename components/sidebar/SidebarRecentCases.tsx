"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { useWorkspace } from "@/components/providers/WorkspaceProvider";
import { caseStageLabels } from "@/lib/types";
import { cn } from "@/lib/utils";

function targetHref(pathname: string, caseId: string) {
  if (pathname.startsWith("/documents")) {
    return "/documents";
  }

  if (pathname.startsWith("/settings")) {
    return "/settings";
  }

  if (pathname === "/" || pathname === "/workspace") {
    return "/workspace";
  }

  return `/case/${caseId}`;
}

export function SidebarRecentCases() {
  const pathname = usePathname();
  const { activeCaseId, cases, setActiveCaseId } = useWorkspace();
  const visibleCases = [...cases].sort((left, right) => {
    if (left.id === activeCaseId) {
      return -1;
    }

    if (right.id === activeCaseId) {
      return 1;
    }

    return 0;
  });

  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.02] p-4">
      <div className="flex items-center justify-between">
        <p className="line-label">Businesses</p>
        <span className="text-xs text-white/38">{visibleCases.length}</span>
      </div>
      <div className="mt-4 flex flex-col gap-2">
        {visibleCases.map((migrationCase) => (
          <Link
            key={migrationCase.id}
            href={targetHref(pathname, migrationCase.id)}
            onClick={() => setActiveCaseId(migrationCase.id)}
            className={cn(
              "group rounded-[1rem] border px-3 py-3 text-left transition-all duration-200",
              activeCaseId === migrationCase.id
                ? "border-white/18 bg-white/[0.06]"
                : "border-white/8 bg-black/40 hover:border-white/14 hover:bg-white/[0.03]",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-white">
                  {migrationCase.business.name || "New business"}
                </p>
                <p className="mt-1 text-xs leading-5 text-white/44">
                  {migrationCase.business.locations.length} location
                  {migrationCase.business.locations.length === 1 ? "" : "s"} •{" "}
                  {caseStageLabels[migrationCase.stage]}
                </p>
              </div>
              <ArrowUpRight className="mt-0.5 size-4 text-white/38 transition-colors group-hover:text-white/68" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
