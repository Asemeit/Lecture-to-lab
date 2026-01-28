// Note: We no longer import GoogleGenerativeAI here because it runs on the backend (api/analyze.js)
// import { GoogleGenerativeAI } from "@google/generative-ai";

/**
 * Converts a File object to a Base64 string.
 */
async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      // remove "data:video/mp4;base64," prefix
      const base64String = (reader.result as string).split(',')[1];
      resolve(base64String);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export const analyzeContent = async (input: string | File) => {
  // We still check for API KEY presence to fail fast if not set (though used on backend)
  // Actually, strictly speaking the backend needs it, but good to check here too or just let backend fail.
  // We'll trust the backend check to allow for smoother local dev if user forgot it locally but set it on Vercel.

  try {
    let payload: any = {};

    if (typeof input === 'string') {
      payload = { input, isFile: false };
    } else if (input instanceof File) {
      if (input.size > 4500000) { // Vercel Serverless Function Payload Limit is ~4.5MB
        throw new Error("File too large for Vercel Proxy (Limit 4.5MB). Please use a shorter clip or text transcript.");
      }
      const base64 = await fileToBase64(input);
      payload = {
        input: base64,
        isFile: true,
        mimeType: input.type
      };
    }

    // Call the Vercel Serverless Function
    const response = await fetch('/api/analyze', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errData = await response.json();
      throw new Error(errData.error || `Server Error: ${response.status}`);
    }

    const data = await response.json();
    return data;

  } catch (error: any) {
    console.error("Gemini Analysis Failed:", error);

    // FALLBACK SIMULATION MODE
    // If the API fails (404, Quota, etc.), we return the DEMO DATA so the user isn't stuck.
    // 404 happens locally if 'api/analyze.js' isn't running (i.e. 'npm run dev' instead of 'vercel dev')
    if (error.message.includes("404") || error.message.includes("Fetch") || error.message.includes("Server Error")) {
      console.warn("⚠️ API Error detected (likely Localhost without Vercel). Switching to SIMULATION MODE.");
      return {
        title: "Simulated: React Tutorial (Fallback)",
        steps: [
          { time: 10, title: "Introduction", completed: true, code: null },
          { time: 45, title: "Project Setup", completed: false, code: "npm create vite@latest my-app" },
          { time: 60, title: "Router Setup", completed: false, code: "import { BrowserRouter } from 'react-router-dom';\n\n<BrowserRouter>...</BrowserRouter>" },
          { time: 90, title: "Hooks & State", completed: false, code: "const [count, setCount] = useState(0);" }
        ],
        graph: {
          nodes: [
            { id: "React", val: 10 },
            { id: "Vite", val: 5 },
            { id: "Router", val: 8 },
            { id: "Hooks", val: 8 },
            { id: "State", val: 6 }
          ],
          links: [
            { source: "React", target: "Vite" },
            { source: "React", target: "Router" },
            { source: "React", target: "Hooks" },
            { source: "Hooks", target: "State" }
          ]
        }
      };
    }

    throw new Error(error.message || "Unknown Gemini Error");
  }
};
