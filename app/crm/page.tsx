import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "1OS | CRM",
  description: "Client relationship management — coming soon.",
};

export default function CrmPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 rounded-[2rem] border border-white/10 bg-black/80 p-10">
      <p className="text-[0.66rem] uppercase tracking-[0.26em] text-white/46">
        Coming Soon
      </p>
      <h1 className="text-2xl font-medium tracking-[-0.04em] text-white">
        CRM Module
      </h1>
      <p className="max-w-md text-center text-sm leading-6 text-white/56">
        The dedicated CRM module is under development and will be available in a future release.
      </p>
    </div>
  );
}
