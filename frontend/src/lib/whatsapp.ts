export type MsgType = 'CONFIRMATION' | 'REMINDER' | 'CHANGE' | 'CANCELLATION' | 'CUSTOM';

function formatDate(dt: Date): string {
    return dt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'Africa/Johannesburg' });
}

function formatTime(dt: Date): string {
    return dt.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Johannesburg' });
}

export function buildMessage(patientName: string, startTime: string, type: MsgType, practiceName: string = 'Roelof Retief', customMsg?: string): string {
    const date = formatDate(new Date(startTime));
    const time = formatTime(new Date(startTime));

    // Extract first names only
    const firstName = patientName.split(' ')[0] || patientName;
    const practFirstName = practiceName.split(' ')[0] || practiceName;

    switch (type) {
        case 'CONFIRMATION':
            return `Dear ${firstName}, a reminder of your appointment on ${date}, ${time}. Regards ${practFirstName}. ${customMsg ? customMsg : ''}`;
        case 'REMINDER':
            return `Dear ${firstName}, a reminder of your appointment on ${date}, ${time}. Regards ${practFirstName}.`;
        case 'CHANGE':
            return `Dear ${firstName}, your appointment has been rescheduled to ${date}, ${time}. Regards ${practFirstName}. Please contact us if you have any questions.`;
        case 'CANCELLATION':
            return `Dear ${firstName}, your appointment on ${date}, ${time} has been cancelled. Regards ${practFirstName}. Please contact us to reschedule.`;
        case 'CUSTOM':
        default:
            return customMsg || `Message from ${practiceName}.`;
    }
}
