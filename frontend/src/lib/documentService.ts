import { supabase } from './supabase';

export interface ClientDocument {
    id: string;
    patient_id: number;
    appointment_id?: number | null;
    document_type: 'CLINICAL_NOTE' | 'CONSENT_FORM' | 'REFERRAL' | 'PRESCRIPTION' | 'OTHER';
    file_name: string;
    storage_path: string;
    mime_type: string;
    file_size_bytes: number;
    sha256_checksum: string;
    raw_ocr_text?: string | null;
    verified_text?: string | null;
    status: 'PENDING_REVIEW' | 'VERIFIED' | 'ARCHIVED';
    created_at: string;
    verified_at?: string | null;
    verified_by?: string | null;
    retention_until: string;
    legal_hold: boolean;
    is_deleted: boolean;
}

const STORAGE_BUCKET = 'client-documents';

/**
 * Computes SHA-256 hash of a file to fulfill ECTA Section 14 integrity requirement.
 */
export async function computeSHA256(file: File): Promise<string> {
    const arrayBuffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Ensures storage bucket exists or provides helpful diagnostic.
 */
async function ensureBucket() {
    try {
        const { data: buckets } = await supabase.storage.listBuckets();
        const exists = buckets?.some(b => b.name === STORAGE_BUCKET);
        if (!exists) {
            // Attempt to create bucket if user permissions allow
            await supabase.storage.createBucket(STORAGE_BUCKET, {
                public: false,
                fileSizeLimit: 25 * 1024 * 1024 // 25MB limit
            });
        }
    } catch (err) {
        console.warn('Could not auto-create bucket; will attempt direct upload:', err);
    }
}

/**
 * Uploads a document to Supabase Storage and records metadata in ClientDocument table.
 */
export async function uploadClientDocument(params: {
    patientId: number;
    file: File;
    documentType: ClientDocument['document_type'];
    appointmentId?: number | null;
    retentionYears?: number;
    rawOcrText?: string;
    verifiedText?: string;
    status?: ClientDocument['status'];
}): Promise<ClientDocument> {
    const {
        patientId,
        file,
        documentType,
        appointmentId,
        retentionYears = 6,
        rawOcrText,
        verifiedText,
        status = 'PENDING_REVIEW'
    } = params;

    await ensureBucket();

    // 1. Compute SHA-256 Checksum for ECTA compliance
    const checksum = await computeSHA256(file);

    // 2. Generate unique storage path
    const timestamp = Date.now();
    const safeFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const storagePath = `patient_${patientId}/${timestamp}_${safeFileName}`;

    // 3. Upload file to Supabase Storage
    const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(storagePath, file, {
            contentType: file.type || 'image/jpeg',
            upsert: false
        });

    if (uploadError) {
        console.error('Storage upload error:', uploadError);
        throw new Error(
            `Failed to upload file to storage: ${uploadError.message}. Make sure the '${STORAGE_BUCKET}' bucket is created in Supabase.`
        );
    }

    // 4. Calculate HPCSA retention date (minimum 6 years for adult patients)
    const retentionDate = new Date();
    retentionDate.setFullYear(retentionDate.getFullYear() + retentionYears);

    // 5. Insert record into ClientDocument table
    const { data, error: dbError } = await supabase
        .from('ClientDocument')
        .insert([{
            patient_id: patientId,
            appointment_id: appointmentId || null,
            document_type: documentType,
            file_name: file.name,
            storage_path: storagePath,
            mime_type: file.type || 'image/jpeg',
            file_size_bytes: file.size,
            sha256_checksum: checksum,
            raw_ocr_text: rawOcrText || null,
            verified_text: verifiedText || rawOcrText || null,
            status,
            retention_until: retentionDate.toISOString(),
            legal_hold: false,
            is_deleted: false,
            verified_at: status === 'VERIFIED' ? new Date().toISOString() : null
        }])
        .select()
        .single();

    if (dbError) {
        console.error('Database insert error:', dbError);
        // Rollback uploaded file if DB record insertion fails
        await supabase.storage.from(STORAGE_BUCKET).remove([storagePath]);
        throw new Error(`Failed to save document metadata: ${dbError.message}`);
    }

    return data as ClientDocument;
}

/**
 * Fetches all clinical documents for a patient.
 */
export async function fetchClientDocuments(patientId: number): Promise<ClientDocument[]> {
    const { data, error } = await supabase
        .from('ClientDocument')
        .select('*')
        .eq('patient_id', patientId)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching documents:', error);
        throw error;
    }

    return (data || []) as ClientDocument[];
}

/**
 * Generates a signed or public URL to securely view/download an uploaded document.
 */
export async function getDocumentViewUrl(storagePath: string): Promise<string> {
    // Attempt signed URL first (for private buckets)
    const { data: signedData, error: signedError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .createSignedUrl(storagePath, 3600); // 1 hour validity

    if (!signedError && signedData?.signedUrl) {
        return signedData.signedUrl;
    }

    // Fallback to public URL if bucket is public
    const { data: pubData } = supabase.storage
        .from(STORAGE_BUCKET)
        .getPublicUrl(storagePath);

    return pubData?.publicUrl || '';
}

/**
 * Updates an existing document (e.g. after practitioner verifies or edits transcribed text).
 */
export async function updateClientDocument(
    id: string,
    updates: Partial<ClientDocument>
): Promise<ClientDocument> {
    const { data, error } = await supabase
        .from('ClientDocument')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

    if (error) throw error;
    return data as ClientDocument;
}

/**
 * Soft-deletes a document only if not protected by HPCSA legal hold.
 */
export async function deleteClientDocument(id: string, legalHold: boolean): Promise<void> {
    if (legalHold) {
        throw new Error('This document is marked under Legal Hold and cannot be deleted.');
    }

    const { error } = await supabase
        .from('ClientDocument')
        .update({ is_deleted: true })
        .eq('id', id);

    if (error) throw error;
}

/**
 * Transcribes handwritten clinical notes from an image using Gemini Vision API.
 */
export async function transcribeHandwritingWithGemini(
    file: File,
    apiKeyOverride?: string
): Promise<string> {
    const apiKey =
        apiKeyOverride ||
        localStorage.getItem('gemini_api_key') ||
        (import.meta as any).env.VITE_GEMINI_API_KEY;

    if (!apiKey) {
        throw new Error(
            'Gemini API Key not found. Please provide an API key in Settings or enter it when scanning.'
        );
    }

    // Convert file to base64
    const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = reader.result as string;
            // Strip data:image/xxx;base64, prefix
            const base64Content = result.split(',')[1] || result;
            resolve(base64Content);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });

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
Return only the clear, formatted transcription.`;

    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [
                    {
                        parts: [
                            { text: prompt },
                            {
                                inline_data: {
                                    mime_type: file.type || 'image/jpeg',
                                    data: base64
                                }
                            }
                        ]
                    }
                ]
            })
        }
    );

    const json = await response.json();
    if (json.error) {
        throw new Error(`Gemini transcription error: ${json.error.message || JSON.stringify(json.error)}`);
    }

    const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
        throw new Error('No text returned from Gemini Vision model.');
    }

    return text.trim();
}
