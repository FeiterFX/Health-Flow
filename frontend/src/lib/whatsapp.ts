export type MsgType = 'CONFIRMATION' | 'REMINDER' | 'CHANGE' | 'CANCELLATION' | 'CUSTOM';

function formatDate(dt: Date): string {
    return dt.toLocaleDateString('en-ZA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Africa/Johannesburg' });
}

function formatTime(dt: Date): string {
    return dt.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Johannesburg' });
}

export function buildMessage(patientName: string, startTime: string, type: MsgType, practiceName: string = 'Roelof Retief', customMsg?: string): string {
    const date = formatDate(new Date(startTime));
    const time = formatTime(new Date(startTime));

    switch (type) {
        case 'CONFIRMATION':
            return `Dear ${patientName}. A reminder of your appointment with ${practiceName} on ${date} at ${time}. ${customMsg ? customMsg : ''}`;
        case 'REMINDER':
            return `Dear ${patientName}. A reminder of your appointment with ${practiceName} on ${date} at ${time}.`;
        case 'CHANGE':
            return `Your appointment with ${practiceName} has been rescheduled to ${date} at ${time} SAST. Please contact us if you have any questions.`;
        case 'CANCELLATION':
            return `Your appointment with ${practiceName} on ${date} at ${time} SAST has been cancelled. Please contact us to reschedule.`;
        case 'CUSTOM':
        default:
            return customMsg || `Message from ${practiceName}.`;
    }
}
