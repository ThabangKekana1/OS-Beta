"use client";

import { useState } from "react";
import { Menu, X } from "lucide-react";

export function MobileSidebarToggle({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        aria-label={isOpen ? "Close menu" : "Open menu"}
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex size-9 items-center justify-center rounded-full border border-white/12 bg-white/[0.04] text-white/72 transition hover:border-white/20 hover:text-white lg:hidden"
      >
        {isOpen ? <X className="size-4" /> : <Menu className="size-4" />}
      </button>

      {isOpen ? (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
            onClick={() => setIsOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 z-50 w-[19rem] overflow-y-auto lg:hidden">
            {children}
          </div>
        </>
      ) : null}
    </>
  );
}
