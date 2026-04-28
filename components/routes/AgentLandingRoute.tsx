import Link from "next/link";

const VALUE_PROPS = [
  {
    title: "Cheaper power",
    body: "Cut your electricity bill 20–40% with the right mix of solar, storage, and wheeled green energy.",
  },
  {
    title: "Done for you",
    body: "Dawn handles the paperwork — NERSA, municipal applications, choosing the right installation partner, financing — end to end.",
  },
  {
    title: "Zero capex",
    body: "PPA, lease, and rent-to-own structures available. We model every option against your tariff.",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Tell Dawn about your business",
    body: "5-minute conversation. Premises, monthly spend, what you make or do.",
  },
  {
    n: "02",
    title: "Get a tailored migration plan",
    body: "Generation mix, financing options, and projected savings — modelled on your real tariff.",
  },
  {
    n: "03",
    title: "We deliver the migration",
    body: "We coordinate the installation partners, financiers, and approvals. You sign off. We migrate you off Eskom.",
  },
];

const FAQ = [
  {
    q: "What is Foundation-1?",
    a: "A managed migration partner that moves South African businesses off Eskom and onto cleaner, cheaper power. We don't sell panels — we orchestrate the full transition.",
  },
  {
    q: "Who is Dawn?",
    a: "Dawn is your AI agent. Dawn runs the discovery conversation, builds your file, and hands off to a human migration lead the moment your business is qualified.",
  },
  {
    q: "How much does it cost to start?",
    a: "Nothing upfront. Discovery, qualification, and your migration plan are free — and so is the hardware on Generocity (panels, installation, maintenance, and insurance are all included). Once you're migrated, you simply pay your new electricity tariff, which is typically 20–50% lower than what you're paying Eskom today.",
  },
];

export function AgentLandingRoute() {
  return (
    <div className="min-h-[calc(100vh-3rem)]">
      {/* Top nav */}
      <nav className="sticky top-0 z-30 mx-auto flex max-w-[88rem] items-center justify-between border-b border-white/5 bg-[#05060a]/70 px-2 py-3 backdrop-blur-xl sm:px-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 min-w-9 items-center justify-center rounded-full border border-white/15 bg-black px-2.5 font-display text-sm font-semibold tracking-wider text-white">
            1OS
          </div>
          <span className="font-display text-sm uppercase tracking-[0.32em] text-white/70">
            Foundation-1
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className="rounded-full border border-white/15 bg-transparent px-4 py-2 text-xs font-medium uppercase tracking-[0.2em] text-white/75 transition hover:bg-white/10"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="rounded-full bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-black transition hover:bg-white/90"
          >
            Get started
          </Link>
        </div>
      </nav>

      {/* HERO */}
      <section className="app-surface surface-ring relative overflow-hidden rounded-[2rem] border border-white/12 bg-[#050505] p-6 sm:p-10 lg:p-14">
        <div className="ambient-grid" />
        <div className="subtle-noise" />
        <div className="soft-bloom soft-bloom-blue left-[8%] top-[6%] h-[380px] w-[380px]" />
        <div className="soft-bloom soft-bloom-magenta right-[6%] top-[10%] h-[340px] w-[340px]" />

        <div className="relative z-10 mx-auto grid w-full max-w-[88rem] items-center gap-12 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          {/* Left copy */}
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-black/60 px-3 py-1 text-[0.65rem] uppercase tracking-[0.3em] text-white/65">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Now onboarding South African businesses
            </p>
            <h1 className="mt-6 font-display text-[clamp(1.6rem,3.2vw,2.8rem)] font-semibold leading-[1.1] tracking-[-0.015em] text-white">
              Migrate your business off&nbsp;Eskom.
            </h1>
            <p className="mt-6 max-w-[36rem] text-base leading-7 text-white/70 sm:text-lg">
              Dawn is the Foundation-1 migration agent. Dawn qualifies your site, models your savings,
              and orchestrates the full move from Eskom — generation, storage, financing, approvals.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/signup"
                className="rounded-full bg-white px-6 py-3 text-sm font-semibold text-black transition hover:bg-white/90"
              >
                Talk to Dawn →
              </Link>
              <a
                href="#how-it-works"
                className="rounded-full border border-white/15 bg-transparent px-6 py-3 text-sm font-medium text-white/80 transition hover:bg-white/5"
              >
                How it works
              </a>
            </div>

            <div className="mt-10 grid max-w-[40rem] grid-cols-3 border-t border-white/10 pt-6 text-sm">
              <div>
                <p className="font-display text-2xl text-white">20–40%</p>
                <p className="mt-1 whitespace-nowrap text-[0.65rem] uppercase tracking-[0.14em] text-white/50">
                  Bill reduction
                </p>
              </div>
              <div className="text-center">
                <p className="font-display text-2xl text-white">R0</p>
                <p className="mt-1 whitespace-nowrap text-[0.65rem] uppercase tracking-[0.14em] text-white/50">
                  To start
                </p>
              </div>
              <div className="text-right">
                <p className="font-display text-2xl text-white">5 min</p>
                <p className="mt-1 whitespace-nowrap text-[0.65rem] uppercase tracking-[0.14em] text-white/50">
                  Discovery
                </p>
              </div>
            </div>
          </div>

          {/* Right: Dawn introduction card */}
          <div className="relative">
            <div className="rounded-[1.75rem] border border-white/12 bg-black/70 p-6 shadow-[0_30px_120px_rgba(0,0,0,0.6)] backdrop-blur-sm">
              <div className="flex items-start gap-4">
                <div className="relative flex h-16 w-16 flex-none items-center justify-center rounded-full border border-white/20 bg-black font-display text-sm font-semibold text-white shadow-[0_0_40px_rgba(110,140,255,0.45)]">
                  Dawn
                  <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-black bg-emerald-400" />
                </div>
                <div className="flex-1">
                  <p className="text-[0.65rem] uppercase tracking-[0.3em] text-white/55">
                    Agent online
                  </p>
                  <p className="mt-1 font-display text-lg text-white">Hi, I&apos;m Dawn.</p>
                </div>
              </div>

              <p className="mt-5 text-sm leading-7 text-white/80">
                I help South African businesses move off Eskom and onto cleaner, cheaper power.
                In about 5 minutes I&apos;ll know enough about your site to model your savings and
                start your migration plan.
              </p>

              <div className="mt-5 space-y-2 text-xs text-white/65">
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  Trained on Foundation-1&apos;s migration playbooks
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  Hands off to a human the moment you qualify
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  Your data stays private — never sold
                </div>
              </div>

              <Link
                href="/signup"
                className="mt-6 block w-full rounded-xl bg-white px-4 py-3 text-center text-sm font-semibold text-black transition hover:bg-white/90"
              >
                Create account
              </Link>
              <Link
                href="/login"
                className="mt-2 block w-full rounded-xl border border-white/12 bg-transparent px-4 py-3 text-center text-sm font-medium text-white/75 transition hover:bg-white/5"
              >
                I already have an account
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* VALUE PROPS */}
      <section className="mx-auto mt-12 grid w-full max-w-[88rem] gap-4 px-2 sm:grid-cols-3 sm:px-0">
        {VALUE_PROPS.map((item) => (
          <div
            key={item.title}
            className="rounded-[1.5rem] border border-white/10 bg-[#0a0a0a] p-6"
          >
            <p className="font-display text-lg text-white">{item.title}</p>
            <p className="mt-2 text-sm leading-6 text-white/65">{item.body}</p>
          </div>
        ))}
      </section>

      {/* PRODUCTS */}
      <section className="mx-auto mt-16 w-full max-w-[88rem] px-2 sm:px-0">
        <p className="text-[0.65rem] uppercase tracking-[0.32em] text-white/55">Our solutions</p>
        <h2 className="mt-3 font-display text-3xl font-semibold tracking-[-0.01em] text-white sm:text-4xl">
          Two ways to migrate. One agent.
        </h2>

        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          {/* Generocity */}
          <div className="relative overflow-hidden rounded-[1.75rem] border border-white/12 bg-gradient-to-br from-[#0d0d0d] via-[#080808] to-[#050505] p-6 sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[0.65rem] uppercase tracking-[0.32em] text-emerald-300/80">
                  On-site generation
                </p>
                <h3 className="mt-2 font-display text-2xl font-semibold text-white">Generocity</h3>
                <p className="mt-1 text-sm text-white/60">Solar at your premises — at zero cost to you.</p>
              </div>
              <span className="rounded-full border border-white/15 bg-black/60 px-3 py-1 text-[0.65rem] uppercase tracking-[0.25em] text-white/70">
                Financed by Nedbank
              </span>
            </div>

            <ul className="mt-6 grid gap-2 text-sm text-white/80">
              {[
                "Free solar panels",
                "Free installation",
                "Free maintenance",
                "Free insurance",
              ].map((line) => (
                <li key={line} className="flex items-center gap-3">
                  <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full border border-emerald-400/40 bg-emerald-400/10 text-[0.7rem] text-emerald-300">
                    ✓
                  </span>
                  {line}
                </li>
              ))}
            </ul>

            <p className="mt-6 text-sm leading-6 text-white/60">
              Fully funded through our partnership with Nedbank. You pay only for the cleaner power
              you use — at a rate below your current Eskom tariff.
            </p>
          </div>

          {/* Lumen */}
          <div className="relative overflow-hidden rounded-[1.75rem] border border-white/12 bg-gradient-to-br from-[#0d0d0d] via-[#080808] to-[#050505] p-6 sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[0.65rem] uppercase tracking-[0.32em] text-sky-300/80">
                  Wheeled green energy
                </p>
                <h3 className="mt-2 font-display text-2xl font-semibold text-white">Lumen</h3>
                <p className="mt-1 text-sm text-white/60">
                  Clean power delivered through the grid — no rooftop required.
                </p>
              </div>
              <span className="rounded-full border border-white/15 bg-black/60 px-3 py-1 text-[0.65rem] uppercase tracking-[0.25em] text-white/70">
                56 MW solar farm
              </span>
            </div>

            <div className="mt-6 grid grid-cols-3 gap-3 text-center">
              <div className="rounded-xl border border-white/10 bg-black/40 p-3">
                <p className="font-display text-xl text-white">56 MW</p>
                <p className="mt-1 text-[0.65rem] uppercase tracking-[0.2em] text-white/50">Capacity</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/40 p-3">
                <p className="font-display text-xl text-white">100%</p>
                <p className="mt-1 text-[0.65rem] uppercase tracking-[0.2em] text-white/50">Renewable</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/40 p-3">
                <p className="font-display text-xl text-white">Wheeled</p>
                <p className="mt-1 text-[0.65rem] uppercase tracking-[0.2em] text-white/50">Via grid</p>
              </div>
            </div>

            <p className="mt-6 text-sm leading-6 text-white/60">
              Lumen is backed by a dedicated 56 MW solar farm. Energy is wheeled to your meter
              through the existing grid — ideal for sites where rooftop solar isn&apos;t practical.
            </p>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how-it-works" className="mx-auto mt-16 w-full max-w-[88rem] px-2 sm:px-0">
        <p className="text-[0.65rem] uppercase tracking-[0.32em] text-white/55">How it works</p>
        <h2 className="mt-3 font-display text-3xl font-semibold tracking-[-0.01em] text-white sm:text-4xl">
          From Eskom to a cleaner grid in three steps.
        </h2>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {STEPS.map((step) => (
            <div
              key={step.n}
              className="relative rounded-[1.5rem] border border-white/10 bg-[#0a0a0a] p-6"
            >
              <p className="font-display text-4xl font-semibold text-white/15">{step.n}</p>
              <p className="mt-3 font-display text-lg text-white">{step.title}</p>
              <p className="mt-2 text-sm leading-6 text-white/65">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto mt-16 w-full max-w-[64rem] px-2 sm:px-0">
        <p className="text-[0.65rem] uppercase tracking-[0.32em] text-white/55">FAQ</p>
        <h2 className="mt-3 font-display text-3xl font-semibold tracking-[-0.01em] text-white sm:text-4xl">
          The basics.
        </h2>
        <div className="mt-8 divide-y divide-white/10 rounded-[1.5rem] border border-white/10 bg-[#0a0a0a]">
          {FAQ.map((item) => (
            <details
              key={item.q}
              className="group px-6 py-5 [&_summary::-webkit-details-marker]:hidden"
            >
              <summary className="flex cursor-pointer items-center justify-between gap-4 text-left">
                <span className="font-display text-base text-white">{item.q}</span>
                <span className="text-white/40 transition group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 text-sm leading-7 text-white/65">{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* GET STARTED CTA */}
      <section className="mx-auto mt-16 w-full max-w-[88rem] px-2 sm:px-0">
        <div className="overflow-hidden rounded-[2rem] border border-white/12 bg-gradient-to-br from-[#0b0b0b] via-[#080808] to-[#050505] p-8 text-center sm:p-12 lg:p-16">
          <p className="text-[0.65rem] uppercase tracking-[0.32em] text-white/55">Get started</p>
          <h2 className="mx-auto mt-3 max-w-[40rem] font-display text-3xl font-semibold tracking-[-0.01em] text-white sm:text-4xl">
            Create your account. Dawn will pick up from here.
          </h2>
          <p className="mx-auto mt-4 max-w-[34rem] text-sm leading-7 text-white/65">
            Sign up with any email address. You&apos;ll land in a private workspace where Dawn begins
            the discovery conversation right away.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/signup"
              className="rounded-full bg-white px-6 py-3 text-sm font-semibold text-black transition hover:bg-white/90"
            >
              Create your account
            </Link>
            <Link
              href="/login"
              className="rounded-full border border-white/15 bg-transparent px-6 py-3 text-sm font-medium text-white/80 transition hover:bg-white/5"
            >
              Log in
            </Link>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="mx-auto mt-16 flex w-full max-w-[88rem] flex-col items-center justify-between gap-3 border-t border-white/10 px-2 py-8 text-xs text-white/45 sm:flex-row sm:px-0">
        <p>© {new Date().getFullYear()} Foundation-1. All rights reserved.</p>
        <a
          href="https://foundation-1.co.za"
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1 text-white/70 underline underline-offset-4 transition hover:text-white"
        >
          Visit Foundation-1 <span aria-hidden>↗</span>
        </a>
        <p className="uppercase tracking-[0.25em]">1OS · Migrate with confidence</p>
      </footer>
    </div>
  );
}
