import { YoutubeTranscript } from 'youtube-transcript';

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

    // Reconstruct the prompt parts
    const PROMPT_TEMPLATE = `
You are an expert Educational Content Analyzer.
Your task is to analyze the provided Video Input (Text Transcript or File) and extract structured data for an interactive dashboard.

RETURN JSON ONLY. NO MARKDOWN.

Structure:
{
  "title": "Short Video Title",
  "steps": [
    { 
      "time": number (seconds), 
      "title": "Short Step Name", 
      "completed": false, 
      "code": "Optional string of code if this step involves coding. null if not." 
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
1. "time" must be in seconds (e.g., 1:05 -> 65).
2. "code" should be a valid code snippet if mentioned, otherwise null.
3. Extract at least 5 key steps.
4. Extract at least 5 key concepts for the graph.
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
          console.warn(`Hit 429 Rate Limit. Waiting 30s before retry ${attempts}...`);
          await new Promise(resolve => setTimeout(resolve, 30000)); // Wait 30s
        } else {
          throw e; // RETHROW other errors
        }
      }
    }
    if (!result) throw new Error("Failed after 3 retries due to Quota Limit.");

    const textData = result.response.text();

    // Clean markdown if present
    const jsonString = textData.replace(/```json/g, '').replace(/```/g, '').trim();
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
