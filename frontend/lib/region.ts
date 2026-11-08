/** Risk Radar country fields can list several countries: "Chad, Niger, Cameroon, Nigeria" → four names. */
export const splitCountries = (value: string | null | undefined): string[] =>
  (value ?? '')
    .split(/[,;/]| and /)
    .map((s) => s.trim())
    .filter(Boolean);
