const fs = require("fs");
const path = require("path");

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const API_URL = "https://api.anthropic.com/v1/messages";

const SYSTEM_PROMPT = `You are a newsletter editor for audiology professionals. Your job is to produce a weekly newsletter called "Ear to the Ground."

Search the web for the latest news from the past week across these topics:
- Hearing aid product launches, technology updates, and industry news
- Cochlear implant research and developments
- Auditory processing disorder diagnosis and treatment
- Tinnitus management and therapies
- Middle ear disorders (otitis media, otosclerosis, cholesteatoma)
- Vestibular disorders and ototoxicity
- Noise-induced hearing loss and hearing conservation
- Audiology workforce, scope of practice, and accessibility policy
- Pediatric audiology
- Notable clinical studies and research publications

Then synthesize what you find into a polished HTML email newsletter.

Format your response as a single valid HTML email body (no <html>, <head>, or <body> tags — just the inner content). Use inline styles only.

Structure:
1. A header with "Ear to the Ground" and today's date, styled with teal (#0D9488) accent
2. A 1-2 sentence editorial intro
3. Section: "Industry & Product News" — 3-5 items, each with a bold headline, 2-3 sentence summary, and source link
4. Section: "Research & Clinical" — 3-5 items, same format
5. Section: "Clinical & Community" — 2-4 items, same format (only include if there are noteworthy items; skip if results are thin)
6. A brief sign-off

Design rules:
- font-family: Arial, sans-serif
- Scannable: short paragraphs, clear hierarchy
- #0D9488 for section headers and accents
- #1a1a1a body text, #6b7280 secondary text
- White background, max-width 600px, centered
- Each news item gets a subtle bottom border (#e5e7eb)
- Source links colored #0D9488
- 2-3 minute read length

Return ONLY the HTML. No markdown fences, no commentary.`;

async function generate() {
  if (!ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY environment variable is not set");
    process.exit(1);
  }

  console.log("Generating newsletter with web search...");

  const resp = await fetch(API_URL, {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      tools: [
        {
          type: "web_search_20250305",
          name: "web_search",
          max_uses: 10,
        },
      ],
      messages: [
        {
          role: "user",
          content:
            "Search for the latest audiology, hearing aid, cochlear implant, tinnitus, and auditory processing disorder news from the past week. Then compose this week's Ear to the Ground newsletter.",
        },
      ],
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Anthropic API error (${resp.status}): ${err}`);
  }

  const data = await resp.json();

  // Extract text blocks from the response
  const textBlocks = data.content
    .filter((block) => block.type === "text")
    .map((block) => block.text);

  if (textBlocks.length === 0) {
    throw new Error("No text content in API response");
  }

  let newsletter = textBlocks.join("");

  // Strip markdown fences if present
  newsletter = newsletter
    .replace(/^```html\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  // Strip any preamble text before the actual HTML
  const htmlStart = newsletter.indexOf("<");
  if (htmlStart > 0) {
    newsletter = newsletter.substring(htmlStart);
  }

  // Log search usage
  const searchRequests =
    data.usage?.server_tool_use?.web_search_requests || "unknown";
  console.log(`Web searches used: ${searchRequests}`);

  // Save newsletter
  const today = new Date().toISOString().split("T")[0];
  const newslettersDir = path.join(__dirname, "newsletters");

  if (!fs.existsSync(newslettersDir)) {
    fs.mkdirSync(newslettersDir, { recursive: true });
  }

  const filename = `${today}.html`;
  fs.writeFileSync(path.join(newslettersDir, filename), newsletter);
  console.log(`Saved: newsletters/${filename}`);

  // Update manifest
  const manifestPath = path.join(newslettersDir, "manifest.json");
  let manifest = [];

  if (fs.existsSync(manifestPath)) {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  }

  if (!manifest.find((e) => e.date === today)) {
    manifest.unshift({ date: today, file: filename });
  }

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log("Updated manifest.json");
  console.log("Done!");
}

generate().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
