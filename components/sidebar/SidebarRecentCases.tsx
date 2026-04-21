"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { useWorkspace } from "@/components/providers/WorkspaceProvider";
import { cn } from "@/lib/utils";

const historicalChats = [
  { label: "Migration Run 01", caseId: "volt-flow" },
  { label: "Migration Run 02", caseId: "clover-sa" },
  { label: "Foundation CRM", caseId: "foundation-crm" },
  { label: "Generocity Intake", caseId: "foundation-crm" },
  { label: "Lumen-1 Intake", caseId: "foundation-solar-hub" },
] as const;

export function SidebarRecentCases() {
  const pathname = usePathname();
  const { cases } = useWorkspace();
  const availableCaseIds = new Set(cases.map((migrationCase) => migrationCase.id));
  const visibleChats = historicalChats.filter((chat) => availableCaseIds.has(chat.caseId));

  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.02] p-4">
      <div className="flex items-center justify-between">
        <p className="line-label">Case History</p>
        <span className="text-xs text-white/38">{visibleChats.length}</span>
      </div>
      <div className="mt-4 flex flex-col gap-2">
        {visibleChats.map((chat, index) => (
          <Link
            key={`${chat.label}-${index}`}
            href={`/case/${chat.caseId}`}
            className={cn(
              "group rounded-[1rem] border px-3 py-3 text-left transition-all duration-200",
              pathname === `/case/${chat.caseId}`
                ? "border-white/18 bg-white/[0.06]"
                : "border-white/8 bg-black/40 hover:border-white/14 hover:bg-white/[0.03]",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-white">{chat.label}</p>
                <p className="mt-1 text-xs leading-5 text-white/44">
                  Session {String(index + 1).padStart(2, "0")}
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
