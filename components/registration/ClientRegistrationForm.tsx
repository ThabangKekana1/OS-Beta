"use client";

import { useState } from "react";
import { AdminBadge, AdminHeader } from "@/components/admin/AdminPrimitives";
import {
  isValidSouthAfricanCompanyRegistration,
  SA_COMPANY_REGISTRATION_ERROR,
} from "@/lib/company-registration";
import type { AdminAgent, AdminLead } from "@/lib/admin-types";

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

type ClientRegistrationFormProps = {
  agents?: AdminAgent[];
  defaultOwnerId: string;
  lockOwner?: boolean;
  eyebrow?: string;
  title?: string;
  description?: string;
  submitLabel?: string;
  successMessage?: string | null;
  onSubmit: (values: RegistrationFormValues) => Promise<boolean> | boolean;
};

export function ClientRegistrationForm({
  agents = [],
  defaultOwnerId,
  lockOwner = false,
  eyebrow = "Client Registration",
  title = "Create a new dedicated client profile.",
  description = "Capture the required onboarding details, assign an agent, and open the profile page immediately.",
  submitLabel = "Register Client",
  successMessage = null,
  onSubmit,
}: ClientRegistrationFormProps) {
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState({
    businessName: "",
    businessRegistrationNumber: "",
    industry: "",
    contactFirstName: "",
    contactSurname: "",
    contactPosition: "",
    contactEmail: "",
    contactNumber: "",
    monthlyElectricitySpendEstimateZar: "",
    isBusinessRegistered: true,
    isBusinessOperational: true,
    hasSixMonthUtilityBill: false,
    physicalAddress: "",
    city: "",
    province: "",
    source: "Migrate Portal" as AdminLead["source"],
    ownerId: defaultOwnerId,
  });

  const isFormComplete =
    form.businessName.trim().length > 0 &&
    isValidSouthAfricanCompanyRegistration(form.businessRegistrationNumber) &&
    form.industry.trim().length > 0 &&
    form.contactFirstName.trim().length > 0 &&
    form.contactSurname.trim().length > 0 &&
    form.contactPosition.trim().length > 0 &&
    form.contactEmail.trim().length > 0 &&
    form.contactNumber.trim().length > 0 &&
    form.physicalAddress.trim().length > 0 &&
    form.city.trim().length > 0 &&
    form.province.trim().length > 0 &&
    Number(form.monthlyElectricitySpendEstimateZar) > 0 &&
    form.ownerId.trim().length > 0;

  const handleRegisterClient = async () => {
    if (!isFormComplete) {
      setFormError(
        isValidSouthAfricanCompanyRegistration(form.businessRegistrationNumber)
          ? "All registration fields are required before you can register the client."
          : SA_COMPANY_REGISTRATION_ERROR,
      );
      return;
    }

    setFormError(null);
    setIsSubmitting(true);
    const submitted = await onSubmit({
      businessName: form.businessName,
      businessRegistrationNumber: form.businessRegistrationNumber,
      industry: form.industry,
      contactFirstName: form.contactFirstName,
      contactSurname: form.contactSurname,
      contactPosition: form.contactPosition,
      contactEmail: form.contactEmail,
      contactNumber: form.contactNumber,
      monthlyElectricitySpendEstimateZar: Number(
        form.monthlyElectricitySpendEstimateZar,
      ),
      isBusinessRegistered: form.isBusinessRegistered,
      isBusinessOperational: form.isBusinessOperational,
      hasSixMonthUtilityBill: form.hasSixMonthUtilityBill,
      physicalAddress: form.physicalAddress,
      city: form.city,
      province: form.province,
      source: form.source,
      ownerId: form.ownerId,
    });
    setIsSubmitting(false);

    if (!submitted) {
      setFormError("Unable to register client. Check the details and try again.");
    }
  };

  return (
    <div className="flex w-full flex-col gap-4 lg:gap-5">
      <section className="app-surface rounded-[1.6rem] px-5 py-5 lg:px-6 lg:py-6">
        <AdminHeader
          eyebrow={eyebrow}
          title={title}
          description={description}
          actions={<AdminBadge label="Step 1 of Onboarding" tone="muted" />}
        />
      </section>

      <section className="app-surface rounded-[1.4rem] p-4 lg:p-5">
        <p className="line-label">Required Registration Fields</p>
        <p className="mt-3 text-sm text-white/56">
          {formError ?? successMessage ?? "All fields below are mandatory for client registration."}
        </p>
        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          <input
            placeholder="1. Business Name"
            value={form.businessName}
            onChange={(event) =>
              setForm((current) => ({ ...current, businessName: event.target.value }))
            }
            required
            className="admin-input rounded-[0.8rem] px-3 py-2 text-sm"
          />
          <input
            placeholder="2. Business Registration Number (2024/123456/07)"
            pattern="\\d{4}/\\d{6}/\\d{2}"
            value={form.businessRegistrationNumber}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                businessRegistrationNumber: event.target.value,
              }))
            }
            required
            className="admin-input rounded-[0.8rem] px-3 py-2 text-sm"
          />
          <input
            placeholder="3. Industry"
            value={form.industry}
            onChange={(event) =>
              setForm((current) => ({ ...current, industry: event.target.value }))
            }
            required
            className="admin-input rounded-[0.8rem] px-3 py-2 text-sm"
          />
          <input
            placeholder="4. Contact Name"
            value={form.contactFirstName}
            onChange={(event) =>
              setForm((current) => ({ ...current, contactFirstName: event.target.value }))
            }
            required
            className="admin-input rounded-[0.8rem] px-3 py-2 text-sm"
          />
          <input
            placeholder="5. Contact Surname"
            value={form.contactSurname}
            onChange={(event) =>
              setForm((current) => ({ ...current, contactSurname: event.target.value }))
            }
            required
            className="admin-input rounded-[0.8rem] px-3 py-2 text-sm"
          />
          <input
            placeholder="6. Position in Company"
            value={form.contactPosition}
            onChange={(event) =>
              setForm((current) => ({ ...current, contactPosition: event.target.value }))
            }
            required
            className="admin-input rounded-[0.8rem] px-3 py-2 text-sm"
          />
          <input
            placeholder="7. Contact Email"
            value={form.contactEmail}
            onChange={(event) =>
              setForm((current) => ({ ...current, contactEmail: event.target.value }))
            }
            required
            className="admin-input rounded-[0.8rem] px-3 py-2 text-sm"
          />
          <input
            placeholder="8. Contact Number"
            value={form.contactNumber}
            onChange={(event) =>
              setForm((current) => ({ ...current, contactNumber: event.target.value }))
            }
            required
            className="admin-input rounded-[0.8rem] px-3 py-2 text-sm"
          />
          <input
            type="number"
            min={0}
            placeholder="9. Monthly Electricity Spend (ZAR)"
            value={form.monthlyElectricitySpendEstimateZar}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                monthlyElectricitySpendEstimateZar: event.target.value,
              }))
            }
            required
            className="admin-input rounded-[0.8rem] px-3 py-2 text-sm"
          />
          <select
            value={form.isBusinessRegistered ? "yes" : "no"}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                isBusinessRegistered: event.target.value === "yes",
              }))
            }
            required
            className="admin-input admin-select rounded-[0.8rem] px-3 py-2 text-sm"
          >
            <option value="yes">10. Is the business registered? Yes</option>
            <option value="no">10. Is the business registered? No</option>
          </select>
          <select
            value={form.isBusinessOperational ? "yes" : "no"}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                isBusinessOperational: event.target.value === "yes",
              }))
            }
            required
            className="admin-input admin-select rounded-[0.8rem] px-3 py-2 text-sm"
          >
            <option value="yes">11. Is the business operational? Yes</option>
            <option value="no">11. Is the business operational? No</option>
          </select>
          <select
            value={form.hasSixMonthUtilityBill ? "yes" : "no"}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                hasSixMonthUtilityBill: event.target.value === "yes",
              }))
            }
            required
            className="admin-input admin-select rounded-[0.8rem] px-3 py-2 text-sm"
          >
            <option value="yes">12. Do you have a 6 month utility bill? Yes</option>
            <option value="no">12. Do you have a 6 month utility bill? No</option>
          </select>
          <input
            placeholder="13. Physical Address"
            value={form.physicalAddress}
            onChange={(event) =>
              setForm((current) => ({ ...current, physicalAddress: event.target.value }))
            }
            required
            className="admin-input rounded-[0.8rem] px-3 py-2 text-sm"
          />
          <input
            placeholder="14. City"
            value={form.city}
            onChange={(event) =>
              setForm((current) => ({ ...current, city: event.target.value }))
            }
            required
            className="admin-input rounded-[0.8rem] px-3 py-2 text-sm"
          />
          <select
            value={form.province}
            onChange={(event) =>
              setForm((current) => ({ ...current, province: event.target.value }))
            }
            required
            className="admin-input admin-select rounded-[0.8rem] px-3 py-2 text-sm"
          >
            <option value="" disabled>
              15. Province
            </option>
            <option value="Eastern Cape">Eastern Cape</option>
            <option value="Free State">Free State</option>
            <option value="Gauteng">Gauteng</option>
            <option value="KwaZulu-Natal">KwaZulu-Natal</option>
            <option value="Limpopo">Limpopo</option>
            <option value="Mpumalanga">Mpumalanga</option>
            <option value="Northern Cape">Northern Cape</option>
            <option value="North West">North West</option>
            <option value="Western Cape">Western Cape</option>
          </select>
          {lockOwner ? null : (
            <select
              value={form.ownerId}
              onChange={(event) =>
                setForm((current) => ({ ...current, ownerId: event.target.value }))
              }
              required
              className="admin-input admin-select rounded-[0.8rem] px-3 py-2 text-sm"
            >
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  Assigned Agent: {agent.name}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={handleRegisterClient}
            disabled={!isFormComplete || isSubmitting}
            className="inline-flex items-center justify-center whitespace-nowrap rounded-full border border-white/16 bg-white/[0.16] px-4 py-2 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-white transition hover:border-white/30 hover:bg-white/[0.24] disabled:cursor-not-allowed disabled:opacity-45"
          >
            {isSubmitting ? "Registering" : submitLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
