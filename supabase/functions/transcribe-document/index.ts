import "@supabase/functions-js/edge-runtime.d.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const { imageBase64, mimeType = "image/jpeg" } = await req.json()

    if (!imageBase64) {
      return new Response(
        JSON.stringify({ error: "Missing imageBase64 in request body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY")
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")
    const MODEL = Deno.env.get("OPENROUTER_MODEL") || "google/gemini-2.5-flash"

    const prompt = `You are a medical & clinical record transcription expert. 
Accurately transcribe all handwritten and printed clinical notes, observations, treatment records, or consent forms from this image.
Prescribe high fidelity for medical terms, dosages, dates, and practitioner notes.

Structure the output cleanly using markdown headings if discernable:
- **Date / Session**
- **Subjective (Client complaints/history)**
- **Objective (Observations / Findings)**
- **Assessment / Diagnosis**
- **Plan / Treatment / Prescriptions**
- **Signatures / Notes**

If certain words are illegible, denote them as [illegible: best guess?].
Return only the clear, formatted transcription.`

    // 1. Prefer OpenRouter gateway if configured
    if (OPENROUTER_API_KEY) {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
          "HTTP-Referer": "https://debs-booking.netlify.app",
          "X-Title": "Debs Booking Practice",
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: prompt },
                {
                  type: "image_url",
                  image_url: {
                    url: `data:${mimeType};base64,${imageBase64}`,
                  },
                },
              ],
            },
          ],
        }),
      })

      const json = await response.json()
      if (json.error) {
        throw new Error(`OpenRouter Error: ${json.error.message || JSON.stringify(json.error)}`)
      }

      const text = json.choices?.[0]?.message?.content
      if (!text) throw new Error("No transcription returned from OpenRouter")

      return new Response(
        JSON.stringify({ text: text.trim() }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // 2. Fallback to direct Gemini if GEMINI_API_KEY is configured
    if (GEMINI_API_KEY) {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: prompt },
                  {
                    inline_data: {
                      mime_type: mimeType,
                      data: imageBase64,
                    },
                  },
                ],
              },
            ],
          }),
        }
      )

      const json = await response.json()
      if (json.error) {
        throw new Error(`Gemini Error: ${json.error.message || JSON.stringify(json.error)}`)
      }

      const text = json.candidates?.[0]?.content?.parts?.[0]?.text
      if (!text) throw new Error("No transcription returned from Gemini model")

      return new Response(
        JSON.stringify({ text: text.trim() }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    throw new Error(
      "No AI API key found on the server. Please set OPENROUTER_API_KEY in Supabase Edge Functions Secrets or VITE_OPENROUTER_API_KEY in Netlify environment variables."
    )
  } catch (error: any) {
    console.error("Transcription error:", error)
    return new Response(
      JSON.stringify({ error: error.message || "Failed to transcribe document" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})
