// Client-safe template registry. Each entry describes a government form layout
// and the field-mapping aliases used to auto-fill from extracted documents
// and collected demographics.

export type TemplateField = {
  key: string; // PDF AcroForm field name
  label: string;
  required?: boolean;
  aliases?: string[]; // alt keys we look for in extracted-doc fields
  source?: "aadhaar" | "ration" | "income" | "demographics" | "user";
  example?: string;
  group?: string; // optional grouping for UI
};

export type FormTemplate = {
  id: string;
  name: string;
  ministry: string;
  scheme: string;
  fields: TemplateField[];
};

export const TEMPLATES: FormTemplate[] = [
  {
    id: "pmkisan",
    name: "PM-KISAN — Farmer Income Support",
    ministry: "Ministry of Agriculture & Farmers Welfare",
    scheme: "Pradhan Mantri Kisan Samman Nidhi",
    fields: [
      { key: "applicant_name", label: "Applicant name", required: true, aliases: ["applicant_name", "name", "head_of_family"], source: "aadhaar" },
      { key: "father_name", label: "Father / Husband name", aliases: ["father_or_husband_name"], source: "aadhaar" },
      { key: "uid_number", label: "Aadhaar UID", required: true, aliases: ["uid_number", "aadhaar"], source: "aadhaar" },
      { key: "dob", label: "Date of birth", aliases: ["dob"], source: "aadhaar" },
      { key: "gender", label: "Gender", aliases: ["gender"], source: "aadhaar" },
      { key: "address", label: "Residential address", aliases: ["address_complete", "address"], source: "aadhaar" },
      { key: "state", label: "State", aliases: ["state"], source: "demographics" },
      { key: "district", label: "District", aliases: ["district"], source: "demographics" },
      { key: "land_holding_acres", label: "Land holding (acres)", source: "user", example: "1.5" },
      { key: "bank_account", label: "Bank account number", required: true, source: "user" },
      { key: "ifsc", label: "IFSC code", required: true, source: "user" },
    ],
  },
  {
    id: "pmuy",
    name: "PMUY — Free LPG Connection",
    ministry: "Ministry of Petroleum & Natural Gas",
    scheme: "Pradhan Mantri Ujjwala Yojana",
    fields: [
      { key: "applicant_name", label: "Applicant name (female head)", required: true, aliases: ["applicant_name", "head_of_family", "name"], source: "aadhaar" },
      { key: "uid_number", label: "Aadhaar UID", required: true, aliases: ["uid_number"], source: "aadhaar" },
      { key: "ration_card_number", label: "Ration card number", required: true, aliases: ["card_number"], source: "ration" },
      { key: "ration_card_type", label: "Ration card type", aliases: ["card_type"], source: "ration" },
      { key: "address", label: "Address", aliases: ["address_complete", "address"], source: "aadhaar" },
      { key: "state", label: "State", source: "demographics" },
      { key: "district", label: "District", source: "demographics" },
      { key: "mobile", label: "Mobile number", required: true, source: "user" },
      { key: "preferred_distributor", label: "Preferred LPG distributor", source: "user" },
    ],
  },
  {
    id: "ayushman",
    name: "Ayushman Bharat (PM-JAY) — Health Cover",
    ministry: "Ministry of Health & Family Welfare",
    scheme: "Ayushman Bharat — Pradhan Mantri Jan Arogya Yojana",
    fields: [
      { key: "applicant_name", label: "Applicant name", required: true, aliases: ["applicant_name", "head_of_family"], source: "aadhaar" },
      { key: "uid_number", label: "Aadhaar UID", required: true, aliases: ["uid_number"], source: "aadhaar" },
      { key: "dob", label: "Date of birth", aliases: ["dob"], source: "aadhaar" },
      { key: "gender", label: "Gender", aliases: ["gender"], source: "aadhaar" },
      { key: "ration_card_number", label: "Ration card / SECC ID", aliases: ["card_number"], source: "ration" },
      { key: "address", label: "Address", aliases: ["address_complete"], source: "aadhaar" },
      { key: "state", label: "State", source: "demographics" },
      { key: "district", label: "District", source: "demographics" },
      { key: "mobile", label: "Mobile number", required: true, source: "user" },
    ],
  },
  {
    id: "pmay-g",
    name: "PMAY-G — Rural Housing",
    ministry: "Ministry of Rural Development",
    scheme: "Pradhan Mantri Awas Yojana — Gramin",
    fields: [
      { key: "applicant_name", label: "Applicant name", required: true, aliases: ["applicant_name", "head_of_family"], source: "aadhaar" },
      { key: "uid_number", label: "Aadhaar UID", required: true, aliases: ["uid_number"], source: "aadhaar" },
      { key: "father_name", label: "Father / Husband name", aliases: ["father_or_husband_name"], source: "aadhaar" },
      { key: "annual_income", label: "Annual income (INR)", aliases: ["annual_income", "income_annual"], source: "income" },
      { key: "ration_card_number", label: "Ration card number", aliases: ["card_number"], source: "ration" },
      { key: "village", label: "Village", source: "user" },
      { key: "state", label: "State", source: "demographics" },
      { key: "district", label: "District", source: "demographics" },
      { key: "bank_account", label: "Bank account", required: true, source: "user" },
      { key: "ifsc", label: "IFSC code", required: true, source: "user" },
    ],
  },
  {
    id: "ignoaps",
    name: "IGNOAPS — Old Age Pension",
    ministry: "Ministry of Rural Development",
    scheme: "Indira Gandhi National Old Age Pension Scheme",
    fields: [
      { key: "applicant_name", label: "Applicant name", required: true, aliases: ["applicant_name", "name"], source: "aadhaar" },
      { key: "uid_number", label: "Aadhaar UID", required: true, aliases: ["uid_number"], source: "aadhaar" },
      { key: "dob", label: "Date of birth (must be 60+)", aliases: ["dob"], source: "aadhaar" },
      { key: "annual_income", label: "Annual family income (INR)", aliases: ["annual_income"], source: "income" },
      { key: "address", label: "Address", aliases: ["address_complete"], source: "aadhaar" },
      { key: "state", label: "State", source: "demographics" },
      { key: "district", label: "District", source: "demographics" },
      { key: "bank_account", label: "Bank account", required: true, source: "user" },
      { key: "ifsc", label: "IFSC code", required: true, source: "user" },
    ],
  },
];

export function getTemplate(id: string): FormTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

export type MappedField = {
  key: string;
  label: string;
  value: string;
  confidence: number; // 0..1
  source: string; // human-readable provenance
  required: boolean;
};

type DocLike = { kind: string; fields: Record<string, string> };
type DemographicsLike = Record<string, unknown>;

/** Walk template fields and pull matching values from docs + demographics. */
export function autoMapTemplate(
  template: FormTemplate,
  docs: DocLike[],
  demographics: DemographicsLike,
  userOverrides: Record<string, string> = {},
): MappedField[] {
  return template.fields.map((f) => {
    if (userOverrides[f.key] != null && userOverrides[f.key] !== "") {
      return {
        key: f.key,
        label: f.label,
        value: userOverrides[f.key],
        confidence: 1,
        source: "user override",
        required: !!f.required,
      };
    }
    const aliases = [f.key, ...(f.aliases ?? [])];
    // exact alias match in matching-kind doc
    for (const alias of aliases) {
      for (const d of docs) {
        if (f.source && f.source !== "user" && f.source !== "demographics" && d.kind !== f.source) continue;
        const v = d.fields[alias];
        if (v != null && v !== "") {
          return {
            key: f.key,
            label: f.label,
            value: String(v),
            confidence: 0.92,
            source: `${d.kind} card`,
            required: !!f.required,
          };
        }
      }
    }
    // demographics
    for (const alias of aliases) {
      const v = (demographics as Record<string, unknown>)[alias];
      if (v != null && v !== "") {
        return {
          key: f.key,
          label: f.label,
          value: String(v),
          confidence: 0.85,
          source: "demographics",
          required: !!f.required,
        };
      }
    }
    // fuzzy: any doc field whose key contains alias substring
    for (const alias of aliases) {
      for (const d of docs) {
        const found = Object.entries(d.fields).find(
          ([k]) => k.toLowerCase().includes(alias.toLowerCase()),
        );
        if (found && found[1]) {
          return {
            key: f.key,
            label: f.label,
            value: String(found[1]),
            confidence: 0.55,
            source: `${d.kind} card (fuzzy)`,
            required: !!f.required,
          };
        }
      }
    }
    return {
      key: f.key,
      label: f.label,
      value: "",
      confidence: 0,
      source: "missing",
      required: !!f.required,
    };
  });
}
