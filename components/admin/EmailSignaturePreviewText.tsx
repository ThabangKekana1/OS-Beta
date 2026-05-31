"use client";

import {
  KARMAN_LINKEDIN_LABEL,
  KARMAN_LINKEDIN_URL,
} from "@/lib/email-signature-copy";

type EmailSignaturePreviewTextProps = {
  text: string;
  className?: string;
};

export function EmailSignaturePreviewText({
  text,
  className = "whitespace-pre-wrap break-words font-sans text-xs leading-5 text-white/72",
}: EmailSignaturePreviewTextProps) {
  const lines = text.split("\n");

  return (
    <div className={className}>
      {lines.map((line, index) => {
        const trimmed = line.trim();
        const isLinkedInLine = trimmed.toLowerCase() === KARMAN_LINKEDIN_LABEL.toLowerCase();
        return (
          <span key={`${index}-${line}`}>
            {isLinkedInLine ? (
              <a
                href={KARMAN_LINKEDIN_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-teal-200 underline underline-offset-4 hover:text-teal-100"
              >
                {KARMAN_LINKEDIN_LABEL}
              </a>
            ) : (
              line
            )}
            {index < lines.length - 1 ? "\n" : null}
          </span>
        );
      })}
    </div>
  );
}