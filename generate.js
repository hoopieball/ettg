const fs = require("fs");
const path = require("path");

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

const TOPICS = [
  {
    label: "Industry & Product News",
    prompt:
      "Search for the latest hearing aid, cochlear implant, and audiology industry news from the past week. Focus on: new product launches, technology updates, FDA regulatory changes, company announcements, and market developments. Return a structured summary of the top 3-5 most newsworthy items with source names and URLs.",
  },
  {
    label: "Research & Clinical",
    prompt:
      "Search for the latest audiology and hearing science research from the past week. Include research on: cochlear implants, auditory processing disorders, tinnitus, middle ear disorders, vestibular disorders, ototoxicity, noise-induced hearing loss, and hearing conservation. Focus on: new clinical studies, published research papers, clinical practice guideline updates, and notable findings. Return a structured summary of the top 3-5 most newsworthy items with source names and URLs.",
  },
  {
    label: "Clinical & Community",
    prompt:
      "Search for the latest news from the past week on: auditory processing disorder diagnosis and treatment, tinnitus management and therapies, middle ear conditions (otitis media, otosclerosis, cholesteatoma), pediatric audiology, audiology workforce and scope of practice, and hearing accessibility policy. Return a structured summary of the top 2-4 most newsworthy items with source names and URLs.",
  },
];

const COMPOSE_SYSTEM = `You are a newsletter editor for audiology professionals. You will be given search results about hearing aids, cochlear implants, auditory processing disorders, tinnitus, middle ear disorders, and other audiology topics.

Synthesize these into a polished weekly email newsletter called "Ear to the Ground."

Format your response as a single valid HTML email body (no <html>, <head>, or <body> tags — just the inner content). Use inline styles only.

Structure:
1. A header with "Ear to the Ground" and today's date, styled with teal (#0D9488) accent
2. A 1-2 sentence editorial intro
3. Section: "Industry & Product News" — 3-5 items, each with a bold headline, 2-3 sentence summary, and source link
4. Section: "Research & Clinical" — 3-5 items, same format
5. Section: "Clinical & Community" — 2-4 items, same format (only include if there are noteworthy items; skip if the search results are thin)
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

Return ONLY the HTML. No markdown fences, no commentary. Just the raw HTML.`;

async function callGemini(prompt, systemInstruction) {
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
  };

  if (systemInstruction) {
    body.system_instruction = { parts: [{ text: systemInstruction }] };
  } else {
    // Use Google Search grounding for search calls
    body.tools = [{ google_search: {} }];
  }

  const resp = await fetch(GEMINI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Gemini API error (${resp.status}): ${err}`);
  }

  const data = await resp.json();
  const parts = data.candidates?.[0]?.content?.parts || [];
  return parts.map((p) => p.text || "").join("");
}

async function main() {
  if (!GEMINI_API_KEY) {
    console.error("GEMINI_API_KEY environment variable is not set");
    process.exit(1);
  }

  console.log("Searching for news...");

  const searchResults = [];
  for (const topic of TOPICS) {
    console.log(`  → ${topic.label}`);
    const result = await callGemini(topic.prompt);
    searchResults.push(`=== ${topic.label} ===\n${result}`);
  }

  console.log("Composing newsletter...");

  const compiled = searchResults.join("\n\n");
  let newsletter = await callGemini(
    `Here are this week's search results. Synthesize them into the newsletter.\n\n${compiled}`,
    COMPOSE_SYSTEM
  );

  // Strip markdown fences if Gemini wraps the HTML
  newsletter = newsletter.replace(/^```html\s*/i, "").replace(/\s*```$/i, "").trim();

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

  // Don't duplicate if re-run on the same day
  if (!manifest.find((e) => e.date === today)) {
    manifest.unshift({
      date: today,
      file: filename,
    });
  }

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log("Updated manifest.json");
  console.log("Done!");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
