const SA_COMPANY_REGISTRATION_PATTERN = /^\d{4}\/\d{6}\/\d{2}$/;

export function isValidSouthAfricanCompanyRegistration(value: string) {
  return SA_COMPANY_REGISTRATION_PATTERN.test(value.trim());
}

export const SA_COMPANY_REGISTRATION_ERROR =
  "Company registration number must use the South African format 2024/123456/07.";
