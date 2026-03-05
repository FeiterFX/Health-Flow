import { Patient, Appointment } from '@prisma/client';

export type MsgType = 'CONFIRMATION' | 'REMINDER' | 'CHANGE' | 'CANCELLATION' | 'CUSTOM';

function formatDate(dt: Date): string {
    return dt.toLocaleDateString('en-ZA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Africa/Johannesburg' });
}

function formatTime(dt: Date): string {
    return dt.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Johannesburg' });
}

export function buildMessage(patient: Patient, appt: Appointment, type: MsgType, practiceName: string = 'Dr. Roelof Retief'): string {
    const date = formatDate(new Date(appt.startTime));
    const time = formatTime(new Date(appt.startTime));
    switch (type) {
        case 'CONFIRMATION':
            return `Dear ${patient.name}. A reminder of your appointment with ${practiceName} on ${date} at ${time}. ${appt.customMsg ? appt.customMsg : ''}`;
        case 'REMINDER':
            return `Dear ${patient.name}. A reminder of your appointment with ${practiceName} on ${date} at ${time}.`;
        case 'CHANGE':
            return `Your appointment with ${practiceName} has been rescheduled to ${date} at ${time} SAST. Please contact us if you have any questions.`;
        case 'CANCELLATION':
            return `Your appointment with ${practiceName} on ${date} at ${time} SAST has been cancelled. Please contact us to reschedule.`;
        default:
            return appt.customMsg || `Message from ${practiceName}.`;
    }
}
