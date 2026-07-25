import type { Metadata } from "next";
import Link from "next/link";
import FoundationMark from "@/components/FoundationMark";

export const metadata: Metadata = {
  title: "1OS | Foundation-1 Platform",
  description:
    "Foundation-1's operations platform: client dashboards, partner portals and deal rooms.",
  robots: { index: false, follow: false },
};

const WEBSITE = process.env.NEXT_PUBLIC_WEBSITE_ORIGIN ?? "https://foundation-1.co.za";

export default function PlatformGatewayPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-black px-6 text-white">
      <FoundationMark className="h-10 w-32" />
      <p className="mt-5 text-[0.66rem] uppercase tracking-[0.22em] text-lime-200/80">Foundation-1</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em]">1OS Platform</h1>
      <p className="mt-3 max-w-md text-center text-sm leading-6 text-white/60">
        Client dashboards, partner portals and secure deal rooms. Assessments and onboarding start
        on the Foundation-1 website.
      </p>
      <div className="mt-8 grid w-full max-w-sm gap-3">
        <Link
          href="/migration/dashboard"
          className="rounded-full border border-[#b9ff91]/70 bg-[#b9ff91] px-6 py-3 text-center text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-black transition hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-300"
        >
          Client dashboard
        </Link>
        <Link
          href="/login"
          className="rounded-full border border-white/25 px-6 py-3 text-center text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-white/80 transition hover:border-white/50 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-300"
        >
          Team sign-in
        </Link>
        <a
          href={`${WEBSITE}/pricing`}
          className="rounded-full border border-white/25 px-6 py-3 text-center text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-white/80 transition hover:border-white/50 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-300"
        >
          Start an assessment
        </a>
      </div>
    </main>
  );
}
