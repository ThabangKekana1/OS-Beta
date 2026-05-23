"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";
import {
  isValidSouthAfricanCompanyRegistration,
  SA_COMPANY_REGISTRATION_ERROR,
} from "@/lib/company-registration";
import type { AdminAgent, AdminLead } from "@/lib/admin-types";
import { EnergyWaitingRoomBackground } from "@/components/registration/EnergyWaitingRoomBackground";

export type RegistrationFormValues = {
  businessName: string;
  businessRegistrationNumber: string;
  industry: string;
  contactFirstName: string;
  contactSurname: string;
  contactPosition: string;
  contactEmail: string;
  contactNumber: string;
  monthlyElectricitySpendEstimateZar: number;
  isBusinessRegistered: boolean;
  isBusinessOperational: boolean;
  hasSixMonthUtilityBill: boolean;
  physicalAddress: string;
  city: string;
  province: string;
  source: AdminLead["source"];
  ownerId: string;
};

type RegistrationFormState = Omit<RegistrationFormValues, "monthlyElectricitySpendEstimateZar"> & {
  monthlyElectricitySpendEstimateZar: string;
};

type ClientRegistrationFormProps = {
  agents?: AdminAgent[];
  defaultOwnerId: string;
  lockOwner?: boolean;
  initialValues?: Partial<RegistrationFormValues>;
  eyebrow?: string;
  title?: ReactNode;
  description?: string;
  submitLabel?: string;
  successMessage?: string | null;
  storageKey?: string;
  onSubmit: (values: RegistrationFormValues) => Promise<boolean> | boolean;
};

type TextField =
  | "businessName"
  | "businessRegistrationNumber"
  | "industry"
  | "contactFirstName"
  | "contactSurname"
  | "contactPosition"
  | "contactEmail"
  | "contactNumber"
  | "monthlyElectricitySpendEstimateZar"
  | "physicalAddress"
  | "city"
  | "province"
  | "ownerId";

type BooleanField = "isBusinessRegistered" | "isBusinessOperational" | "hasSixMonthUtilityBill";

type Question = {
  id: TextField | BooleanField;
  kicker: string;
  title: string;
  helper: string;
  type: "text" | "email" | "tel" | "number" | "textarea" | "select" | "boolean";
  placeholder?: string;
  inputMode?: "numeric" | "decimal" | "email" | "tel";
  autoComplete?: string;
};

const provinces = [
  "Eastern Cape",
  "Free State",
  "Gauteng",
  "KwaZulu-Natal",
  "Limpopo",
  "Mpumalanga",
  "Northern Cape",
  "North West",
  "Western Cape",
];

const baseQuestions: Question[] = [
  {
    id: "businessName",
    kicker: "01 / Business",
    title: "What is the registered business name?",
    helper: "Use the name that appears on official documents and utility bills.",
    type: "text",
    placeholder: "Example: Bright Foods (Pty) Ltd",
    autoComplete: "organization",
  },
  {
    id: "businessRegistrationNumber",
    kicker: "02 / Verification",
    title: "What is the company registration number?",
    helper: "Format it like 2024/123456/07 so the profile can be verified cleanly.",
    type: "text",
    placeholder: "2024/123456/07",
    inputMode: "numeric",
  },
  {
    id: "industry",
    kicker: "03 / Sector",
    title: "Which industry best describes the business?",
    helper: "A short answer is perfect — retail, logistics, manufacturing, agriculture, hospitality, etc.",
    type: "text",
    placeholder: "Manufacturing",
  },
  {
    id: "contactFirstName",
    kicker: "04 / Contact",
    title: "What is the main contact’s first name?",
    helper: "This person will receive follow-ups from the Foundation-1 team.",
    type: "text",
    placeholder: "Nomsa",
    autoComplete: "given-name",
  },
  {
    id: "contactSurname",
    kicker: "05 / Contact",
    title: "And their surname?",
    helper: "Keep it exactly as it should appear on client documents.",
    type: "text",
    placeholder: "Mokoena",
    autoComplete: "family-name",
  },
  {
    id: "contactPosition",
    kicker: "06 / Authority",
    title: "What is their position in the company?",
    helper: "Founder, Director, Operations Manager, Facilities Manager — whatever fits best.",
    type: "text",
    placeholder: "Operations Director",
    autoComplete: "organization-title",
  },
  {
    id: "contactEmail",
    kicker: "07 / Email",
    title: "Which email should we use for this profile?",
    helper: "Use a real inbox. This is where documents and next steps may be sent.",
    type: "email",
    placeholder: "name@company.co.za",
    inputMode: "email",
    autoComplete: "email",
  },
  {
    id: "contactNumber",
    kicker: "08 / Phone",
    title: "What is the best contact number?",
    helper: "A mobile number is best if the team needs to clarify anything quickly.",
    type: "tel",
    placeholder: "+27 82 000 0000",
    inputMode: "tel",
    autoComplete: "tel",
  },
  {
    id: "monthlyElectricitySpendEstimateZar",
    kicker: "09 / Energy Spend",
    title: "Approximately how much is the monthly electricity spend?",
    helper: "A realistic estimate is enough. This helps us prioritise the commercial review.",
    type: "number",
    placeholder: "75000",
    inputMode: "decimal",
  },
  {
    id: "isBusinessRegistered",
    kicker: "10 / Status",
    title: "Is the business officially registered?",
    helper: "This confirms whether the company can move through the formal onboarding workflow.",
    type: "boolean",
  },
  {
    id: "isBusinessOperational",
    kicker: "11 / Status",
    title: "Is the business currently operational?",
    helper: "Foundation-1 is designed for active operating sites with real electricity usage.",
    type: "boolean",
  },
  {
    id: "hasSixMonthUtilityBill",
    kicker: "12 / Documents",
    title: "Do you already have a 6-month utility bill pack?",
    helper: "If not, you can still register. The upload link will collect it later.",
    type: "boolean",
  },
  {
    id: "physicalAddress",
    kicker: "13 / Site",
    title: "What is the site’s physical address?",
    helper: "Use the address connected to the electricity meter or operating site.",
    type: "textarea",
    placeholder: "Street address, suburb, building, or site description",
    autoComplete: "street-address",
  },
  {
    id: "city",
    kicker: "14 / Site",
    title: "Which city is the site in?",
    helper: "This helps route the profile to the right regional review process.",
    type: "text",
    placeholder: "Johannesburg",
    autoComplete: "address-level2",
  },
  {
    id: "province",
    kicker: "15 / Site",
    title: "Which province is the site in?",
    helper: "Choose the province connected to the operating site.",
    type: "select",
    placeholder: "Select province",
    autoComplete: "address-level1",
  },
];

function buildInitialForm(
  initialValues: Partial<RegistrationFormValues>,
  defaultOwnerId: string,
): RegistrationFormState {
  return {
    businessName: initialValues.businessName ?? "",
    businessRegistrationNumber: initialValues.businessRegistrationNumber ?? "",
    industry: initialValues.industry ?? "",
    contactFirstName: initialValues.contactFirstName ?? "",
    contactSurname: initialValues.contactSurname ?? "",
    contactPosition: initialValues.contactPosition ?? "",
    contactEmail: initialValues.contactEmail ?? "",
    contactNumber: initialValues.contactNumber ?? "",
    monthlyElectricitySpendEstimateZar:
      initialValues.monthlyElectricitySpendEstimateZar
        ? String(initialValues.monthlyElectricitySpendEstimateZar)
        : "",
    isBusinessRegistered: initialValues.isBusinessRegistered ?? true,
    isBusinessOperational: initialValues.isBusinessOperational ?? true,
    hasSixMonthUtilityBill: initialValues.hasSixMonthUtilityBill ?? false,
    physicalAddress: initialValues.physicalAddress ?? "",
    city: initialValues.city ?? "",
    province: initialValues.province ?? "",
    source: initialValues.source ?? ("Migrate Portal" as AdminLead["source"]),
    ownerId: initialValues.ownerId ?? defaultOwnerId,
  };
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function answeredFieldSet(form: RegistrationFormState) {
  return new Set<Question["id"]>(
    baseQuestions
      .filter((question) => {
        if (question.type === "boolean") return false;
        return String(form[question.id as TextField] ?? "").trim().length > 0;
      })
      .map((question) => question.id),
  );
}

export function ClientRegistrationForm({
  agents = [],
  defaultOwnerId,
  lockOwner = false,
  initialValues = {},
  eyebrow = "Client Registration",
  title = "Create a new dedicated client profile.",
  description = "Capture the required onboarding details, assign an agent, and open the profile page immediately.",
  submitLabel = "Register Client",
  successMessage = null,
  storageKey = "oneos:registration:draft",
  onSubmit,
}: ClientRegistrationFormProps) {
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [direction, setDirection] = useState<'forward' | 'back'>('forward');
  const [step, setStep] = useState(0);
  const [hasHydratedDraft, setHasHydratedDraft] = useState(false);
  const [form, setForm] = useState<RegistrationFormState>(() =>
    buildInitialForm(initialValues, defaultOwnerId),
  );
  const [answeredFields, setAnsweredFields] = useState<Set<Question["id"]>>(() =>
    answeredFieldSet(buildInitialForm(initialValues, defaultOwnerId)),
  );

  const questions = useMemo(() => {
    if (lockOwner) return baseQuestions;
    return [
      ...baseQuestions,
      {
        id: "ownerId" as const,
        kicker: "16 / Team",
        title: "Who should own this profile internally?",
        helper: "Pick the agent who will receive the profile on the dashboard.",
        type: "select" as const,
        placeholder: "Select agent",
      },
    ];
  }, [lockOwner]);

  function validateField(field: Question["id"]) {
    if (field === "businessRegistrationNumber") {
      return isValidSouthAfricanCompanyRegistration(form.businessRegistrationNumber)
        ? null
        : SA_COMPANY_REGISTRATION_ERROR;
    }
    if (field === "contactEmail") {
      return isEmail(form.contactEmail) ? null : "Enter a valid email address.";
    }
    if (field === "monthlyElectricitySpendEstimateZar") {
      return Number(form.monthlyElectricitySpendEstimateZar) > 0
        ? null
        : "Enter a monthly electricity spend greater than zero.";
    }
    if (
      field === "isBusinessRegistered" ||
      field === "isBusinessOperational" ||
      field === "hasSixMonthUtilityBill"
    ) {
      return null;
    }
    const value = String(form[field] ?? "").trim();
    const label = questions.find((question) => question.id === field)?.title ?? "This answer";
    return value.length > 0 ? null : `${label} is required.`;
  }

  useEffect(() => {
    const nextInitialForm = buildInitialForm(initialValues, defaultOwnerId);
    setForm(nextInitialForm);
    setAnsweredFields(answeredFieldSet(nextInitialForm));
    setHasHydratedDraft(false);
  }, [defaultOwnerId, initialValues]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<RegistrationFormState>;
        const next = { ...buildInitialForm(initialValues, defaultOwnerId), ...parsed };
        setForm(next);
        setAnsweredFields(answeredFieldSet(next));
      }
    } catch {
      // Ignore corrupt browser drafts and keep the server/default values.
    } finally {
      setHasHydratedDraft(true);
    }
  }, [defaultOwnerId, initialValues, storageKey]);

  useEffect(() => {
    if (!hasHydratedDraft || typeof window === "undefined") return;
    window.localStorage.setItem(storageKey, JSON.stringify(form));
  }, [form, hasHydratedDraft, storageKey]);

  const completedCount = questions.filter(
    (question) => answeredFields.has(question.id) && validateField(question.id) === null,
  ).length;
  const isOnReview = step >= questions.length;
  const activeQuestion = questions[Math.min(step, questions.length - 1)];
  const progressPercent = Math.round((completedCount / questions.length) * 100);
  const firstError = questions.map((question) => validateField(question.id)).find(Boolean) ?? null;
  const isFormComplete = firstError === null;

  function updateField(field: TextField, value: string) {
    setFormError(null);
    setForm((current) => ({ ...current, [field]: value }));
    setAnsweredFields((current) => {
      const next = new Set(current);
      if (value.trim().length > 0) next.add(field);
      else next.delete(field);
      return next;
    });
  }

  function updateBoolean(field: BooleanField, value: boolean) {
    setFormError(null);
    setForm((current) => ({ ...current, [field]: value }));
    setAnsweredFields((current) => new Set(current).add(field));
  }

  function continueToNext() {
    const error = validateField(activeQuestion.id);
    if (error) {
      setFormError(error);
      return;
    }
    setFormError(null);
    setDirection('forward');
    setAnsweredFields((current) => new Set(current).add(activeQuestion.id));
    setStep((current) => Math.min(current + 1, questions.length));
  }

  function goBack() {
    setFormError(null);
    setDirection('back');
    if (isOnReview) {
      setStep(questions.length - 1);
      return;
    }
    setStep((current) => Math.max(0, current - 1));
  }

  const handleRegisterClient = async () => {
    if (!isFormComplete) {
      setFormError(firstError ?? "Complete the missing answers before submitting.");
      const firstInvalidStep = questions.findIndex((question) => validateField(question.id));
      if (firstInvalidStep >= 0) setStep(firstInvalidStep);
      return;
    }

    setFormError(null);
    setIsSubmitting(true);
    const submitted = await onSubmit({
      businessName: form.businessName.trim(),
      businessRegistrationNumber: form.businessRegistrationNumber.trim(),
      industry: form.industry.trim(),
      contactFirstName: form.contactFirstName.trim(),
      contactSurname: form.contactSurname.trim(),
      contactPosition: form.contactPosition.trim(),
      contactEmail: form.contactEmail.trim(),
      contactNumber: form.contactNumber.trim(),
      monthlyElectricitySpendEstimateZar: Number(form.monthlyElectricitySpendEstimateZar),
      isBusinessRegistered: form.isBusinessRegistered,
      isBusinessOperational: form.isBusinessOperational,
      hasSixMonthUtilityBill: form.hasSixMonthUtilityBill,
      physicalAddress: form.physicalAddress.trim(),
      city: form.city.trim(),
      province: form.province,
      source: form.source,
      ownerId: form.ownerId,
    });
    setIsSubmitting(false);

    if (submitted) {
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(storageKey);
      }
      return;
    }

    setFormError("Unable to register client. Check the details and try again.");
  };

  function renderInput(question: Question) {
    const inputClass = "w-full border-b-2 border-white/20 bg-transparent pb-4 pt-2 text-2xl text-white outline-none placeholder:text-white/20 transition-colors duration-200 focus:border-lime-200 md:text-3xl";

    if (question.type === "boolean") {
      const value = form[question.id as BooleanField];
      return (
        <div className="mt-8 grid grid-cols-2 gap-4">
          {[
            { value: true, label: "Yes", key: "A" },
            { value: false, label: "No", key: "B" },
          ].map((option) => {
            const active = value === option.value;
            return (
              <button
                key={option.label}
                type="button"
                onClick={() => updateBoolean(question.id as BooleanField, option.value)}
                className={`group flex items-center gap-4 rounded-2xl border-2 px-6 py-5 text-left transition duration-200 ${
                  active
                    ? "border-lime-200/70 bg-lime-200/8 shadow-[0_0_0_4px_rgba(215,255,75,0.08)]"
                    : "border-white/12 hover:border-white/30"
                }`}
              >
                <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg border text-xs font-bold transition ${active ? "border-lime-200 bg-lime-200 text-black" : "border-white/20 text-white/40 group-hover:border-white/40"}`}>
                  {option.key}
                </span>
                <span className={`text-xl font-medium transition ${active ? "text-white" : "text-white/60 group-hover:text-white"}`}>
                  {option.label}
                </span>
              </button>
            );
          })}
        </div>
      );
    }

    if (question.id === "province") {
      return (
        <select
          value={form.province}
          onChange={(event) => updateField("province", event.target.value)}
          autoFocus
          className={inputClass}
        >
          <option value="" disabled>{question.placeholder}</option>
          {provinces.map((province) => (
            <option key={province} value={province}>{province}</option>
          ))}
        </select>
      );
    }

    if (question.id === "ownerId") {
      return (
        <select
          value={form.ownerId}
          onChange={(event) => updateField("ownerId", event.target.value)}
          autoFocus
          className={inputClass}
        >
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>{agent.name}</option>
          ))}
        </select>
      );
    }

    if (question.type === "textarea") {
      return (
        <textarea
          value={String(form[question.id as TextField] ?? "")}
          onChange={(event) => updateField(question.id as TextField, event.target.value)}
          placeholder={question.placeholder}
          autoFocus
          rows={3}
          className={`${inputClass} resize-none leading-9`}
        />
      );
    }

    return (
      <input
        type={question.type}
        inputMode={question.inputMode}
        autoComplete={question.autoComplete}
        value={String(form[question.id as TextField] ?? "")}
        onChange={(event) => updateField(question.id as TextField, event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            continueToNext();
          }
        }}
        placeholder={question.placeholder}
        autoFocus
        className={inputClass}
      />
    );
  }

  const animClass = direction === "forward"
    ? "animate-[tf-in_0.35s_cubic-bezier(0.22,1,0.36,1)_both]"
    : "animate-[tf-back_0.35s_cubic-bezier(0.22,1,0.36,1)_both]";

  if (!hasStarted) {
    return (
      <div className="relative isolate flex min-h-screen w-full flex-col overflow-hidden bg-[#020202]">
        <EnergyWaitingRoomBackground />
        <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 py-16 text-white">
          <div className="w-full max-w-2xl animate-[tf-in_0.5s_cubic-bezier(0.22,1,0.36,1)_both]">
            <p className="text-[0.62rem] uppercase tracking-[0.3em] text-lime-200/60">{eyebrow}</p>
            <h1 className="mt-5 text-[clamp(2.8rem,6vw,4.8rem)] font-semibold leading-[1.08] tracking-[-0.03em] text-white">
              {title}
            </h1>
            <p className="mt-5 max-w-lg text-base leading-8 text-white/52">
              {description}
            </p>
            <p className="mt-8 text-sm text-white/40">
              Installed, maintained, insured by us.. You save up to 50%
            </p>
            <div className="mt-10 flex items-center gap-5">
              <button
                type="button"
                onClick={() => setHasStarted(true)}
                className="group inline-flex items-center gap-3 rounded-full bg-lime-200 px-7 py-4 text-sm font-bold uppercase tracking-[0.18em] text-black transition duration-200 hover:bg-white hover:shadow-[0_0_40px_rgba(215,255,75,0.3)]"
              >
                Start registration
                <span className="transition-transform duration-200 group-hover:translate-x-1">&rarr;</span>
              </button>
              <span className="text-sm text-white/28">About 3 minutes.</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative isolate flex min-h-screen w-full flex-col overflow-hidden bg-[#020202] text-white">
      <EnergyWaitingRoomBackground />
      {/* Progress bar */}
      <div className="fixed inset-x-0 top-0 z-50 h-[3px] bg-white/[0.06]">
        <div
          className="h-full bg-lime-200/70 transition-[width] duration-500 ease-out"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Top bar */}
      <header className="fixed inset-x-0 top-[3px] z-40 flex items-center justify-between border-b border-white/[0.06] bg-[#020202]/80 px-6 py-3 backdrop-blur-sm">
        <p className="text-[0.58rem] uppercase tracking-[0.26em] text-white/28">{eyebrow}</p>
        <p className="text-[0.58rem] uppercase tracking-[0.2em] text-white/28">
          {isOnReview ? "Review" : activeQuestion.kicker} &middot; {progressPercent}%
        </p>
      </header>

      {/* Main content */}
      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 pb-28 pt-24">
        <div
          key={isOnReview ? "review" : activeQuestion.id}
          className={`w-full max-w-xl ${animClass}`}
        >
          {isOnReview ? (
            <div>
              <p className="text-[0.62rem] uppercase tracking-[0.28em] text-lime-200/60">Final check</p>
              <h2 className="mt-4 text-3xl font-semibold tracking-[-0.025em] text-white md:text-4xl">
                Ready to create the profile?
              </h2>
              <p className="mt-3 text-sm leading-7 text-white/44">
                Review the answers below. Click any card to go back and edit it.
              </p>
              <div className="mt-8 grid gap-2 sm:grid-cols-2">
                {questions.map((question, index) => {
                  const rawValue = form[question.id as keyof RegistrationFormState];
                  const display = typeof rawValue === "boolean" ? (rawValue ? "Yes" : "No") : String(rawValue || "—");
                  return (
                    <button
                      key={question.id}
                      type="button"
                      onClick={() => { setDirection("back"); setStep(index); }}
                      className="rounded-xl border border-white/8 bg-white/[0.025] p-4 text-left transition hover:border-white/18 hover:bg-white/[0.05]"
                    >
                      <span className="block text-[0.52rem] uppercase tracking-[0.18em] text-white/26">{question.kicker}</span>
                      <span className="mt-1.5 block text-[0.68rem] leading-4 text-white/38">{question.title}</span>
                      <span className="mt-2 block truncate text-sm font-medium text-white">{display}</span>
                    </button>
                  );
                })}
              </div>
              {formError || successMessage ? (
                <p className={`mt-5 rounded-xl border px-4 py-3 text-sm ${formError ? "border-rose-400/22 bg-rose-400/6 text-rose-300" : "border-emerald-400/22 bg-emerald-400/6 text-emerald-300"}`}>
                  {formError ?? successMessage}
                </p>
              ) : null}
            </div>
          ) : (
            <div>
              <p className="text-[0.62rem] uppercase tracking-[0.28em] text-lime-200/60">
                {activeQuestion.kicker}
              </p>
              <h2 className="mt-4 text-3xl font-semibold leading-[1.15] tracking-[-0.025em] text-white md:text-4xl">
                {activeQuestion.title}
              </h2>
              <p className="mt-3 text-sm leading-7 text-white/44">
                {activeQuestion.helper}
              </p>
              {renderInput(activeQuestion)}
              {formError ? (
                <p className="mt-4 rounded-xl border border-rose-400/22 bg-rose-400/6 px-4 py-3 text-sm text-rose-300">
                  {formError}
                </p>
              ) : null}
            </div>
          )}
        </div>
      </main>

      {/* Fixed bottom action bar */}
      <footer className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.08] bg-[#020202]/95 px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4 backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-xl items-center justify-between gap-3">
          <button
            type="button"
            onClick={goBack}
            disabled={step === 0 && !isOnReview}
            className="flex shrink-0 items-center gap-2 rounded-full border border-white/18 bg-white/[0.07] px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.18em] text-white/78 transition hover:border-white/30 hover:text-white disabled:cursor-not-allowed disabled:opacity-55"
          >
            &larr; Back
          </button>
          {isOnReview ? (
            <button
              type="button"
              onClick={handleRegisterClient}
              disabled={!isFormComplete || isSubmitting}
              className="flex items-center gap-3 rounded-full bg-lime-200 px-7 py-2.5 text-xs font-bold uppercase tracking-[0.18em] text-black transition hover:bg-white disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/30"
            >
              {isSubmitting ? "Submitting..." : submitLabel}
            </button>
          ) : (
            <div className="flex shrink-0 items-center justify-end gap-3">
              <button
                type="button"
                onClick={continueToNext}
                className="group flex items-center gap-3 rounded-full bg-white px-6 py-2.5 text-xs font-bold uppercase tracking-[0.18em] text-black transition hover:bg-lime-200"
              >
                OK
                <span className="transition-transform duration-200 group-hover:translate-x-0.5">&rarr;</span>
              </button>
              <span className="block text-[0.58rem] font-semibold uppercase tracking-[0.14em] text-white/52">Press Enter &crarr;</span>
            </div>
          )}
        </div>
      </footer>
    </div>
  );
}
