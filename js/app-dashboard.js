// APP DASHBOARD V2 CONTROLLER
// Handles the Sidebar & HUD Logic

const DashboardService = {
    // SYSTEM MESSAGES for Footer Log
    aiMessages: [
        "SYSTEM ONLINE",
        "CONNECTING TO SATELLITE...",
        "DATA STREAM: STABLE",
        "SCANNING SECTOR 7...",
        "OPTIMIZING MEMORY...",
        "ENCRYPTING TRAFFIC...",
        "UPDATING WEATHER DATA...",
        "CHECKING PERIMETER..."
    ],

    init: function () {
        this.startClock();
        this.startAITyping();
        console.log("Dashboard V2 Initialized");
    },

    startClock: function () {
        const update = () => {
            const now = new Date();
            // Time with Seconds
            const timeStr = now.toLocaleTimeString('en-US', { hour12: false });
            // Add Milliseconds for extra "Tech" feel? Maybe too fast. width changes.
            // Let's stick to HH:MM:SS but bold

            const timeEl = document.getElementById('hud-time');
            if (timeEl) timeEl.innerText = timeStr;

            // Date
            const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
            const dateStr = now.toLocaleDateString('id-ID', options).toUpperCase();
            const dateEl = document.getElementById('hud-date');
            if (dateEl) dateEl.innerText = dateStr;
        };
        update();
        setInterval(update, 1000);
    },

    startAITyping: function () {
        const el = document.getElementById('ai-log-text');
        if (!el) return;

        let msgIdx = 0;

        setInterval(() => {
            // Glitch effect text swap
            el.innerText = this.aiMessages[msgIdx];
            el.style.color = '#fff';
            setTimeout(() => el.style.color = '#0aff0a', 100); // Blink white then green

            msgIdx = (msgIdx + 1) % this.aiMessages.length;
        }, 3000);
    }
};

// Auto Init
document.addEventListener('DOMContentLoaded', () => {
    DashboardService.init();
});
