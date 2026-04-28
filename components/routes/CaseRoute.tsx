"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import {
  ConversationComposer,
  ConversationPanel,
} from "@/components/workspace/ConversationPanel";
import { useWorkspace } from "@/components/providers/WorkspaceProvider";

export function CaseRoute({ caseId }: { caseId: string }) {
  const {
    cases,
    pendingCaseIds,
    sendMessage,
    setActiveCaseId,
    uploadFiles,
  } = useWorkspace();

  useEffect(() => {
    setActiveCaseId(caseId);
  }, [caseId, setActiveCaseId]);

  const migrationCase = cases.find((item) => item.id === caseId) ?? null;

  if (!migrationCase) {
    return (
      <div className="app-surface rounded-[2rem] p-6">
        <p className="line-label">Case</p>
        <h1 className="mt-4 text-3xl font-medium tracking-[-0.06em] text-white">
          Case not found
        </h1>
        <Link
          href="/workspace"
          className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm text-white/72"
        >
          <ArrowLeft className="size-4" />
          Back to home
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-6rem)] flex-col gap-6">
      <div className="flex-1">
        <ConversationPanel activeCase={migrationCase} isPending={pendingCaseIds.has(caseId)} />
      </div>
      <div className="mt-auto">
        <ConversationComposer
          activeCase={migrationCase}
          onSendMessage={sendMessage}
          onUploadFiles={uploadFiles}
        />
      </div>
    </div>
  );
}
