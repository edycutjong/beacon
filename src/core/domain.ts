// ── Domain Classifier ─────────────────────────────────────────────────────────
// Beacon double-dips the hackathon tracks: a general field query runs on the
// small Llama model, but a *medical / triage* query is routed to QVAC's
// specialized MedPsy model — higher clinical reasoning quality at a 1.7B size.
// This classifier is a pure, offline, deterministic function so it is trivially
// unit-tested and adds zero latency. See [[router]] for how it picks the model.

export type Domain = "medical" | "general";

// Field-medicine / triage vocabulary. Kept lowercase; matched as substrings so
// inflections ("bleeding", "bleed", "bled") are caught without a stemmer.
const MEDICAL_TERMS: readonly string[] = [
  "wound", "bleed", "blood", "fracture", "broken bone", "burn", "cpr", "triage",
  "injur", "dose", "dosage", "tourniquet", "crush", "shock", "pulse", "airway",
  "splint", "laceration", "sprain", "concussion", "hypothermia", "dehydrat",
  "seizure", "allergic", "anaphyla", "bandage", "suture", "antibiotic",
  "infection", "unconscious", "breathing", "snakebite", "poison", "heatstroke",
  "frostbite", "amputat", "vitals", "patient", "medic", "first aid", "wounded",
  "choking", "diabet", "asthma", "overdose", "hemorrhage", "compress",
];

/** Classify a query into a routing domain. Medical queries get MedPsy. */
export function classifyDomain(query: string): Domain {
  const q = query.toLowerCase();
  for (const term of MEDICAL_TERMS) {
    if (q.includes(term)) return "medical";
  }
  return "general";
}

/** Short human label for the HUD badge. */
export function domainLabel(domain: Domain): string {
  return domain === "medical" ? "MEDICAL TRIAGE" : "GENERAL";
}
