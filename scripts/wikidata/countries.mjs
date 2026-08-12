/**
 * Country → Wikidata QID mapping for the "Presidents / Leaders" category.
 *
 * Each entry defines:
 *   - name: display name used in question text
 *   - qid: Wikidata entity ID (e.g., "Q1033" for Nigeria)
 *   - role: which political position to fetch
 *       "president"      → P35 (head of state)
 *       "prime-minister" → P6 (head of government)
 *       "chancellor"     → P6 (head of government, but title is "Chancellor")
 *       "monarch"        → P35 (head of state, title is "King"/"Queen")
 *       "supreme-leader" → special case for Iran (P35 with custom title)
 *   - level: 1 (Easy), 2 (Medium), 3 (Hard)
 *
 * The title in the question text is derived from the role:
 *   "president"      → "President of {name}"
 *   "prime-minister" → "Prime Minister of {name}"
 *   "chancellor"     → "Chancellor of {name}"
 *   "monarch"        → "King/Queen of {name}" (resolved from Wikidata)
 *   "supreme-leader" → "Supreme Leader of {name}"
 */

/** @typedef {"president" | "prime-minister" | "chancellor" | "monarch" | "supreme-leader"} Role */

/**
 * @typedef {Object} CountryEntry
 * @property {string} name
 * @property {string} qid
 * @property {Role} role
 * @property {number} level
 */

/** @type {Record<string, CountryEntry[]>} */
export const COUNTRIES = {
  Africa: [
    // Level 1 (Easy)
    { name: "Nigeria", qid: "Q1033", role: "president", level: 1 },
    { name: "South Africa", qid: "Q258", role: "president", level: 1 },
    { name: "Kenya", qid: "Q114", role: "president", level: 1 },
    { name: "Rwanda", qid: "Q954", role: "president", level: 1 },
    { name: "Ghana", qid: "Q117", role: "president", level: 1 },
    { name: "Egypt", qid: "Q79", role: "president", level: 1 },
    { name: "Uganda", qid: "Q1036", role: "president", level: 1 },
    { name: "Senegal", qid: "Q1041", role: "president", level: 1 },
    // Level 2 (Medium)
    { name: "Zimbabwe", qid: "Q954", role: "president", level: 2 },
    { name: "Tanzania", qid: "Q924", role: "president", level: 2 },
    { name: "Algeria", qid: "Q262", role: "president", level: 2 },
    { name: "Ethiopia", qid: "Q115", role: "president", level: 2 },
    { name: "Angola", qid: "Q916", role: "president", level: 2 },
    { name: "Mozambique", qid: "Q1029", role: "president", level: 2 },
    { name: "Ivory Coast", qid: "Q1008", role: "president", level: 2 },
    { name: "Cameroon", qid: "Q1009", role: "president", level: 2 },
    // Level 3 (Hard)
    { name: "Namibia", qid: "Q1030", role: "president", level: 3 },
    { name: "Botswana", qid: "Q963", role: "president", level: 3 },
    { name: "Madagascar", qid: "Q1019", role: "president", level: 3 },
    { name: "Zambia", qid: "Q953", role: "president", level: 3 },
    { name: "Burkina Faso", qid: "Q965", role: "president", level: 3 },
    { name: "Mali", qid: "Q912", role: "president", level: 3 },
    { name: "Chad", qid: "Q657", role: "president", level: 3 },
    { name: "DR Congo", qid: "Q974", role: "president", level: 3 },
  ],
  Asia: [
    // Level 1
    { name: "Japan", qid: "Q17", role: "prime-minister", level: 1 },
    { name: "China", qid: "Q148", role: "president", level: 1 },
    { name: "India", qid: "Q668", role: "prime-minister", level: 1 },
    { name: "South Korea", qid: "Q884", role: "president", level: 1 },
    { name: "Indonesia", qid: "Q252", role: "president", level: 1 },
    { name: "Saudi Arabia", qid: "Q851", role: "monarch", level: 1 },
    { name: "Turkey", qid: "Q43", role: "president", level: 1 },
    { name: "Philippines", qid: "Q928", role: "president", level: 1 },
    // Level 2
    { name: "Pakistan", qid: "Q843", role: "prime-minister", level: 2 },
    { name: "Iran", qid: "Q794", role: "supreme-leader", level: 2 },
    { name: "Vietnam", qid: "Q881", role: "prime-minister", level: 2 },
    { name: "Malaysia", qid: "Q833", role: "prime-minister", level: 2 },
    { name: "Thailand", qid: "Q869", role: "prime-minister", level: 2 },
    { name: "Bangladesh", qid: "Q902", role: "president", level: 2 },
    { name: "Israel", qid: "Q801", role: "prime-minister", level: 2 },
    { name: "Iraq", qid: "Q796", role: "president", level: 2 },
    // Level 3
    { name: "Kazakhstan", qid: "Q232", role: "president", level: 3 },
    { name: "Uzbekistan", qid: "Q265", role: "president", level: 3 },
    { name: "Cambodia", qid: "Q424", role: "prime-minister", level: 3 },
    { name: "Mongolia", qid: "Q711", role: "president", level: 3 },
    { name: "Sri Lanka", qid: "Q854", role: "president", level: 3 },
    { name: "Nepal", qid: "Q837", role: "prime-minister", level: 3 },
    { name: "Laos", qid: "Q819", role: "president", level: 3 },
    { name: "UAE", qid: "Q878", role: "president", level: 3 },
  ],
  Europe: [
    // Level 1
    { name: "France", qid: "Q142", role: "president", level: 1 },
    { name: "Germany", qid: "Q183", role: "chancellor", level: 1 },
    { name: "United Kingdom", qid: "Q145", role: "prime-minister", level: 1 },
    { name: "Italy", qid: "Q38", role: "prime-minister", level: 1 },
    { name: "Russia", qid: "Q159", role: "president", level: 1 },
    { name: "Spain", qid: "Q29", role: "prime-minister", level: 1 },
    { name: "Netherlands", qid: "Q55", role: "prime-minister", level: 1 },
    { name: "Poland", qid: "Q36", role: "president", level: 1 },
    // Level 2
    { name: "Sweden", qid: "Q34", role: "prime-minister", level: 2 },
    { name: "Norway", qid: "Q20", role: "prime-minister", level: 2 },
    { name: "Denmark", qid: "Q35", role: "prime-minister", level: 2 },
    { name: "Finland", qid: "Q33", role: "president", level: 2 },
    { name: "Greece", qid: "Q41", role: "prime-minister", level: 2 },
    { name: "Ukraine", qid: "Q212", role: "president", level: 2 },
    { name: "Portugal", qid: "Q45", role: "prime-minister", level: 2 },
    { name: "Austria", qid: "Q40", role: "chancellor", level: 2 },
    // Level 3
    { name: "Romania", qid: "Q218", role: "president", level: 3 },
    { name: "Hungary", qid: "Q28", role: "prime-minister", level: 3 },
    { name: "Croatia", qid: "Q224", role: "prime-minister", level: 3 },
    { name: "Serbia", qid: "Q403", role: "president", level: 3 },
    { name: "Czech Republic", qid: "Q213", role: "president", level: 3 },
    { name: "Bulgaria", qid: "Q219", role: "president", level: 3 },
    { name: "Iceland", qid: "Q189", role: "president", level: 3 },
    { name: "Slovakia", qid: "Q214", role: "president", level: 3 },
  ],
  Americas: [
    // Level 1
    { name: "the United States", qid: "Q30", role: "president", level: 1 },
    { name: "Canada", qid: "Q16", role: "prime-minister", level: 1 },
    { name: "Brazil", qid: "Q155", role: "president", level: 1 },
    { name: "Mexico", qid: "Q96", role: "president", level: 1 },
    { name: "Argentina", qid: "Q414", role: "president", level: 1 },
    { name: "Colombia", qid: "Q739", role: "president", level: 1 },
    { name: "Peru", qid: "Q419", role: "president", level: 1 },
    { name: "Cuba", qid: "Q241", role: "president", level: 1 },
    // Level 2
    { name: "Chile", qid: "Q298", role: "president", level: 2 },
    { name: "Venezuela", qid: "Q717", role: "president", level: 2 },
    { name: "Ecuador", qid: "Q736", role: "president", level: 2 },
    { name: "Uruguay", qid: "Q77", role: "president", level: 2 },
    { name: "Bolivia", qid: "Q750", role: "president", level: 2 },
    { name: "Panama", qid: "Q804", role: "president", level: 2 },
    { name: "Jamaica", qid: "Q760", role: "prime-minister", level: 2 },
    { name: "Costa Rica", qid: "Q800", role: "president", level: 2 },
    // Level 3
    { name: "Paraguay", qid: "Q733", role: "president", level: 3 },
    { name: "Guatemala", qid: "Q774", role: "president", level: 3 },
    { name: "Honduras", qid: "Q783", role: "president", level: 3 },
    { name: "El Salvador", qid: "Q792", role: "president", level: 3 },
    { name: "Nicaragua", qid: "Q811", role: "president", level: 3 },
    { name: "Dominican Republic", qid: "Q786", role: "president", level: 3 },
    { name: "Guyana", qid: "Q734", role: "president", level: 3 },
    {
      name: "Trinidad and Tobago",
      qid: "Q754",
      role: "prime-minister",
      level: 3,
    },
  ],
};

/**
 * Maps a role to the question title prefix.
 * @param {Role} role
 * @returns {string}
 */
export function roleToTitle(role) {
  switch (role) {
    case "president":
      return "President";
    case "prime-minister":
      return "Prime Minister";
    case "chancellor":
      return "Chancellor";
    case "monarch":
      return "Monarch"; // resolved at fetch time to "King"/"Queen"
    case "supreme-leader":
      return "Supreme Leader";
    default:
      return "Leader";
  }
}

/**
 * Maps a role to the Wikidata property used to fetch the current leader.
 * @param {Role} role
 * @returns {string} Wikidata property ID ("P35" or "P6")
 */
export function roleToProperty(role) {
  // P35 = head of state, P6 = head of government
  if (role === "president" || role === "monarch" || role === "supreme-leader") {
    return "P35";
  }
  return "P6";
}
