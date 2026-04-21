export function WorkspaceSwitcher() {
  return (
    <div className="rounded-[1.2rem] border border-white/10 bg-white/[0.03] p-4">
      <div className="rounded-[1rem] border border-white/8 bg-black/60 px-3 py-3">
        <p className="text-[0.62rem] uppercase tracking-[0.32em] text-white/42">
          Migration Workspace
        </p>
        <p className="mt-2 text-sm font-medium text-white">
          Eskom Exit - Generocity / Lumen-1
        </p>
        <p className="mt-2 text-xs leading-5 text-white/48">
          Structured onboarding for businesses moving into Foundation-1 energy products.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-white/14 px-2.5 py-1 text-[0.62rem] uppercase tracking-[0.22em] text-white/58">
            Generocity
          </span>
          <span className="rounded-full border border-white/14 px-2.5 py-1 text-[0.62rem] uppercase tracking-[0.22em] text-white/58">
            Lumen-1
          </span>
        </div>
      </div>
    </div>
  );
}
