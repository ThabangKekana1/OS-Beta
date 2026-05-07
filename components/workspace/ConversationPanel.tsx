"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { AnimatePresence, m } from "framer-motion";
import { UploadCloud } from "lucide-react";
import { DawnAvatar } from "./DawnAvatar";
import {
  AttachmentButton,
  ComposerInput,
  SendMessageButton,
  SystemMessage,
  UserMessage,
} from "./WorkspacePrimitives";
import {
  workspaceUploadCategories,
  type WorkspaceUploadCategory,
} from "@/components/providers/WorkspaceProvider";
import { type MigrationCase } from "@/lib/types";

const DEFAULT_PLACEHOLDER = "Ask anything about your migration, Foundation-1, Generocity, or Lumen-1...";

type ConversationPanelProps = {
  activeCase: MigrationCase | null;
  isPending?: boolean;
};

export function ConversationPanel({ activeCase, isPending = false }: ConversationPanelProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) {
      return;
    }

    node.scrollTop = node.scrollHeight;
  }, [activeCase?.messages.length, isPending]);

  return (
    <section
      id="conversation-feed"
      className="rounded-[2rem] border border-white/10 bg-[rgba(3,3,3,0.84)] p-4 shadow-[0_30px_80px_rgba(0,0,0,0.48)] backdrop-blur-2xl lg:p-5"
    >
      <div
        ref={scrollRef}
        className="scroll-shadow flex max-h-[62vh] flex-col gap-4 overflow-y-auto pr-1"
      >
        {activeCase ? (
          activeCase.messages.map((message) =>
            message.type === "user" ? (
              <UserMessage
                key={message.id}
                content={message.content}
                timestamp={message.timestamp}
              />
            ) : message.type === "internal" ? (
              <SystemMessage
                key={message.id}
                title={message.title}
                content={message.content}
                timestamp={message.timestamp}
                variant="internal"
              />
            ) : (
              <SystemMessage
                key={message.id}
                title={message.title}
                content={message.content}
                timestamp={message.timestamp}
                variant={message.type === "assistant" ? "assistant" : "system"}
              />
            ),
          )
        ) : (
          <SystemMessage
            title="No Business Selected"
            content="Select one business from the left rail, then start chatting."
            timestamp="Now"
            variant="system"
          />
        )}

        {isPending ? <TypingIndicator /> : null}
      </div>
    </section>
  );
}

function TypingIndicator() {
  return (
    <div className="max-w-[42rem] rounded-[1.4rem] border border-white/10 bg-white/[0.04] px-5 py-4">
      <div className="flex items-center gap-3 text-[0.66rem] uppercase tracking-[0.26em] text-white/46">
        <DawnAvatar />
        <span>Dawn</span>
      </div>
      <div className="mt-3 flex items-center gap-2 text-sm font-medium text-white/72" aria-live="polite">
        <span>Thinking</span>
        <span className="inline-block size-2 animate-pulse rounded-full bg-white/40" style={{ animationDelay: "0ms" }} />
        <span className="inline-block size-2 animate-pulse rounded-full bg-white/40" style={{ animationDelay: "200ms" }} />
        <span className="inline-block size-2 animate-pulse rounded-full bg-white/40" style={{ animationDelay: "400ms" }} />
      </div>
    </div>
  );
}

type ConversationComposerProps = {
  activeCase: MigrationCase | null;
  onSendMessage: (caseId: string, content: string) => void;
  onUploadFiles: (caseId: string, category: WorkspaceUploadCategory, files: File[]) => void;
  onAfterSend?: (caseId: string) => void;
  onAfterUpload?: (caseId: string) => void;
};

export function ConversationComposer({
  activeCase,
  onSendMessage,
  onUploadFiles,
  onAfterSend,
  onAfterUpload,
}: ConversationComposerProps) {
  const [draft, setDraft] = useState("");
  const [showUploader, setShowUploader] = useState(false);
  const [uploadCategory, setUploadCategory] = useState<WorkspaceUploadCategory>("EOI");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const formRef = useRef<HTMLFormElement | null>(null);

  const placeholder = DEFAULT_PLACEHOLDER;

  const submit = () => {
    const trimmed = draft.trim();

    if (!trimmed || !activeCase) {
      return;
    }

    onSendMessage(activeCase.id, trimmed);
    setDraft("");
    onAfterSend?.(activeCase.id);
    const feed = document.getElementById("conversation-feed");
    feed?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submit();
  };

  const addPendingFiles = (incoming: FileList | File[] | null) => {
    if (!incoming) {
      return;
    }
    const incomingArray = Array.from(incoming);
    if (incomingArray.length === 0) {
      return;
    }
    setPendingFiles((current) => {
      const next = [...current];
      for (const file of incomingArray) {
        if (!next.some((existing) => existing.name === file.name && existing.size === file.size)) {
          next.push(file);
        }
      }
      return next;
    });
  };

  const removePendingFile = (index: number) => {
    setPendingFiles((current) => current.filter((_, i) => i !== index));
  };

  const handleUpload = () => {
    if (!activeCase || pendingFiles.length === 0) {
      return;
    }
    onUploadFiles(activeCase.id, uploadCategory, pendingFiles);
    onAfterUpload?.(activeCase.id);
    setPendingFiles([]);
    setShowUploader(false);
  };

  const closeUploader = () => {
    setShowUploader(false);
    setPendingFiles([]);
  };

  return (
    <>
      <section className="elevated-input relative rounded-[2rem] p-4 lg:p-5">
        <form ref={formRef} onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex items-end gap-3">
            <AttachmentButton
              disabled={!activeCase}
              onClick={() => setShowUploader(true)}
            />
            <div className="min-w-0 flex-1 rounded-[1.6rem] border border-white/8 bg-black/72 px-4 py-3">
              <ComposerInput
                placeholder={placeholder}
                value={draft}
                enterKeyHint="send"
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    formRef.current?.requestSubmit();
                  }
                }}
                onKeyUp={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                  }
                }}
              />
            </div>
            <SendMessageButton disabled={!draft.trim() || !activeCase} onClick={submit} />
          </div>
        </form>
      </section>

      <AnimatePresence>
        {showUploader ? (
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 flex items-end justify-end bg-black/72 p-4 backdrop-blur-sm"
          >
            <m.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              transition={{ duration: 0.24, ease: [0.2, 0.9, 0.2, 1] }}
              className="focus-panel relative w-full max-w-[28rem] rounded-[1.6rem] p-5"
            >
              <p className="line-label">Upload Documents</p>
              <h3 className="mt-3 text-2xl font-medium tracking-[-0.05em] text-white">
                {activeCase ? `Upload into ${activeCase.business.name}` : "Select a business first"}
              </h3>
              <p className="mt-3 text-sm leading-6 text-white/62">
                Drag &amp; drop your files or use the upload button. You can upload multiple files at once.
              </p>

              <label className="mt-5 flex flex-col gap-2">
                <span className="text-[0.62rem] font-medium uppercase tracking-[0.22em] text-white/46">
                  Document type
                </span>
                <select
                  value={uploadCategory}
                  onChange={(event) =>
                    setUploadCategory(event.target.value as WorkspaceUploadCategory)
                  }
                  className="h-10 rounded-[0.9rem] border border-white/12 bg-black/55 px-3 text-sm font-medium text-white outline-none transition focus:border-white/32"
                >
                  {workspaceUploadCategories.map((option) => (
                    <option key={option} value={option} className="bg-zinc-950 text-white">
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <div
                onDragOver={(event) => {
                  event.preventDefault();
                  setIsDragOver(true);
                }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setIsDragOver(false);
                  addPendingFiles(event.dataTransfer.files);
                }}
                className={`mt-4 flex flex-col items-center justify-center gap-2 rounded-[1rem] border-2 border-dashed px-4 py-7 text-center transition ${
                  isDragOver ? "border-white/45 bg-white/[0.06]" : "border-white/15 bg-black/35"
                }`}
              >
                <UploadCloud className="size-6 text-white/55" />
                <p className="text-sm text-white/72">
                  Drag &amp; drop {uploadCategory.toLowerCase()} files here
                </p>
                <p className="text-xs text-white/44">or use the upload button below</p>
                <label className="mt-1 inline-flex cursor-pointer items-center gap-2 rounded-[0.7rem] border border-white/16 bg-white/[0.08] px-3 py-1.5 text-[0.62rem] uppercase tracking-[0.18em] text-white/82 hover:border-white/28 hover:text-white">
                  <input
                    type="file"
                    multiple
                    onChange={(event) => {
                      addPendingFiles(event.target.files);
                      event.target.value = "";
                    }}
                    className="hidden"
                  />
                  Choose files
                </label>
              </div>

              {pendingFiles.length > 0 ? (
                <ul className="mt-4 max-h-40 space-y-1.5 overflow-y-auto">
                  {pendingFiles.map((file, index) => (
                    <li
                      key={`${file.name}-${file.size}-${index}`}
                      className="flex items-center justify-between gap-3 rounded-[0.7rem] border border-white/10 bg-black/35 px-3 py-1.5 text-sm text-white/78"
                    >
                      <span className="truncate">
                        {file.name}{" "}
                        <span className="text-xs text-white/44">
                          ({Math.max(1, Math.round(file.size / 1024))} KB)
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => removePendingFile(index)}
                        className="text-[0.62rem] uppercase tracking-[0.16em] text-white/52 hover:text-rose-200"
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}

              <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-white/44">
                  {pendingFiles.length === 0
                    ? "No files queued."
                    : `${pendingFiles.length} file${pendingFiles.length === 1 ? "" : "s"} queued under "${uploadCategory}".`}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={closeUploader}
                    className="rounded-full border border-white/10 px-4 py-2 text-[0.62rem] uppercase tracking-[0.22em] text-white/54 transition hover:border-white/18 hover:text-white/86"
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    onClick={handleUpload}
                    disabled={!activeCase || pendingFiles.length === 0}
                    className="rounded-[0.85rem] border border-white/16 bg-white/[0.1] px-4 py-2 text-[0.64rem] uppercase tracking-[0.18em] text-white transition hover:border-white/28 hover:bg-white/[0.16] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Upload{pendingFiles.length > 0 ? ` ${pendingFiles.length}` : ""}
                  </button>
                </div>
              </div>
            </m.div>
          </m.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
