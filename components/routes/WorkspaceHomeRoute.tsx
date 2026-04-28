"use client";

import Link from "next/link";
import {
  ConversationComposer,
  ConversationPanel,
} from "@/components/workspace/ConversationPanel";
import { useWorkspace } from "@/components/providers/WorkspaceProvider";

export function WorkspaceHomeRoute() {
  const {
    activeCase,
    activeCaseId,
    pendingCaseIds,
    sendMessage,
    uploadFiles,
  } = useWorkspace();

  if (!activeCase || !activeCaseId) {
    return (
      <div className="app-surface rounded-[2rem] p-6">
        <p className="line-label">Workspace</p>
        <h1 className="mt-4 text-3xl font-medium tracking-[-0.06em] text-white">
          Your 1OS workspace is ready
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-white/64">
          There is no active case loaded yet. Start by completing your profile or uploading the
          first document pack so Dawn can open the migration workflow.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/settings"
            className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-black transition hover:bg-white/90"
          >
            Open profile
          </Link>
          <Link
            href="/documents"
            className="rounded-full border border-white/12 px-5 py-2 text-sm font-medium text-white/78 transition hover:bg-white/5"
          >
            Open documents
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-6rem)] flex-col gap-6">
      <div className="flex-1">
        <ConversationPanel activeCase={activeCase} isPending={pendingCaseIds.has(activeCaseId)} />
      </div>
      <div className="mt-auto">
        <ConversationComposer
          activeCase={activeCase}
          onSendMessage={sendMessage}
          onUploadFiles={uploadFiles}
        />
      </div>
    </div>
  );
}
