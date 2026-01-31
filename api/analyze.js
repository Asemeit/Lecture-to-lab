import { GoogleGenerativeAI } from "@google/generative-ai";

const API_KEY = process.env.VITE_GEMINI_API_KEY;

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method Not Allowed' });
  }

  if (!API_KEY) {
    console.error("DEBUG: API_KEY is missing from process.env");
    return response.status(500).json({ error: 'Missing VITE_GEMINI_API_KEY in environment variables' });
  }

  try {
    let { input, isFile, mimeType } = request.body;

    const genAI = new GoogleGenerativeAI(API_KEY);

    // Use gemini-flash-latest (Corresponds to 1.5 Flash - High Quota, Available)
    const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

    // Handle YouTube URLs
    if (!isFile && typeof input === 'string') {
      const youtubeRegex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com|youtu\.be)\/(?:watch\?v=)?(.+)/;
      const match = input.match(youtubeRegex);
      if (match) {
        console.log("DEBUG: YouTube URL detected. Fetching transcript...");
        try {
          // Dynamic import to avoid build-time bundling issues with some environments
          const { YoutubeTranscript } = await import('youtube-transcript');
          
          const transcriptItems = await YoutubeTranscript.fetchTranscript(input);
          // Combine transcript text
          input = transcriptItems.map(item => item.text).join(' ');
          console.log(`DEBUG: Transcript fetched. Length: ${input.length} chars.`);
          if (input.length > 100000) {
             input = input.substring(0, 100000) + "... (Truncated)";
          }
        } catch (ytError) {
          console.error("YouTube Transcript Error:", ytError);
          throw new Error("Could not fetch YouTube transcript. Video might not have captions or is restricted.");
        }
      }
    }

    // Reconstruct the prompt parts - UPGRADED INSTRUCTOR MODE
    const PROMPT_TEMPLATE = `
You are an expert Automated Lab Instructor for "Lecture-to-Lab".
Your goal is to transform passive video content into an active, runnable "Lab Manual".
Do not just summarize. EXTRACT actionable steps, specific constants, and critical safety warnings.

RETURN JSON ONLY. NO MARKDOWN.

Structure:
{
  "title": "Lab Title",
  "labContext": {
      "summary": "One sentence goal of this lab",
      "prerequisites": ["List of installed tools needed, e.g. Node.js"],
      "constants": [
          { "name": "API_KEY", "value": "Placeholder/Real Value" },
          { "name": "PI", "value": "3.14159" }
      ],
      "boilerplate": "String of setup code (imports, initial config) that needs to be run BEFORE step 1"
  },
  "steps": [
    { 
      "time": number (seconds), 
      "title": "Actionable Step Title (Start with Verb)", 
      "description": "Brief explanation of WHAT to do.",
      "code": "The exact code to type/run. null if not applicable.",
      "safetyWarning": "Optional warning if dangerous (e.g. 'Don't commit API keys', 'Add acid to water')",
      "theoreticalContext": "Optional 1-sentence theory behind this step (The 'Why')"
    }
  ],
  "graph": {
    "nodes": [
      { "id": "Concept Name", "val": number (importance 1-10) }
    ],
    "links": [
      { "source": "Concept Name", "target": "Related Concept Name" }
    ]
  }
}

RULES:
1. "time" must be in seconds.
2. "boilerplate" should be the *setup* code (imports, variable inits) that applies to the whole lab.
3. EXTRACT VARIABLES: If the video mentions specific numbers, strings, or config values, put them in "constants".
4. SAFETY: If the video mentions security (API keys) or physical safety, perform a "Safety Check" and add a warning.
5. Generate at least 5-10 detailed steps.
`;

    let promptParts = [PROMPT_TEMPLATE];

    if (isFile && input) {
      // Input is base64 string
      promptParts.push({
        inlineData: {
          data: input,
          mimeType: mimeType || "video/mp4"
        }
      });
      promptParts.push("Analyze this video/audio file.");
    } else {
      // Input is text transcript (or converted YouTube transcript)
      promptParts.push(input);
    }

    // Retry logic for 429 Errors
    let result;
    let attempts = 0;
    while (attempts < 3) {
      try {
        result = await model.generateContent(promptParts);
        break; // Success!
      } catch (e) {
        if (e.message.includes("429") || e.status === 429) {
          attempts++;
          console.warn(`Hit 429 Rate Limit. Waiting 2s before retry ${attempts}...`);
          await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s (Vercel timeout unsafe)
        } else {
          throw e; // RETHROW other errors
        }
      }
    }
    if (!result) throw new Error("Failed after 3 retries due to Quota Limit.");

    // Clean markdown if present and extract JSON
    const textData = result.response.text();
    const jsonMatch = textData.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
       console.error("AI Response (No JSON found):", textData);
       throw new Error("AI did not return valid JSON.");
    }
    const jsonString = jsonMatch[0]; // Extract only the JSON part
    const data = JSON.parse(jsonString);

    return response.status(200).json(data);

  } catch (error) {
    console.error("API Proxy Error:", error);

    // Handle specific API errors if possible
    let errorMessage = error.message || "Unknown error";
    if (errorMessage.includes("Location")) {
      errorMessage += " (However, since this is running on Vercel US, this shouldn't happen unless the region is explicitly blocked)";
    }

    return response.status(500).json({ error: errorMessage });
  }
}
