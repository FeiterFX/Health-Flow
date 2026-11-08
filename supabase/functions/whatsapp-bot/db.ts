import { createClient } from "npm:@supabase/supabase-js@2";

// Create a function rather than a global client so we can pass the auth context 
// if needed, or simply use the service_role key to bypass RLS for administrative bot tasks.
export function getSupabaseClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );
}

export async function fetchPatientByPhone(phone: string) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("Patient")
    .select("id, name, phone")
    .eq("phone", phone)
    .maybeSingle();

  if (error) {
    console.error("Error fetching patient", error);
    return null;
  }
  return data;
}

export async function createPatient(name: string, phone: string) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("Patient")
    .insert([{ name, phone }])
    .select("id")
    .single();

  if (error) {
    console.error("Error creating patient", error);
    throw new Error("Unable to create patient profile");
  }
  return data;
}

export async function checkSlotAvailability(startTime: string) {
  const supabase = getSupabaseClient();
  // Simple check: does an appointment exist with this exact start time, not cancelled?
  const { data, error } = await supabase
    .from("Appointment")
    .select("id")
    .eq("startTime", startTime)
    .neq("status", "CANCELLED");

  if (error) {
    console.error("Error checking availability", error);
    return false; // Safest to assume not available on error
  }
  
  return data.length === 0;
}

export async function createAppointment(patientId: number, startTime: string, endTime: string) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("Appointment")
    .insert([{ 
      patient_id: patientId, 
      startTime, 
      endTime, 
      status: "SCHEDULED" 
    }])
    .select("id")
    .single();

  if (error) {
    console.error("Error creating appointment", error);
    throw new Error("Unable to create appointment");
  }
  return data;
}
