// Sanitize user inputs before passing to search queries and LLM prompts

const MAX_FIELD_LENGTH = 500;
const MAX_NOTES_LENGTH = 2000;

// Strip anything that could be prompt injection or search manipulation
function cleanField(value: string, maxLength: number): string {
  return value
    .slice(0, maxLength)
    .replace(/[<>{}]/g, "") // remove HTML/template chars
    .replace(/\r?\n/g, " ") // flatten newlines
    .trim();
}

export function sanitizeInput(input: Record<string, string>): Record<string, string> {
  return {
    buildingType: cleanField(input.buildingType || "", MAX_FIELD_LENGTH),
    location: cleanField(input.location || "", MAX_FIELD_LENGTH),
    squareFootage: cleanField(input.squareFootage || "", 20),
    stories: cleanField(input.stories || "", 10),
    buildingHeight: cleanField(input.buildingHeight || "", 20),
    constructionType: cleanField(input.constructionType || "", MAX_FIELD_LENGTH),
    occupancyType: cleanField(input.occupancyType || "", MAX_FIELD_LENGTH),
    occupantLoad: cleanField(input.occupantLoad || "", 20),
    lotSize: cleanField(input.lotSize || "", MAX_FIELD_LENGTH),
    additionalNotes: cleanField(input.additionalNotes || "", MAX_NOTES_LENGTH),
  };
}

// Validate required fields are present and reasonable
export function validateInput(input: { [key: string]: string | undefined }): string | null {
  if (!input.buildingType) return "Building type is required";
  if (!input.location) return "Location is required";
  if (!input.squareFootage) return "Square footage is required";
  if (!input.stories) return "Number of stories is required";

  // Basic sanity checks
  if (input.location.length < 3) return "Location is too short";
  if (input.buildingType.length < 3) return "Building type is too short";

  return null;
}
