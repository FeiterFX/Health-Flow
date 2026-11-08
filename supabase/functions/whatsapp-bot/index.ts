import "@supabase/functions-js/edge-runtime.d.ts"
import { parseMessageIntent } from "./ai.ts"
import {
  fetchPatientByPhone,
  createPatient,
  checkSlotAvailability,
  createAppointment,
} from "./db.ts"

const META_VERIFY_TOKEN = Deno.env.get("META_VERIFY_TOKEN") || "FEITERFX_SUPER_SECRET"
const META_ACCESS_TOKEN = Deno.env.get("META_ACCESS_TOKEN")
const META_PHONE_NUMBER_ID = Deno.env.get("META_PHONE_NUMBER_ID")

async function sendWhatsAppMessage(to: string, text: string) {
  if (!META_ACCESS_TOKEN || !META_PHONE_NUMBER_ID) {
    console.warn("⚠️ Meta tokens missing. Fake sending message:", text);
    return;
  }
  
  await fetch(
    `https://graph.facebook.com/v19.0/${META_PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${META_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: to,
        type: "text",
        text: { body: text },
      }),
    }
  );
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // 1. Meta Webhook Verification
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    if (mode === "subscribe" && token === META_VERIFY_TOKEN) {
      return new Response(challenge, { status: 200 });
    } else {
      return new Response("Forbidden", { status: 403 });
    }
  }

  // 2. Incoming Messages Received
  if (req.method === "POST") {
    try {
      const body = await req.json();
      
      // WhatsApp API payload structure
      const entry = body.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;
      const message = value?.messages?.[0];

      // Ignore if not a valid text message
      if (!message || message.type !== "text") {
         return new Response("OK", { status: 200 });
      }

      const senderPhone = message.from; // Phone number string
      const text = message.text.body;

      // Ensure patient exists in our system
      let patient = await fetchPatientByPhone(senderPhone);
      let userNameToGiveAI = patient?.name || "Unknown";

      // AI Intent Check
      const now = new Date().toISOString();
      const intent = await parseMessageIntent(text, now);

      let finalBotReply = intent.response;

      // Handle the Booking Flow
      if (
        intent.action === "BOOK_APPOINTMENT" &&
        intent.requested_date &&
        intent.requested_time
      ) {
        // Construct standard ISO time
        const slotStartStr = `${intent.requested_date}T${intent.requested_time}:00`;
        const slotDate = new Date(slotStartStr);
        // Assuming 1hr appointments or 30mins. Let's do 1hr.
        const slotEnd = new Date(slotDate.getTime() + 60 * 60 * 1000);

        const isAvailable = await checkSlotAvailability(slotStartStr);

        if (isAvailable) {
           // We need a patient record first.
           if (!patient) {
             // Use extracted name from AI if available, otherwise 'New Patient'
             const newName = intent.name || "New Patient";
             patient = await createPatient(newName, senderPhone);
           }
           
           await createAppointment(patient.id, slotStartStr, slotEnd.toISOString());
           finalBotReply = `✅ Success! I have booked your appointment for ${intent.requested_date} at ${intent.requested_time}. See you then!`;
        } else {
           finalBotReply = `❌ Sorry, the slot on ${intent.requested_date} at ${intent.requested_time} is already taken. Would you like a different time?`;
        }
      } else if (intent.action === "BOOK_APPOINTMENT" && (!patient || !intent.name) && intent.requested_date) {
         // Ask for Name if missing
         finalBotReply += " By the way, could I get your full name for the booking?";
      }

      // Dispatch Reply
      await sendWhatsAppMessage(senderPhone, finalBotReply);

      return new Response("OK", { status: 200 });

    } catch (e) {
      console.error(e);
      return new Response("Internal Error", { status: 500 });
    }
  }

  return new Response("Method not allowed", { status: 405 });
});
