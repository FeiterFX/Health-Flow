const axios = require('axios');
const http = require('http');

(async () => {
    // Let's create an appointment that exactly overlaps Id 9
    try {
        const res = await axios.post('http://localhost:3001/api/appointments', {
            patientId: 1,
            startTime: '2026-02-28T10:00', // 10:00 AM SAST = 08:00 UTC (id 9)
            notes: '',
            customMsg: ''
        }, {
            // Need auth? Wait, authMiddleware uses localStorage token. We don't have it since it's backend.
            // But the backend doesn't enforce real auth if JWT_SECRET is dev default?
            // Actually `authMiddleware` checks for Bearer token. I will just do it inside a script bypassing Express.
        });
        console.log("Success:", res.data);
    } catch (err) {
        if (err.response) {
            console.log('Error API:', err.response.data.error);
        } else {
            console.log('Error req:', err.message);
        }
    }
})();
