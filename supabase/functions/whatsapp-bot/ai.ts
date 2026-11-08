// Using standard fetch to Gemini API for serverless environment compatibility
export async function parseMessageIntent(message: string, currentDateTime: string) {
  const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");

  if (!GEMINI_API_KEY) {
    throw new Error("Missing GEMINI_API_KEY environment variable");
  }

  const prompt = `You are an AI receptionist for a health practice. Your goal is to parse the user's intent to book an appointment.
Current Date and Time: ${currentDateTime}

Analyze the user's message and return a JSON object ONLY matching this schema without markdown:
{
  "action": "BOOK_APPOINTMENT" | "GENERAL_QUESTION" | "MORE_INFO_NEEDED",
  "name": "extracted patient name if given, or null",
  "requested_date": "YYYY-MM-DD if booking intent, or null",
  "requested_time": "HH:MM (24hour) if booking intent, or null",
  "response": "A polite, conversational response to the user. E.g if missing info, ask for it. If they want to book but didn't specify time, ask what time. If all info is present, say 'Let me check availability for that slot.'"
}

User Message: "${message}"`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
          }
        }),
      }
    );

    const data = await response.json();
    
    if (data.error) {
       console.error("Gemini API Error:", data.error);
       return fallbackResponse();
    }

    const textPayload = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textPayload) return fallbackResponse();

    return JSON.parse(textPayload);
  } catch (error) {
    console.error("Failed to parse AI intent", error);
    return fallbackResponse();
  }
}

function fallbackResponse() {
  return {
    action: "MORE_INFO_NEEDED",
    name: null,
    requested_date: null,
    requested_time: null,
    response: "Sorry, I'm having trouble understanding right now. Could you tell me what day and time you'd like to book?"
  }
}
