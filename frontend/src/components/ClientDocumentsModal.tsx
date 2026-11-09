import { useState, useEffect, useRef } from 'react';
import {
    X, Camera, Upload, CheckCircle2, ShieldCheck,
    Clock, Printer, Eye, Sparkles, RefreshCw, Copy, ExternalLink,
    FileCheck, Key
} from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import {
    type ClientDocument,
    computeSHA256,
    uploadClientDocument,
    fetchClientDocuments,
    getDocumentViewUrl,
    updateClientDocument,
    transcribeHandwritingWithGemini
} from '../lib/documentService';

interface Props {
    patient: { id: number; name: string; phone?: string; email?: string };
    isOpen: boolean;
    onClose: () => void;
    appointmentId?: number;
}

export default function ClientDocumentsModal({ patient, isOpen, onClose, appointmentId }: Props) {
    const [documents, setDocuments] = useState<ClientDocument[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'list' | 'upload'>('list');

    // Upload & Scan state
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [filePreview, setFilePreview] = useState<string | null>(null);
    const [fileHash, setFileHash] = useState<string>('');
    const [docType, setDocType] = useState<ClientDocument['document_type']>('CLINICAL_NOTE');
    const [retentionYears, setRetentionYears] = useState<number>(6);
    const [digitalText, setDigitalText] = useState<string>('');
    const [isTranscribing, setIsTranscribing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [apiKeyPrompt, setApiKeyPrompt] = useState(false);
    const [tempApiKey, setTempApiKey] = useState('');
    const [hasSavedKey, setHasSavedKey] = useState<boolean>(() => {
        return !!(
            localStorage.getItem('openrouter_api_key') ||
            localStorage.getItem('gemini_api_key') ||
            (import.meta as any).env.VITE_OPENROUTER_API_KEY ||
            (import.meta as any).env.VITE_GEMINI_API_KEY
        );
    });
    const [practiceInfo, setPracticeInfo] = useState<{
        name: string;
        phone: string;
        title: string;
        practiceNumber: string;
        hpcsaNumber: string;
    }>({
        name: 'Roelof Retief Practice',
        phone: '',
        title: '',
        practiceNumber: '',
        hpcsaNumber: ''
    });

    useEffect(() => {
        supabase.from('Setting').select('practiceName, practicePhone, practiceTitle, practiceNumber, hpcsaNumber').maybeSingle().then(({ data }) => {
            if (data) {
                setPracticeInfo({
                    name: data.practiceName || 'Roelof Retief Practice',
                    phone: data.practicePhone || '',
                    title: data.practiceTitle || '',
                    practiceNumber: data.practiceNumber || '',
                    hpcsaNumber: data.hpcsaNumber || ''
                });
            }
        });
    }, []);

    // Document Viewing & Editing state
    const [viewingDoc, setViewingDoc] = useState<ClientDocument | null>(null);
    const [viewingUrl, setViewingUrl] = useState<string>('');
    const [editingDocId, setEditingDocId] = useState<string | null>(null);
    const [editedText, setEditedText] = useState<string>('');

    const cameraInputRef = useRef<HTMLInputElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const loadDocs = async () => {
        setLoading(true);
        try {
            const docs = await fetchClientDocuments(patient.id);
            setDocuments(docs);
        } catch (err: any) {
            console.error('Failed to load documents:', err);
            toast.error(err.message || 'Could not load client documents');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen && patient?.id) {
            loadDocs();
        }
    }, [isOpen, patient?.id]);

    if (!isOpen) return null;

    const handleFileSelected = async (file: File) => {
        setSelectedFile(file);
        setDigitalText('');
        try {
            // Preview
            const previewUrl = URL.createObjectURL(file);
            setFilePreview(previewUrl);

            // Calculate ECTA Section 14 SHA-256 hash immediately
            const hash = await computeSHA256(file);
            setFileHash(hash);
            setActiveTab('upload');
            toast.success('Document loaded and integrity checksum generated!');
        } catch (err) {
            toast.error('Failed to read file');
        }
    };

    const handleTranscribe = async (keyOverride?: string) => {
        if (!selectedFile) {
            toast.error('Please select or scan an image first');
            return;
        }

        const keyToUse = keyOverride || 
            (typeof window !== 'undefined' ? (localStorage.getItem('openrouter_api_key') || localStorage.getItem('gemini_api_key')) : undefined);

        setIsTranscribing(true);
        try {
            const transcription = await transcribeHandwritingWithGemini(selectedFile, keyToUse || undefined);
            setDigitalText(transcription);
            toast.success('Handwriting digitized successfully!');
            setApiKeyPrompt(false);
            setHasSavedKey(true);
        } catch (err: any) {
            console.error('AI Transcription failed:', err);
            if (err.message && err.message.includes('NO_API_KEY')) {
                setApiKeyPrompt(true);
                toast.error('Please enter your OpenRouter or Gemini API key to proceed.');
            } else {
                toast.error(err.message || 'Handwriting transcription failed');
            }
        } finally {
            setIsTranscribing(false);
        }
    };

    const handleSaveDocument = async (status: ClientDocument['status']) => {
        if (!selectedFile) {
            toast.error('No file selected');
            return;
        }

        setIsSaving(true);
        try {
            await uploadClientDocument({
                patientId: patient.id,
                file: selectedFile,
                documentType: docType,
                appointmentId,
                retentionYears,
                rawOcrText: digitalText,
                verifiedText: digitalText,
                status
            });

            toast.success(
                status === 'VERIFIED'
                    ? 'Clinical note verified and locked into client record!'
                    : 'Document saved to client record'
            );

            // Reset upload form
            setSelectedFile(null);
            setFilePreview(null);
            setFileHash('');
            setDigitalText('');
            setActiveTab('list');
            loadDocs();
        } catch (err: any) {
            console.error('Save failed:', err);
            toast.error(err.message || 'Error saving document');
        } finally {
            setIsSaving(false);
        }
    };

    const handleViewDoc = async (doc: ClientDocument) => {
        setViewingDoc(doc);
        try {
            const url = await getDocumentViewUrl(doc.storage_path);
            setViewingUrl(url);
        } catch (err) {
            toast.error('Could not load original image file');
        }
    };

    const handleVerifyExistingDoc = async (doc: ClientDocument) => {
        try {
            await updateClientDocument(doc.id, {
                status: 'VERIFIED',
                verified_at: new Date().toISOString(),
                verified_text: editedText || doc.verified_text || doc.raw_ocr_text
            });
            toast.success('Document marked as Verified & Signed');
            setEditingDocId(null);
            loadDocs();
            if (viewingDoc && viewingDoc.id === doc.id) {
                setViewingDoc({ ...viewingDoc, status: 'VERIFIED', verified_at: new Date().toISOString() });
            }
        } catch (err: any) {
            toast.error('Failed to verify document: ' + err.message);
        }
    };

    const handlePrintLegalExport = (doc: ClientDocument, imageUrl: string, existingWindow?: Window | null) => {
        let printWindow = existingWindow;
        if (printWindow === undefined) {
            printWindow = window.open('', '_blank');
        }

        if (!printWindow) {
            toast.error('Popup blocked by browser. Go to iPhone Settings > Safari and turn off "Block Pop-ups".', { duration: 6000 });
            return;
        }

        const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Clinical Record - ${patient.name} - ${doc.id}</title>
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #111; padding: 30px; line-height: 1.5; }
                .header { border-bottom: 2px solid #2563eb; padding-bottom: 12px; margin-bottom: 20px; }
                .title { font-size: 20px; font-weight: 700; margin: 0; color: #1e3a8a; }
                .subtitle { font-size: 12px; color: #64748b; margin-top: 4px; }
                .meta-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 13px; }
                .meta-table td { padding: 6px 10px; border: 1px solid #e2e8f0; }
                .meta-table td.label { font-weight: 600; background: #f8fafc; width: 25%; }
                .compliance-box { background: #f0fdf4; border: 1px solid #bbf7d0; padding: 12px; border-radius: 6px; font-size: 12px; margin-bottom: 20px; }
                .section-title { font-size: 15px; font-weight: 700; border-bottom: 1px solid #cbd5e1; padding-bottom: 5px; margin: 20px 0 10px; color: #1e293b; }
                .text-content { background: #fff; border: 1px solid #e2e8f0; padding: 15px; border-radius: 4px; white-space: pre-wrap; font-family: monospace; font-size: 13px; }
                .scan-image { max-width: 100%; border: 1px solid #cbd5e1; border-radius: 4px; margin-top: 10px; display: block; }
                @media print {
                    .no-print { display: none; }
                }
            </style>
        </head>
        <body>
            <div class="header">
                <div class="title">${practiceInfo.name}</div>
                ${practiceInfo.title ? `<div style="font-size: 14px; font-weight: 600; color: #334155; margin-top: 3px;">${practiceInfo.title}</div>` : ''}
                <div class="subtitle" style="display: flex; gap: 14px; flex-wrap: wrap; margin-top: 6px; font-size: 12px; color: #475569;">
                    ${practiceInfo.practiceNumber ? `<span><strong>Practice No (PCNS):</strong> ${practiceInfo.practiceNumber}</span>` : ''}
                    ${practiceInfo.hpcsaNumber ? `<span><strong>HPCSA / Reg No:</strong> ${practiceInfo.hpcsaNumber}</span>` : ''}
                    ${practiceInfo.phone ? `<span><strong>Tel:</strong> ${practiceInfo.phone}</span>` : ''}
                </div>
                <div style="font-size: 11px; color: #64748b; margin-top: 5px;">
                    Certified Electronic Clinical Record &bull; South Africa HPCSA Booklet 9 & ECTA Compliant
                </div>
            </div>

            <table class="meta-table">
                <tr>
                    <td class="label">Client Name:</td>
                    <td><strong>${patient.name}</strong></td>
                    <td class="label">Contact:</td>
                    <td>${patient.phone || 'N/A'}</td>
                </tr>
                <tr>
                    <td class="label">Document ID:</td>
                    <td><code>${doc.id}</code></td>
                    <td class="label">Document Type:</td>
                    <td>${doc.document_type.replace('_', ' ')}</td>
                </tr>
                <tr>
                    <td class="label">Date Created / Scanned:</td>
                    <td>${new Date(doc.created_at).toLocaleString('en-ZA')}</td>
                    <td class="label">Verification Status:</td>
                    <td><strong>${doc.status}</strong> ${doc.verified_at ? `(${new Date(doc.verified_at).toLocaleDateString('en-ZA')})` : ''}</td>
                </tr>
                <tr>
                    <td class="label">HPCSA Retention Mandate:</td>
                    <td>Retain until <strong>${new Date(doc.retention_until).toLocaleDateString('en-ZA')}</strong> (HPCSA Booklet 9 Rule 9.1)</td>
                    <td class="label">ECTA Section 14 Checksum:</td>
                    <td><code style="font-size:11px;">${doc.sha256_checksum}</code></td>
                </tr>
            </table>

            <div class="compliance-box">
                <strong>Legal Compliance Certification:</strong> This document represents a certified electronic facsimile of the clinical records in accordance with the Electronic Communications and Transactions Act 25 of 2002 (ECTA) and the Protection of Personal Information Act 4 of 2013 (POPIA).
            </div>

            <div class="section-title">Verified Digital Content (Transcribed Clinical Notes)</div>
            <div class="text-content">${doc.verified_text || doc.raw_ocr_text || 'No transcribed text available.'}</div>

            <div class="section-title" style="page-break-before: always;">Original Scanned Artifact (Image/Scan)</div>
            ${imageUrl ? `<img src="${imageUrl}" class="scan-image" alt="Original Scanned Note" />` : '<p>Original image link not reachable in print preview.</p>'}

            <script>
                window.onload = function() { window.print(); }
            </script>
        </body>
        </html>
        `;

        printWindow.document.write(html);
        printWindow.document.close();
    };

    const handlePrintConsolidatedDossier = async () => {
        if (documents.length === 0) {
            toast.error('No records available to export for this client.');
            return;
        }

        // Open window synchronously immediately on click to prevent Safari popup blocker
        const printWindow = window.open('', '_blank');
        if (printWindow) {
            printWindow.document.write(`
                <!DOCTYPE html>
                <html>
                <head><title>Generating Dossier...</title></head>
                <body style="font-family:sans-serif;padding:40px;text-align:center;color:#475569;background:#f8fafc;">
                    <h2 style="color:#1e3a8a;">Preparing Consolidated Clinical Dossier</h2>
                    <p>Fetching all ${documents.length} clinical records and attachments for ${patient.name}...</p>
                    <div style="margin-top:20px;display:inline-block;width:30px;height:30px;border:3px solid #cbd5e1;border-top-color:#2563eb;border-radius:50%;animation:spin 1s linear infinite;"></div>
                    <style>@keyframes spin { to { transform: rotate(360deg); } }</style>
                </body>
                </html>
            `);
        } else {
            toast.error('Popup blocked by browser. Please allow popups or turn off "Block Pop-ups" in Safari settings.', { duration: 6000 });
            return;
        }

        try {
            // Load signed URLs for all documents in parallel
            const docsWithUrls = await Promise.all(
                documents.map(async (doc) => {
                    try {
                        const url = await getDocumentViewUrl(doc.storage_path);
                        return { doc, url };
                    } catch {
                        return { doc, url: '' };
                    }
                })
            );

            // Sort chronologically (oldest to newest for clinical narrative timeline)
            const sorted = [...docsWithUrls].sort((a, b) => new Date(a.doc.created_at).getTime() - new Date(b.doc.created_at).getTime());
            const earliestDate = new Date(sorted[0].doc.created_at).toLocaleDateString('en-ZA');
            const latestDate = new Date(sorted[sorted.length - 1].doc.created_at).toLocaleDateString('en-ZA');

            const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8" />
                <title>Consolidated Clinical Dossier - ${patient.name}</title>
                <style>
                    body {
                        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                        color: #0f172a;
                        padding: 30px;
                        line-height: 1.5;
                        background: #fff;
                    }
                    .no-print {
                        position: sticky;
                        top: 0;
                        background: #1e3a8a;
                        color: white;
                        padding: 12px 20px;
                        border-radius: 8px;
                        margin-bottom: 25px;
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
                        z-index: 1000;
                    }
                    .no-print button {
                        font-family: inherit;
                        font-size: 13px;
                        font-weight: 600;
                        padding: 8px 16px;
                        border-radius: 6px;
                        border: none;
                        cursor: pointer;
                    }
                    .btn-print { background: #3b82f6; color: white; }
                    .btn-close { background: rgba(255,255,255,0.2); color: white; margin-left: 8px; }
                    .dossier-header {
                        border-bottom: 3px solid #2563eb;
                        padding-bottom: 15px;
                        margin-bottom: 25px;
                    }
                    .practice-title { font-size: 24px; font-weight: 800; color: #1e3a8a; margin: 0; }
                    .practice-sub { font-size: 13px; color: #64748b; margin-top: 4px; }
                    .dossier-badge {
                        background: #f0fdf4;
                        border: 1px solid #86efac;
                        color: #166534;
                        font-size: 11px;
                        font-weight: 600;
                        padding: 4px 10px;
                        border-radius: 20px;
                        display: inline-block;
                        margin-top: 8px;
                    }
                    .summary-grid {
                        display: grid;
                        grid-template-columns: repeat(2, 1fr);
                        gap: 12px;
                        background: #f8fafc;
                        border: 1px solid #e2e8f0;
                        border-radius: 8px;
                        padding: 16px;
                        margin-bottom: 30px;
                        font-size: 13px;
                    }
                    .summary-item strong { color: #475569; font-weight: 600; }
                    .toc-table {
                        width: 100%;
                        border-collapse: collapse;
                        font-size: 12px;
                        margin-bottom: 35px;
                    }
                    .toc-table th, .toc-table td {
                        padding: 8px 10px;
                        border: 1px solid #cbd5e1;
                        text-align: left;
                    }
                    .toc-table th { background: #f1f5f9; font-weight: 700; color: #334155; }
                    .doc-entry {
                        page-break-after: always;
                        padding-top: 25px;
                        border-top: 2px dashed #cbd5e1;
                        margin-top: 25px;
                    }
                    .doc-entry:first-of-type {
                        border-top: none;
                        margin-top: 0;
                        padding-top: 0;
                    }
                    .doc-entry:last-child {
                        page-break-after: auto;
                    }
                    .doc-header {
                        border-left: 4px solid #2563eb;
                        padding-left: 12px;
                        margin-bottom: 14px;
                    }
                    .doc-title { font-size: 16px; font-weight: 700; color: #1e293b; margin: 0; }
                    .doc-meta { font-size: 12px; color: #64748b; margin-top: 2px; }
                    .meta-table { width: 100%; border-collapse: collapse; margin-bottom: 15px; font-size: 12px; }
                    .meta-table td { padding: 5px 8px; border: 1px solid #e2e8f0; }
                    .meta-table td.label { font-weight: 600; background: #f8fafc; width: 22%; }
                    .transcribed-box {
                        background: #ffffff;
                        border: 1px solid #cbd5e1;
                        border-radius: 6px;
                        padding: 14px;
                        margin-bottom: 18px;
                        white-space: pre-wrap;
                        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace;
                        font-size: 13px;
                        line-height: 1.6;
                        color: #1e293b;
                    }
                    .image-box { text-align: center; margin-top: 15px; }
                    .doc-image { max-width: 100%; max-height: 650px; object-fit: contain; border: 1px solid #cbd5e1; border-radius: 6px; }
                    .footer-audit {
                        border-top: 2px solid #e2e8f0;
                        padding-top: 20px;
                        margin-top: 40px;
                        font-size: 12px;
                        color: #64748b;
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                    }
                    @media print {
                        body { padding: 0; }
                        .no-print { display: none !important; }
                        .doc-entry { page-break-after: always; }
                        .doc-entry:last-child { page-break-after: auto; }
                    }
                </style>
            </head>
            <body>
                <div class="no-print">
                    <div>
                        <strong>Consolidated Clinical Dossier (${sorted.length} Records)</strong>
                        <span style="opacity: 0.8; margin-left: 8px; font-size: 12px;">${patient.name}</span>
                    </div>
                    <div>
                        <button class="btn-print" onclick="window.print()">🖨️ Print / Save as PDF</button>
                        <button class="btn-close" onclick="window.close()">✕ Close</button>
                    </div>
                </div>

                <div class="dossier-header">
                    <h1 class="practice-title">${practiceInfo.name}</h1>
                    ${practiceInfo.title ? `<div style="font-size: 15px; font-weight: 600; color: #334155; margin-top: 3px;">${practiceInfo.title}</div>` : ''}
                    <div class="practice-sub" style="display: flex; gap: 16px; flex-wrap: wrap; margin-top: 6px; font-size: 13px; color: #475569;">
                        ${practiceInfo.practiceNumber ? `<span><strong>Practice No (PCNS):</strong> ${practiceInfo.practiceNumber}</span>` : ''}
                        ${practiceInfo.hpcsaNumber ? `<span><strong>HPCSA / Reg No:</strong> ${practiceInfo.hpcsaNumber}</span>` : ''}
                        ${practiceInfo.phone ? `<span><strong>Tel:</strong> ${practiceInfo.phone}</span>` : ''}
                    </div>
                    <div class="dossier-badge">Certified Medical Dossier &bull; HPCSA Booklet 9 & ECTA Compliant</div>
                </div>

                <div class="summary-grid">
                    <div class="summary-item"><strong>Client Name:</strong> ${patient.name}</div>
                    <div class="summary-item"><strong>Client Phone:</strong> ${patient.phone || 'N/A'}</div>
                    <div class="summary-item"><strong>Practice / Practitioner:</strong> ${practiceInfo.name} ${practiceInfo.title ? `(${practiceInfo.title})` : ''}</div>
                    <div class="summary-item"><strong>Registration Numbers:</strong> ${[practiceInfo.practiceNumber ? `PCNS: ${practiceInfo.practiceNumber}` : null, practiceInfo.hpcsaNumber ? `HPCSA: ${practiceInfo.hpcsaNumber}` : null].filter(Boolean).join(' | ') || 'N/A'}</div>
                    <div class="summary-item"><strong>Total Records:</strong> ${sorted.length} Clinical Documents</div>
                    <div class="summary-item"><strong>Date Range:</strong> ${earliestDate} &ndash; ${latestDate}</div>
                    <div class="summary-item"><strong>Generated On:</strong> ${new Date().toLocaleString('en-ZA')}</div>
                    <div class="summary-item"><strong>Retention Policy:</strong> 6-Year Mandatory Minimum (Rule 9.1)</div>
                </div>

                <h3 style="font-size: 14px; font-weight: 700; margin: 0 0 10px; color: #1e3a8a;">Table of Contents / Chronological Index</h3>
                <table class="toc-table">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Date</th>
                            <th>Document Type</th>
                            <th>Status</th>
                            <th>ECTA SHA-256 Checksum (Integrity)</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${sorted.map((item, idx) => `
                            <tr>
                                <td>${idx + 1}</td>
                                <td>${new Date(item.doc.created_at).toLocaleDateString('en-ZA')}</td>
                                <td><strong>${item.doc.document_type.replace(/_/g, ' ')}</strong></td>
                                <td>${item.doc.status}</td>
                                <td><code style="font-size: 10px;">${item.doc.sha256_checksum.substring(0, 16)}...</code></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>

                ${sorted.map((item, idx) => `
                    <div class="doc-entry">
                        <div class="doc-header">
                            <h2 class="doc-title">Record #${idx + 1}: ${item.doc.document_type.replace(/_/g, ' ')}</h2>
                            <div class="doc-meta">Created on ${new Date(item.doc.created_at).toLocaleString('en-ZA')} &bull; Status: ${item.doc.status}</div>
                        </div>

                        <table class="meta-table">
                            <tr>
                                <td class="label">Document ID:</td>
                                <td><code>${item.doc.id}</code></td>
                                <td class="label">Status:</td>
                                <td><strong>${item.doc.status}</strong> ${item.doc.verified_at ? `(Verified ${new Date(item.doc.verified_at).toLocaleDateString('en-ZA')})` : ''}</td>
                            </tr>
                            <tr>
                                <td class="label">Retention Mandate:</td>
                                <td>Retain until ${new Date(item.doc.retention_until).toLocaleDateString('en-ZA')}</td>
                                <td class="label">SHA-256 Checksum:</td>
                                <td><code style="font-size: 10px;">${item.doc.sha256_checksum}</code></td>
                            </tr>
                        </table>

                        <h4 style="font-size: 13px; font-weight: 700; margin: 12px 0 6px; color: #334155;">Digitized & Verified Clinical Text</h4>
                        <div class="transcribed-box">${item.doc.verified_text || item.doc.raw_ocr_text || 'No transcribed content recorded.'}</div>

                        ${item.url ? `
                            <h4 style="font-size: 13px; font-weight: 700; margin: 14px 0 6px; color: #334155;">Original Scanned Artifact</h4>
                            <div class="image-box">
                                <img src="${item.url}" class="doc-image" alt="Scanned Document #${idx + 1}" />
                            </div>
                        ` : ''}
                    </div>
                `).join('')}

                <div class="footer-audit">
                    <div>
                        <strong>Practitioner Verification & Certification:</strong><br />
                        I certify that this consolidated dossier is a true and accurate record of the clinical consultations.<br />
                        <span style="font-size: 11px; color: #64748b;">
                            ${practiceInfo.name} ${practiceInfo.title ? `&bull; ${practiceInfo.title}` : ''}
                            ${practiceInfo.practiceNumber ? `&bull; Practice No (PCNS): ${practiceInfo.practiceNumber}` : ''}
                            ${practiceInfo.hpcsaNumber ? `&bull; HPCSA Reg: ${practiceInfo.hpcsaNumber}` : ''}
                        </span>
                    </div>
                    <div style="border-top: 1px solid #94a3b8; width: 220px; text-align: center; padding-top: 4px; margin-top: 30px;">
                        Practitioner Signature & Date
                    </div>
                </div>

                <script>
                    window.onload = function() {
                        setTimeout(function() { window.print(); }, 400);
                    }
                </script>
            </body>
            </html>
            `;

            printWindow.document.open();
            printWindow.document.write(html);
            printWindow.document.close();
        } catch (err: any) {
            console.error('Consolidated dossier export failed:', err);
            if (printWindow) printWindow.close();
            toast.error(err.message || 'Failed to generate consolidated dossier');
        }
    };

    const copyToClipboard = (text: string, label: string) => {
        navigator.clipboard.writeText(text);
        toast.success(`${label} copied to clipboard!`);
    };

    return (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
            <div className="modal" style={{ maxWidth: '850px', width: '95%', maxHeight: '90vh', overflowY: 'auto' }}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem', marginBottom: '1rem' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <h3 className="modal-title" style={{ margin: 0 }}>Client Documents & Notes</h3>
                            <span className="badge badge-green" style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <ShieldCheck size={12} /> HPCSA Compliant
                            </span>
                        </div>
                        <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                            Client: <strong>{patient.name}</strong> {patient.phone ? `(${patient.phone})` : ''}
                        </p>
                    </div>
                    <button className="btn btn-ghost btn-sm" onClick={onClose}><X size={20} /></button>
                </div>

                {/* South Africa Legal Banner */}
                <div style={{
                    background: 'rgba(37, 99, 235, 0.08)',
                    border: '1px solid rgba(37, 99, 235, 0.25)',
                    borderRadius: '8px',
                    padding: '0.75rem 1rem',
                    marginBottom: '1rem',
                    fontSize: '0.8rem',
                    lineHeight: '1.4',
                    display: 'flex',
                    gap: '10px'
                }}>
                    <ShieldCheck size={18} style={{ color: '#3b82f6', flexShrink: 0, marginTop: '2px' }} />
                    <div>
                        <strong>South Africa Statutory Document Retention (HPCSA & ECTA):</strong> All handwritten notes and clinical documents are securely stored for at least <strong>6 years</strong> (HPCSA Booklet 9 Rule 9.1). Original scans are cryptographically hashed with SHA-256 for legal admissibility under ECTA Section 14.
                    </div>
                </div>

                {/* Tabs */}
                <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-color)', marginBottom: '1.25rem' }}>
                    <button
                        className={`btn ${activeTab === 'list' ? 'btn-primary' : 'btn-ghost'}`}
                        style={{ borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }}
                        onClick={() => setActiveTab('list')}
                    >
                        Saved Records ({documents.length})
                    </button>
                    <button
                        className={`btn ${activeTab === 'upload' ? 'btn-primary' : 'btn-ghost'}`}
                        style={{ borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }}
                        onClick={() => setActiveTab('upload')}
                    >
                        <Camera size={15} /> Scan / Upload Note
                    </button>
                </div>

                {/* TAB 1: LIST DOCUMENTS */}
                {activeTab === 'list' && (
                    <div>
                        {loading ? (
                            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                                <RefreshCw size={24} className="spin" style={{ margin: '0 auto 8px' }} />
                                Loading documents…
                            </div>
                        ) : documents.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '3rem 1rem', border: '1px dashed var(--border-color)', borderRadius: '8px' }}>
                                <FileCheck size={40} style={{ color: 'var(--text-muted)', margin: '0 auto 12px' }} />
                                <h4 style={{ margin: '0 0 6px', fontSize: '1rem' }}>No clinical documents or scanned notes yet</h4>
                                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', maxWidth: '420px', margin: '0 auto 1.5rem' }}>
                                    Capture handwritten consultation notes, signed consent forms, or lab reports to save both the raw picture and digitized content.
                                </p>
                                <button className="btn btn-primary" onClick={() => setActiveTab('upload')}>
                                    <Camera size={16} /> Scan First Note
                                </button>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                <div style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    background: 'rgba(37, 99, 235, 0.08)',
                                    border: '1px solid rgba(37, 99, 235, 0.25)',
                                    borderRadius: '8px',
                                    padding: '0.85rem 1rem',
                                    flexWrap: 'wrap',
                                    gap: '10px'
                                }}>
                                    <div>
                                        <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1e3a8a' }}>
                                            Complete Client Records ({documents.length})
                                        </div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                            Compile all verified notes & original scans into a single chronological legal dossier
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        className="btn btn-primary"
                                        onClick={handlePrintConsolidatedDossier}
                                        style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.825rem', padding: '6px 14px' }}
                                    >
                                        <Printer size={15} /> Export / Print Consolidated Dossier (All Records)
                                    </button>
                                </div>

                                {documents.map(doc => {
                                    const retentionDate = new Date(doc.retention_until);
                                    const now = new Date();
                                    const yearsRemaining = Math.max(0, Math.ceil((retentionDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 365.25)));

                                    return (
                                        <div
                                            key={doc.id}
                                            className="card"
                                            style={{
                                                padding: '1rem',
                                                border: '1px solid var(--border-color)',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: '0.75rem'
                                            }}
                                        >
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
                                                <div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                                        <span className="badge badge-blue" style={{ fontSize: '0.75rem', fontWeight: 600 }}>
                                                            {doc.document_type.replace('_', ' ')}
                                                        </span>
                                                        <span className={`badge ${doc.status === 'VERIFIED' ? 'badge-green' : 'badge-yellow'}`} style={{ fontSize: '0.75rem' }}>
                                                            {doc.status === 'VERIFIED' ? '✓ Verified & Signed' : 'Pending Review'}
                                                        </span>
                                                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                                            {new Date(doc.created_at).toLocaleDateString('en-ZA', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                        </span>
                                                    </div>
                                                    <div style={{ fontSize: '0.85rem', fontWeight: 600, marginTop: '4px' }}>
                                                        {doc.file_name} ({(doc.file_size_bytes / 1024).toFixed(0)} KB)
                                                    </div>
                                                </div>

                                                <div style={{ display: 'flex', gap: '6px' }}>
                                                    <button
                                                        className="btn btn-secondary btn-sm"
                                                        onClick={() => handleViewDoc(doc)}
                                                        title="View Scanned Image and Full Transcription"
                                                    >
                                                        <Eye size={14} /> View
                                                    </button>
                                                    <button
                                                        className="btn btn-secondary btn-sm"
                                                        onClick={async () => {
                                                            const preWindow = window.open('', '_blank');
                                                            if (preWindow) {
                                                                preWindow.document.write('<!DOCTYPE html><html><body style="font-family:sans-serif;padding:30px;text-align:center;color:#475569;"><h3>Preparing legal record for print / PDF export...</h3></body></html>');
                                                            }
                                                            try {
                                                                const url = await getDocumentViewUrl(doc.storage_path);
                                                                handlePrintLegalExport(doc, url, preWindow);
                                                            } catch (err: any) {
                                                                if (preWindow) preWindow.close();
                                                                toast.error('Failed to load document for export');
                                                            }
                                                        }}
                                                        title="Print Legal Record / Export PDF"
                                                    >
                                                        <Printer size={14} /> Export / Print
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Digital Content Preview */}
                                            {doc.verified_text || doc.raw_ocr_text ? (
                                                <div style={{
                                                    background: 'rgba(0, 0, 0, 0.25)',
                                                    border: '1px solid var(--border-color)',
                                                    borderRadius: '6px',
                                                    padding: '0.75rem',
                                                    fontSize: '0.85rem',
                                                    maxHeight: '120px',
                                                    overflowY: 'auto',
                                                    whiteSpace: 'pre-wrap',
                                                    color: 'var(--text-color)'
                                                }}>
                                                    {doc.verified_text || doc.raw_ocr_text}
                                                </div>
                                            ) : (
                                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                                                    Raw picture preserved. No digital text transcribed.
                                                </div>
                                            )}

                                            {/* Footer with Compliance details */}
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', color: 'var(--text-muted)', flexWrap: 'wrap', gap: '8px', borderTop: '1px solid var(--border-color)', paddingTop: '8px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <Clock size={12} style={{ color: '#10b981' }} />
                                                    <span>HPCSA Retention: <strong>{yearsRemaining} years remaining</strong> (until {retentionDate.toLocaleDateString('en-ZA')})</span>
                                                </div>

                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <span title={`Full ECTA Section 14 Checksum: ${doc.sha256_checksum}`} style={{ fontFamily: 'monospace' }}>
                                                        SHA-256: {doc.sha256_checksum.substring(0, 10)}…
                                                    </span>
                                                    <button
                                                        type="button"
                                                        className="btn btn-ghost btn-sm btn-icon"
                                                        style={{ padding: '2px' }}
                                                        onClick={() => copyToClipboard(doc.sha256_checksum, 'SHA-256 checksum')}
                                                        title="Copy SHA-256 Checksum"
                                                    >
                                                        <Copy size={12} />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* TAB 2: SCAN / UPLOAD */}
                {activeTab === 'upload' && (
                    <div>
                        {/* Hidden file inputs */}
                        <input
                            ref={cameraInputRef}
                            type="file"
                            accept="image/*"
                            capture="environment"
                            style={{ display: 'none' }}
                            onChange={e => e.target.files?.[0] && handleFileSelected(e.target.files[0])}
                        />
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*,application/pdf"
                            style={{ display: 'none' }}
                            onChange={e => e.target.files?.[0] && handleFileSelected(e.target.files[0])}
                        />

                        {!selectedFile ? (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', padding: '1.5rem 0' }}>
                                <div
                                    onClick={() => cameraInputRef.current?.click()}
                                    className="card"
                                    style={{
                                        textAlign: 'center',
                                        padding: '2.5rem 1rem',
                                        cursor: 'pointer',
                                        border: '2px dashed var(--accent)',
                                        background: 'rgba(59, 130, 246, 0.05)',
                                        transition: 'all 0.2s ease'
                                    }}
                                >
                                    <Camera size={38} style={{ color: 'var(--accent)', margin: '0 auto 12px' }} />
                                    <h4 style={{ margin: '0 0 6px', fontSize: '1rem' }}>Take Photo / Camera Scan</h4>
                                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
                                        Directly activates mobile/tablet rear camera to capture handwritten sheets.
                                    </p>
                                </div>

                                <div
                                    onClick={() => fileInputRef.current?.click()}
                                    className="card"
                                    style={{
                                        textAlign: 'center',
                                        padding: '2.5rem 1rem',
                                        cursor: 'pointer',
                                        border: '2px dashed var(--border-color)',
                                        transition: 'all 0.2s ease'
                                    }}
                                >
                                    <Upload size={38} style={{ color: 'var(--text-muted)', margin: '0 auto 12px' }} />
                                    <h4 style={{ margin: '0 0 6px', fontSize: '1rem' }}>Upload Image / PDF</h4>
                                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
                                        Select an existing photo, scanned document, or PDF from your device.
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                {/* File details and options */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
                                    <div className="form-group" style={{ margin: 0 }}>
                                        <label className="form-label">Document Category *</label>
                                        <select
                                            className="form-input"
                                            value={docType}
                                            onChange={e => setDocType(e.target.value as any)}
                                        >
                                            <option value="CLINICAL_NOTE">Clinical Note (Handwritten Consultation)</option>
                                            <option value="CONSENT_FORM">Signed Consent Form</option>
                                            <option value="REFERRAL">Referral Letter / Medical Report</option>
                                            <option value="PRESCRIPTION">Prescription / Treatment Plan</option>
                                            <option value="OTHER">Other Health Document</option>
                                        </select>
                                    </div>

                                    <div className="form-group" style={{ margin: 0 }}>
                                        <label className="form-label">SA Legal Retention Mandate *</label>
                                        <select
                                            className="form-input"
                                            value={retentionYears}
                                            onChange={e => setRetentionYears(Number(e.target.value))}
                                        >
                                            <option value={6}>Standard Adult: 6 Years (HPCSA Rule 9.1)</option>
                                            <option value={10}>Extended Retention: 10 Years</option>
                                            <option value={21}>Minor / Obstetric: 21 Years (Until Adult)</option>
                                        </select>
                                    </div>
                                </div>

                                {/* SHA-256 Integrity Verification badge */}
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '0.6rem 0.8rem',
                                    background: 'rgba(16, 185, 129, 0.08)',
                                    border: '1px solid rgba(16, 185, 129, 0.3)',
                                    borderRadius: '6px',
                                    fontSize: '0.78rem'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <CheckCircle2 size={16} style={{ color: '#10b981' }} />
                                        <span><strong>ECTA Sec 14 Hash:</strong> <code style={{ fontFamily: 'monospace' }}>{fileHash.substring(0, 24)}…</code></span>
                                    </div>
                                    <span style={{ color: 'var(--text-muted)' }}>Immutable original artifact</span>
                                </div>

                                {/* Split view: Image Preview + Digitized Text */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem' }}>
                                    {/* Left: Image Preview */}
                                    <div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                            <label className="form-label" style={{ margin: 0 }}>Original Scanned Picture</label>
                                            <button
                                                type="button"
                                                className="btn btn-ghost btn-sm"
                                                onClick={() => { setSelectedFile(null); setFilePreview(null); }}
                                                style={{ fontSize: '0.75rem', padding: '2px 6px' }}
                                            >
                                                Change Image
                                            </button>
                                        </div>
                                        {filePreview && (
                                            <div style={{
                                                maxHeight: '340px',
                                                overflow: 'auto',
                                                border: '1px solid var(--border-color)',
                                                borderRadius: '6px',
                                                background: '#000',
                                                textAlign: 'center'
                                            }}>
                                                <img
                                                    src={filePreview}
                                                    alt="Scan Preview"
                                                    style={{ maxWidth: '100%', maxHeight: '330px', objectFit: 'contain' }}
                                                />
                                            </div>
                                        )}
                                    </div>

                                    {/* Right: Digital Text Content */}
                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                            <label className="form-label" style={{ margin: 0 }}>Digitized Text Content</label>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <button
                                                    type="button"
                                                    className="btn btn-secondary btn-sm"
                                                    onClick={() => setApiKeyPrompt(!apiKeyPrompt)}
                                                    title="Configure API Key"
                                                    style={{ fontSize: '0.75rem', padding: '4px 6px', display: 'flex', alignItems: 'center', gap: '4px' }}
                                                >
                                                    <Key size={12} /> {hasSavedKey ? 'Key Saved' : 'Set Key'}
                                                </button>
                                                <button
                                                    type="button"
                                                    className="btn btn-primary btn-sm"
                                                    onClick={() => handleTranscribe()}
                                                    disabled={isTranscribing}
                                                    style={{ fontSize: '0.75rem', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: '4px' }}
                                                >
                                                    {isTranscribing ? <RefreshCw size={12} className="spin" /> : <Sparkles size={12} />}
                                                    {isTranscribing ? 'Transcribing…' : 'AI Transcribe Handwriting'}
                                                </button>
                                            </div>
                                        </div>

                                        {apiKeyPrompt && (
                                            <div style={{
                                                padding: '0.75rem',
                                                background: 'rgba(59, 130, 246, 0.08)',
                                                border: '1px solid rgba(59, 130, 246, 0.3)',
                                                borderRadius: '6px',
                                                marginBottom: '8px',
                                                fontSize: '0.8rem'
                                            }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                                    <span style={{ fontWeight: 600 }}>OpenRouter or Gemini API Key</span>
                                                    {(localStorage.getItem('openrouter_api_key') || localStorage.getItem('gemini_api_key')) && (
                                                        <button
                                                            type="button"
                                                            style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '0.75rem', cursor: 'pointer', padding: 0 }}
                                                            onClick={() => {
                                                                localStorage.removeItem('openrouter_api_key');
                                                                localStorage.removeItem('gemini_api_key');
                                                                setHasSavedKey(false);
                                                                setTempApiKey('');
                                                                toast.success('Saved API key removed');
                                                            }}
                                                        >
                                                            Clear Key
                                                        </button>
                                                    )}
                                                </div>
                                                <div style={{ display: 'flex', gap: '6px' }}>
                                                    <input
                                                        type="password"
                                                        className="form-input"
                                                        placeholder="Paste OpenRouter (sk-or-...) or Gemini key"
                                                        value={tempApiKey}
                                                        onChange={e => setTempApiKey(e.target.value)}
                                                        style={{ fontSize: '0.8rem', padding: '4px 8px' }}
                                                    />
                                                    <button
                                                        type="button"
                                                        className="btn btn-primary btn-sm"
                                                        onClick={() => {
                                                            const trimmed = tempApiKey.trim();
                                                            if (!trimmed) {
                                                                toast.error('Please enter an API key');
                                                                return;
                                                            }
                                                            if (trimmed.startsWith('sk-')) {
                                                                localStorage.setItem('openrouter_api_key', trimmed);
                                                            } else {
                                                                localStorage.setItem('gemini_api_key', trimmed);
                                                            }
                                                            setHasSavedKey(true);
                                                            toast.success('API key saved in browser!');
                                                            handleTranscribe(trimmed);
                                                        }}
                                                    >
                                                        Save & Run
                                                    </button>
                                                </div>
                                                <p style={{ margin: '6px 0 0', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                                    Stored safely in your device browser. Alternatively, configure in Settings or Netlify.
                                                </p>
                                            </div>
                                        )}

                                        <textarea
                                            className="form-textarea"
                                            rows={12}
                                            value={digitalText}
                                            onChange={e => setDigitalText(e.target.value)}
                                            placeholder="Click 'AI Transcribe Handwriting' to transcribe automatically, or type/review clinical notes manually here…"
                                            style={{ flex: 1, minHeight: '260px', fontFamily: 'monospace', fontSize: '0.85rem' }}
                                        />
                                    </div>
                                </div>

                                {/* Modal Actions */}
                                <div className="modal-footer" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
                                    <button
                                        type="button"
                                        className="btn btn-secondary"
                                        onClick={() => { setSelectedFile(null); setFilePreview(null); setActiveTab('list'); }}
                                        disabled={isSaving}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        className="btn btn-secondary"
                                        onClick={() => handleSaveDocument('PENDING_REVIEW')}
                                        disabled={isSaving}
                                    >
                                        {isSaving ? 'Saving…' : 'Save as Pending Review'}
                                    </button>
                                    <button
                                        type="button"
                                        className="btn btn-primary"
                                        onClick={() => handleSaveDocument('VERIFIED')}
                                        disabled={isSaving}
                                    >
                                        <CheckCircle2 size={16} />
                                        {isSaving ? 'Saving…' : 'Verify & Lock Document'}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* MODAL: VIEW FULL DOCUMENT & VERIFY */}
                {viewingDoc && (
                    <div
                        className="modal-overlay"
                        style={{ zIndex: 1100 }}
                        onClick={e => e.target === e.currentTarget && setViewingDoc(null)}
                    >
                        <div className="modal" style={{ maxWidth: '800px', width: '95%', maxHeight: '90vh', overflowY: 'auto' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
                                <div>
                                    <h3 className="modal-title" style={{ margin: 0 }}>
                                        {viewingDoc.document_type.replace('_', ' ')}
                                    </h3>
                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                        Uploaded {new Date(viewingDoc.created_at).toLocaleString('en-ZA')}
                                    </span>
                                </div>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    {viewingUrl && (
                                        <button
                                            className="btn btn-secondary btn-sm"
                                            onClick={() => handlePrintLegalExport(viewingDoc, viewingUrl)}
                                        >
                                            <Printer size={14} /> Print Legal Copy
                                        </button>
                                    )}
                                    <button className="btn btn-ghost btn-sm" onClick={() => setViewingDoc(null)}><X size={20} /></button>
                                </div>
                            </div>

                            {/* View Content */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                {/* Original Scan Image */}
                                {viewingUrl && (
                                    <div style={{ textAlign: 'center', background: '#000', borderRadius: '6px', padding: '8px' }}>
                                        <img
                                            src={viewingUrl}
                                            alt={viewingDoc.file_name}
                                            style={{ maxWidth: '100%', maxHeight: '400px', objectFit: 'contain' }}
                                        />
                                        <div style={{ marginTop: '8px' }}>
                                            <a
                                                href={viewingUrl}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="btn btn-secondary btn-sm"
                                                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                            >
                                                <ExternalLink size={12} /> Open Original in New Tab
                                            </a>
                                        </div>
                                    </div>
                                )}

                                {/* Digital Text Section */}
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                        <h4 style={{ margin: 0, fontSize: '0.9rem' }}>Verified Digital Text</h4>
                                        {editingDocId !== viewingDoc.id && (
                                            <button
                                                className="btn btn-ghost btn-sm"
                                                onClick={() => {
                                                    setEditingDocId(viewingDoc.id);
                                                    setEditedText(viewingDoc.verified_text || viewingDoc.raw_ocr_text || '');
                                                }}
                                            >
                                                Edit Digital Text
                                            </button>
                                        )}
                                    </div>

                                    {editingDocId === viewingDoc.id ? (
                                        <div>
                                            <textarea
                                                className="form-textarea"
                                                rows={8}
                                                value={editedText}
                                                onChange={e => setEditedText(e.target.value)}
                                                style={{ width: '100%', fontFamily: 'monospace' }}
                                            />
                                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                                                <button className="btn btn-secondary btn-sm" onClick={() => setEditingDocId(null)}>Cancel</button>
                                                <button className="btn btn-primary btn-sm" onClick={() => handleVerifyExistingDoc(viewingDoc)}>Save & Verify</button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div style={{
                                            background: 'rgba(0, 0, 0, 0.25)',
                                            border: '1px solid var(--border-color)',
                                            borderRadius: '6px',
                                            padding: '1rem',
                                            whiteSpace: 'pre-wrap',
                                            fontFamily: 'monospace',
                                            fontSize: '0.85rem'
                                        }}>
                                            {viewingDoc.verified_text || viewingDoc.raw_ocr_text || 'No digital text recorded.'}
                                        </div>
                                    )}
                                </div>

                                {/* Statutory Retention Metadata */}
                                <div style={{
                                    borderTop: '1px solid var(--border-color)',
                                    paddingTop: '0.75rem',
                                    fontSize: '0.75rem',
                                    color: 'var(--text-muted)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '4px'
                                }}>
                                    <div><strong>ECTA Section 14 Checksum:</strong> <code>{viewingDoc.sha256_checksum}</code></div>
                                    <div><strong>HPCSA Statutory Retention:</strong> Retain until {new Date(viewingDoc.retention_until).toLocaleDateString('en-ZA')}</div>
                                    <div><strong>Storage Path:</strong> <code>{viewingDoc.storage_path}</code></div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
