import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

const apiKey = process.env.GEMINI_API_KEY;
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

export async function POST(request) {
  try {
    if (!genAI) {
      console.warn("Gemini suggestions skipped: GEMINI_API_KEY is not configured.");
      return NextResponse.json({ suggestions: [] });
    }

    const { currentWords } = await request.json();
    if (!Array.isArray(currentWords) || currentWords.length === 0) {
      return NextResponse.json({ suggestions: [] });
    }

    // Build model query
    const model = genAI.getGenerativeModel({
      model: "gemini-3.1-flash-lite",
      generationConfig: {
        responseMimeType: "application/json",
      },
    });

    const systemPrompt = `You are a creative assistant for a word connection/association puzzle game.
Your task is to analyze a list of words entered by the player and suggest the next logical words that would fit in a cohesive, connected word chain.
The connection can be thematic (e.g., elements of a fruit, things found in a garden), colloquial, or conceptual.

Guidelines:
- Return a JSON array of 5 to 8 single-word suggestions.
- Ensure the suggestions are diverse but clearly connected to the existing words.
- All suggestions must be in lowercase, single words, and contain no special characters or numbers.
- Do not repeat any of the words already entered: ${JSON.stringify(currentWords)}.
- Response format MUST be a valid JSON array: ["word1", "word2", "word3"]`;

    const userPrompt = `Given the current chain of words: ${JSON.stringify(currentWords)}, generate the next suggestion words.`;

    const result = await model.generateContent([
      { text: systemPrompt },
      { text: userPrompt }
    ]);

    const response = await result.response;
    const jsonText = response.text();

    let suggestions = [];
    try {
      suggestions = JSON.parse(jsonText);
    } catch (e) {
      console.error("Failed to parse Gemini response as JSON:", jsonText, e);
      // Fallback regex parsing if needed
      const matches = jsonText.match(/"([^"]+)"/g);
      if (matches) {
        suggestions = matches.map(m => m.replace(/"/g, "").toLowerCase());
      }
    }

    // Ensure format is correct
    if (!Array.isArray(suggestions)) {
      suggestions = [];
    }

    // Sanitize suggestions: lowercase, single words, not already in list
    suggestions = suggestions
      .map(w => w.trim().toLowerCase())
      .filter(w => w && !w.includes(" ") && !currentWords.includes(w));

    return NextResponse.json({ suggestions });
  } catch (error) {
    console.error("Gemini suggestion error:", error);
    return NextResponse.json({ error: "Failed to generate suggestions", suggestions: [] }, { status: 500 });
  }
}
