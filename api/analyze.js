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
EXTRACT actionable steps, specific constants, critical safety warnings, and check-on-learning quizzes.

RETURN JSON ONLY. NO MARKDOWN.

Structure:
{
  "title": "Lab Title",
  "data_model_version": "2.0",
  "labContext": {
      "summary": "One sentence goal of this lab",
      "prerequisites": ["List of installed tools needed"],
      "constants": [
          { "name": "API_KEY", "value": "Placeholder/Real Value" }
      ],
      "boilerplate": "Setup code (imports, config) needed BEFORE step 1"
  },
  "modules": [
      {
          "title": "Module 1: [Topic]",
          "summary": "Brief summary",
          "steps": [
            { 
              "time": number (seconds), 
              "title": "Actionable Step Title (Start with Verb)", 
              "description": "Brief explanation of WHAT to do.",
              "code": "The FULL code block to write/run.",
              "code_diff": "Optional. Only the changed lines in diff format (e.g. '+ new line\\n- old line'). Use if modifying existing code.",
              "visual_diagram": "Optional. ASCII art or Mermaid syntax string showing Widget Tree or Architecture for this step.",
              "safetyWarning": "Optional warning if dangerous",
              "theoreticalContext": "Optional 1-sentence theory behind this step"
            }
          ],
          "quiz": {
              "question": "Concept check question for this module",
              "options": ["A) ...", "B) ...", "C) ..."],
              "answer": "Correct Option Text"
          }
      }
  ],
  "graph": {
    "nodes": [ { "id": "Concept Name", "val": number (importance 1-10) } ],
    "links": [ { "source": "Concept A", "target": "Concept B" } ]
  }
}

RULES:
1. "time" (seconds).
2. "boilerplate" = global setup.
3. **smart_diffs**: If a step modifies code, provide "code_diff" to show exactly what changed.
4. **visuals**: If building a UI (like Flutter/React), provide a "visual_diagram" (ASCII/Tree) of the component structure.
5. **quiz**: Generate 1 short conceptual quiz at the end of each module to verify learning.
6. **modules**: Group steps logically (e.g. "Setup", "UI", "Logic").
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
