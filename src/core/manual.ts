// ── Bundled Offline Field Manual ──────────────────────────────────────────────
// The RAG corpus Beacon ships *on-device* so answers can be grounded and cited
// with the network physically gone. In production this is ingested into QVAC's
// vector index via `ragIngest`; here it doubles as the source of truth for the
// local lexical retriever in [[rag]]. Page numbers are illustrative of a real
// printed field manual so citations read authentically in the demo.

export interface ManualEntry {
  /** Stable citation id. */
  id: string;
  /** Section title shown in the citation. */
  title: string;
  /** Page in the source manual. */
  page: number;
  /** Retrieval tags (boost lexical matching). */
  tags: string[];
  /** The passage text. */
  text: string;
}

export const FIELD_MANUAL: readonly ManualEntry[] = [
  {
    id: "fm-001",
    title: "Severe Bleeding & Tourniquet Use",
    page: 12,
    tags: ["bleed", "blood", "hemorrhage", "tourniquet", "wound", "compress"],
    text: "For life-threatening limb bleeding, apply a tourniquet 5-7 cm above the wound, never over a joint. Tighten until bright-red bleeding stops, then note the time. Do not loosen once applied. For non-limb wounds, pack the wound and apply firm direct pressure for at least 10 uninterrupted minutes.",
  },
  {
    id: "fm-002",
    title: "Crush Injury Management",
    page: 18,
    tags: ["crush", "injur", "compress", "shock", "limb"],
    text: "Suspect crush syndrome when a limb has been compressed for over 15 minutes. Before release, establish IV access and begin fluids if available, because sudden reperfusion can release toxins causing cardiac arrest. Splint the limb, keep the casualty warm, and evacuate as a priority. Avoid elevating the crushed limb above heart level.",
  },
  {
    id: "fm-003",
    title: "Fractures & Splinting",
    page: 24,
    tags: ["fracture", "broken bone", "splint", "sprain", "immobil"],
    text: "Immobilize a suspected fracture in the position found, splinting the joints above and below the break. Check circulation, sensation, and movement distal to the injury before and after splinting. For open fractures, cover the wound with a sterile dressing first and do not push protruding bone back in.",
  },
  {
    id: "fm-004",
    title: "Burns — First Response",
    page: 31,
    tags: ["burn", "heatstroke", "scald", "thermal"],
    text: "Cool a thermal burn with clean running water for 20 minutes; do not use ice. Remove jewelry and loose clothing before swelling begins, but leave anything stuck to the burn. Cover with cling film or a non-adhesive dressing. Do not apply creams or butter. For burns larger than the casualty's palm, evacuate.",
  },
  {
    id: "fm-005",
    title: "Hypothermia in the Field",
    page: 44,
    tags: ["hypothermia", "cold", "frostbite", "exposure", "shock"],
    text: "For moderate hypothermia, move the casualty to shelter, remove wet clothing, and insulate from the ground. Re-warm the core (chest, neck, groin) gradually; handle gently as cold hearts are prone to arrhythmia. Give warm sweet fluids only if fully conscious. Do not rub frostbitten skin.",
  },
  {
    id: "fm-006",
    title: "Water Purification",
    page: 58,
    tags: ["water", "purif", "boil", "filter", "dehydrat"],
    text: "Bring clear water to a rolling boil for at least one minute (three minutes above 2000 m). If boiling is impossible, use chemical tablets and double the contact time for cold or cloudy water. Pre-filter sediment through cloth before treating. Untreated water is the leading cause of field casualty in prolonged deployments.",
  },
  {
    id: "fm-007",
    title: "Land Navigation Without GPS",
    page: 67,
    tags: ["navigation", "bearing", "compass", "map", "route", "base camp"],
    text: "To return to a known point without GPS, take a back-bearing: add or subtract 180 degrees from your outbound heading. Handrail along linear features such as rivers or ridgelines. Pace-count to estimate distance and aim off deliberately to one side of a small target so you know which way to turn when you hit a handrail.",
  },
  {
    id: "fm-008",
    title: "Wildfire Spread & Evacuation",
    page: 73,
    tags: ["wildfire", "fire", "evacuat", "wind", "smoke", "spread"],
    text: "Fire spreads fastest uphill and with the wind; a slope doubling adds roughly the equivalent of a 10 km/h wind. Evacuate downhill and crosswind toward the flanks, never uphill ahead of the front. Identify a safety zone of bare ground at least four times the flame height across before conditions deteriorate.",
  },
  {
    id: "fm-009",
    title: "Shock Recognition & Treatment",
    page: 21,
    tags: ["shock", "pulse", "unconscious", "pale", "bleed"],
    text: "Recognize shock by pale clammy skin, rapid weak pulse, and confusion. Lay the casualty flat and raise the legs 30 cm unless a head, chest, or spinal injury is suspected. Control any external bleeding, keep them warm, and give nothing by mouth. Reassess pulse and breathing every few minutes.",
  },
  {
    id: "fm-010",
    title: "Anaphylaxis & Allergic Reaction",
    page: 27,
    tags: ["allergic", "anaphyla", "epinephrine", "breathing", "swelling"],
    text: "For anaphylaxis — swelling, hives, and difficulty breathing — give intramuscular epinephrine into the outer thigh without delay and repeat after 5 minutes if no improvement. Sit the casualty upright if breathing is the main problem, or lay flat if faint. Evacuate even after recovery, as symptoms can rebound.",
  },
];
