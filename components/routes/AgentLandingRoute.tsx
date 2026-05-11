import Link from "next/link";

const METRICS = [
  { value: "20–40%", label: "Typical bill reduction" },
  { value: "R0", label: "Capex to start" },
  { value: "5 min", label: "Discovery with Dawn" },
];

const VALUE_PROPS = [
  {
    title: "Cheaper power, without the complexity.",
    body: "Dawn qualifies your business, captures the right details, and prepares your file for the Foundation-1 team.",
  },
  {
    title: "Nedbank-financed migration.",
    body: "Generocity structures the panels, installation, maintenance, and insurance so you can start with zero capex.",
  },
  {
    title: "A guided path from day one.",
    body: "Registration, EOI signing, utility bills, proposal, and handover all stay in one private 1OS workspace.",
  },
];

const STEPS = [
  {
    eyebrow: "Step 01",
    title: "Tell Dawn about your business.",
    body: "Answer a short, one-question-at-a-time onboarding flow so Dawn can qualify your company without friction.",
  },
  {
    eyebrow: "Step 02",
    title: "Sign your EOI in 1OS.",
    body: "Your Expression of Interest is generated in Documents, ready for signature once registration is complete.",
  },
  {
    eyebrow: "Step 03",
    title: "Upload your utility bills.",
    body: "Nedbank uses six months of usage data to prepare a Generocity proposal and savings model.",
  },
];

const FAQ = [
  {
    q: "Who is Dawn?",
    a: "Dawn is the 1OS onboarding agent for Foundation-1. Dawn captures registration details, guides EOI signing, and keeps the workflow moving until a human account manager takes over.",
  },
  {
    q: "What does Generocity cover?",
    a: "Generocity is the zero-capex solar pathway. Panels, installation, maintenance, and insurance are financed, so the business pays for cleaner power instead of buying hardware upfront.",
  },
  {
    q: "What is Lumen-1?",
    a: "Lumen-1 is the wheeled-energy pathway backed by the Green Share VPP 56 MW Solar Farm in the Free State, built for sites where rooftop solar is not the best fit.",
  },
];

export function AgentLandingRoute() {
  return (
    <main className="min-h-screen bg-[#f5f5f7] text-[#1d1d1f]">
      <nav className="sticky top-0 z-50 border-b border-black/[0.06] bg-[#f5f5f7]/80 backdrop-blur-2xl">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-5 sm:px-8">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold tracking-[-0.02em]">
            <span className="flex size-7 items-center justify-center rounded-full bg-[#1d1d1f] text-[0.7rem] font-semibold text-white">
              1
            </span>
            <span>1OS</span>
          </Link>

          <div className="hidden items-center gap-8 text-xs font-medium text-[#1d1d1f]/68 md:flex">
            <a href="#solutions" className="transition hover:text-[#1d1d1f]">Solutions</a>
            <a href="#workflow" className="transition hover:text-[#1d1d1f]">Workflow</a>
            <a href="#faq" className="transition hover:text-[#1d1d1f]">FAQ</a>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="rounded-full px-4 py-2 text-xs font-medium text-[#1d1d1f]/72 transition hover:bg-black/[0.05] hover:text-[#1d1d1f]"
            >
              Log in
            </Link>
            <Link
              href="/signup"
              className="rounded-full bg-[#0071e3] px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-[#0077ed]"
            >
              Get started
            </Link>
          </div>
        </div>
      </nav>

      <section className="relative overflow-hidden px-5 pb-12 pt-16 sm:px-8 sm:pb-20 sm:pt-24">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[42rem] bg-[radial-gradient(circle_at_50%_0%,rgba(0,113,227,0.18),transparent_56%)]" />
        <div className="relative mx-auto max-w-7xl text-center">
          <p className="mx-auto inline-flex rounded-full border border-black/[0.08] bg-white/70 px-4 py-2 text-xs font-medium text-[#1d1d1f]/64 shadow-sm backdrop-blur-xl">
            Dawn is now onboarding South African businesses.
          </p>
          <h1 className="mx-auto mt-8 max-w-5xl text-[clamp(3.3rem,8vw,7.6rem)] font-semibold leading-[0.9] tracking-[-0.075em] text-[#1d1d1f]">
            Migrate off Eskom. Beautifully simple.
          </h1>
          <p className="mx-auto mt-8 max-w-2xl text-xl leading-8 tracking-[-0.02em] text-[#1d1d1f]/68 sm:text-2xl sm:leading-9">
            1OS gives your business a private workspace with Dawn — the agent that guides registration,
            EOI signing, utility bills, and your Foundation-1 energy migration.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/signup"
              className="rounded-full bg-[#0071e3] px-7 py-3 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(0,113,227,0.22)] transition hover:bg-[#0077ed]"
            >
              Talk to Dawn
            </Link>
            <a
              href="#workflow"
              className="rounded-full bg-black/[0.06] px-7 py-3 text-sm font-semibold text-[#1d1d1f] transition hover:bg-black/[0.09]"
            >
              See how it works
            </a>
          </div>

          <div className="mx-auto mt-14 max-w-5xl rounded-[2.5rem] border border-white/80 bg-white/72 p-3 shadow-[0_40px_120px_rgba(0,0,0,0.12)] backdrop-blur-2xl">
            <div className="overflow-hidden rounded-[2rem] bg-[#111113] text-white shadow-inner">
              <div className="border-b border-white/10 bg-white/[0.04] px-5 py-4 text-left">
                <div className="flex items-center gap-2">
                  <span className="size-3 rounded-full bg-[#ff5f57]" />
                  <span className="size-3 rounded-full bg-[#ffbd2e]" />
                  <span className="size-3 rounded-full bg-[#28c840]" />
                  <span className="ml-3 text-xs text-white/44">1OS workspace · Dawn</span>
                </div>
              </div>
              <div className="grid gap-0 lg:grid-cols-[0.9fr_1.1fr]">
                <div className="border-b border-white/10 p-7 text-left lg:border-b-0 lg:border-r">
                  <div className="flex items-center gap-3">
                    <div className="flex size-12 items-center justify-center rounded-2xl bg-white text-sm font-semibold text-[#1d1d1f]">
                      D
                    </div>
                    <div>
                      <p className="text-sm font-semibold">Dawn</p>
                      <p className="text-xs text-emerald-300">Online · ready to qualify</p>
                    </div>
                  </div>
                  <div className="mt-8 space-y-3">
                    {[
                      "Is the business CIPC-registered?",
                      "Is it currently operational?",
                      "What is the monthly electricity spend?",
                    ].map((item, index) => (
                      <div key={item} className="rounded-2xl border border-white/10 bg-white/[0.05] p-4">
                        <p className="text-[0.68rem] uppercase tracking-[0.18em] text-white/34">Question {index + 1}</p>
                        <p className="mt-2 text-sm text-white/82">{item}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-7 text-left">
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-white/40">
                    Migration readiness
                  </p>
                  <h2 className="mt-3 max-w-lg text-3xl font-semibold tracking-[-0.05em] text-white sm:text-4xl">
                    One private place for the entire journey.
                  </h2>
                  <div className="mt-8 grid gap-3 sm:grid-cols-3">
                    {METRICS.map((metric) => (
                      <div key={metric.label} className="rounded-2xl bg-white/[0.06] p-4">
                        <p className="text-2xl font-semibold tracking-[-0.04em]">{metric.value}</p>
                        <p className="mt-1 text-xs leading-5 text-white/48">{metric.label}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-8 rounded-3xl bg-[linear-gradient(135deg,#ffffff,#dfeaff)] p-5 text-[#1d1d1f]">
                    <p className="text-sm font-semibold">Next step</p>
                    <p className="mt-2 text-sm leading-6 text-[#1d1d1f]/68">
                      Dawn collects one detail at a time, clarifies anything unclear, and creates the EOI when your registration is complete.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="px-5 py-10 sm:px-8 sm:py-16">
        <div className="mx-auto grid max-w-7xl gap-4 md:grid-cols-3">
          {VALUE_PROPS.map((item) => (
            <article key={item.title} className="rounded-[2rem] bg-white p-8 shadow-[0_24px_70px_rgba(0,0,0,0.07)]">
              <h3 className="text-2xl font-semibold leading-tight tracking-[-0.04em] text-[#1d1d1f]">{item.title}</h3>
              <p className="mt-4 text-sm leading-7 text-[#1d1d1f]/62">{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="solutions" className="px-5 py-10 sm:px-8 sm:py-16">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-sm font-semibold text-[#6e6e73]">Solutions</p>
            <h2 className="mt-3 text-5xl font-semibold tracking-[-0.065em] text-[#1d1d1f] sm:text-6xl">
              Two ways forward. One guided experience.
            </h2>
          </div>

          <div className="mt-10 grid gap-5 lg:grid-cols-2">
            <article className="overflow-hidden rounded-[2.25rem] bg-[#1d1d1f] p-8 text-white shadow-[0_30px_90px_rgba(0,0,0,0.18)] sm:p-10">
              <p className="text-sm font-semibold text-white/50">Generocity</p>
              <h3 className="mt-3 max-w-md text-4xl font-semibold tracking-[-0.06em] sm:text-5xl">
                Zero-capex solar, financed by Nedbank.
              </h3>
              <p className="mt-5 max-w-lg text-base leading-8 text-white/64">
                Panels, installation, maintenance, and insurance are included. Your business pays for cleaner energy, not the hardware.
              </p>
              <div className="mt-10 grid grid-cols-2 gap-3">
                {["Panels", "Install", "Maintenance", "Insurance"].map((item) => (
                  <div key={item} className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm font-medium">
                    {item}
                  </div>
                ))}
              </div>
            </article>

            <article className="overflow-hidden rounded-[2.25rem] bg-white p-8 shadow-[0_30px_90px_rgba(0,0,0,0.1)] sm:p-10">
              <p className="text-sm font-semibold text-[#6e6e73]">Lumen-1</p>
              <h3 className="mt-3 max-w-md text-4xl font-semibold tracking-[-0.06em] text-[#1d1d1f] sm:text-5xl">
                Green energy, wheeled to your meter.
              </h3>
              <p className="mt-5 max-w-lg text-base leading-8 text-[#1d1d1f]/62">
                Backed by the Green Share VPP 56 MW Solar Farm in the Free State, Lumen-1 is ideal when rooftop solar is not the right fit.
              </p>
              <div className="mt-10 rounded-[1.75rem] bg-[#f5f5f7] p-6">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <p className="text-5xl font-semibold tracking-[-0.07em] text-[#1d1d1f]">56 MW</p>
                    <p className="mt-2 text-sm text-[#6e6e73]">Solar capacity</p>
                  </div>
                  <div className="h-28 w-28 rounded-full bg-[radial-gradient(circle,#0071e3,transparent_62%)] opacity-80" />
                </div>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section id="workflow" className="px-5 py-10 sm:px-8 sm:py-16">
        <div className="mx-auto max-w-7xl rounded-[2.5rem] bg-white p-8 shadow-[0_30px_90px_rgba(0,0,0,0.08)] sm:p-12">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold text-[#6e6e73]">Workflow</p>
            <h2 className="mt-3 text-5xl font-semibold tracking-[-0.065em] text-[#1d1d1f] sm:text-6xl">
              Clear steps. No heavy lifting.
            </h2>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {STEPS.map((step) => (
              <article key={step.eyebrow} className="rounded-[1.75rem] bg-[#f5f5f7] p-6">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#86868b]">{step.eyebrow}</p>
                <h3 className="mt-4 text-2xl font-semibold leading-tight tracking-[-0.04em] text-[#1d1d1f]">{step.title}</h3>
                <p className="mt-4 text-sm leading-7 text-[#1d1d1f]/62">{step.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="faq" className="px-5 py-10 sm:px-8 sm:py-16">
        <div className="mx-auto max-w-4xl">
          <div className="text-center">
            <p className="text-sm font-semibold text-[#6e6e73]">FAQ</p>
            <h2 className="mt-3 text-5xl font-semibold tracking-[-0.065em] text-[#1d1d1f] sm:text-6xl">
              Good to know.
            </h2>
          </div>
          <div className="mt-10 divide-y divide-black/[0.08] rounded-[2rem] bg-white shadow-[0_24px_70px_rgba(0,0,0,0.07)]">
            {FAQ.map((item) => (
              <details key={item.q} className="group px-6 py-5 [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex cursor-pointer items-center justify-between gap-5 text-left">
                  <span className="text-lg font-semibold tracking-[-0.02em] text-[#1d1d1f]">{item.q}</span>
                  <span className="text-2xl font-light text-[#86868b] transition group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 max-w-3xl text-sm leading-7 text-[#1d1d1f]/62">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="px-5 py-10 sm:px-8 sm:py-16">
        <div className="mx-auto max-w-7xl overflow-hidden rounded-[2.75rem] bg-[#1d1d1f] px-6 py-16 text-center text-white shadow-[0_40px_120px_rgba(0,0,0,0.2)] sm:px-10 sm:py-24">
          <p className="text-sm font-semibold text-white/46">Get started</p>
          <h2 className="mx-auto mt-4 max-w-4xl text-5xl font-semibold leading-[0.96] tracking-[-0.07em] sm:text-7xl">
            Dawn is ready when you are.
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-white/62">
            Create your account and start the guided onboarding flow. One detail at a time, from registration to proposal readiness.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link href="/signup" className="rounded-full bg-white px-7 py-3 text-sm font-semibold text-[#1d1d1f] transition hover:bg-white/90">
              Create account
            </Link>
            <Link href="/login" className="rounded-full bg-white/[0.09] px-7 py-3 text-sm font-semibold text-white transition hover:bg-white/[0.14]">
              Log in
            </Link>
          </div>
        </div>
      </section>

      <footer className="px-5 py-8 sm:px-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 border-t border-black/[0.08] pt-8 text-xs text-[#6e6e73] sm:flex-row">
          <p>© {new Date().getFullYear()} Foundation-1. All rights reserved.</p>
          <p className="font-medium text-[#1d1d1f]/62">1OS · Migrate with confidence</p>
          <a href="https://foundation-1.co.za" target="_blank" rel="noreferrer noopener" className="transition hover:text-[#1d1d1f]">
            Foundation-1 ↗
          </a>
        </div>
      </footer>
    </main>
  );
}
