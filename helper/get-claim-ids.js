import axios from "axios";
import {config} from "dotenv"

config({
    quiet: true,
})

export const getClaimIds = async (sessionId, patientId) => {
    try {
        const url = `${process.env.ODOO_URL}/web/dataset/search_read`;

        // JSON-RPC request body
        const body = {
            "jsonrpc": "2.0",
            "method": "call",
            "params": {
                "model": "insurance.claim",
                "fields": ["claim_code", "started_date", "ended_date", "partner_id", "claim_manager_id", "claimed_amount_total", "amount_approved_total", "state", "claim_comments"],
                "domain": [["state", "in", ["draft", "confirmed"]], ["partner_id", "ilike", `${patientId}`]],
                "context": {
                    "lang": "en_US",
                    "tz": "Asia/Kathmandu",
                    "uid": 9,
                    "params": {"action": 399},
                    "bin_size": true
                },
                "offset": 0,
                "limit": 80,
                "sort": "create_date DESC"
            },
            "id": Math.floor(100000000 + Math.random() * 900000000)
        };

        const res = await axios.post(url, body, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:144.0) Gecko/20100101 Firefox/144.0",
                "Accept": "application/json, text/javascript, */*; q=0.01",
                "Content-Type": "application/json",
                "X-Requested-With": "XMLHttpRequest",
                "Cookie": sessionId
            },
            timeout: 30000
        });


        // Check if the response has valid data
        if (res.data && res.data.result) {
            const result = res.data.result;

            // Handle different response structures
            const allClaims = result.records || result || [];

            // Ensure allClaims is an array
            if (!Array.isArray(allClaims)) {
                console.log('❌ Expected array but got:', typeof allClaims);
                console.log('Response structure:', JSON.stringify(result, null, 2));
                return {
                    success: false,
                    error: 'Invalid response format: expected array of claims',
                    status: res.status
                };
            }

            // Get today's date in YYYY-MM-DD format (matching server timezone Asia/Kathmandu)
            const today = new Date().toLocaleDateString('en-CA', {timeZone: 'Asia/Kathmandu'});

            // const today = "2025-06-08"

            // Filter claims where both started_date and ended_date are today AND state is 'draft'
            const todayClaims = allClaims.filter(claim => {
                const startedDate = claim.started_date ? claim.started_date.split(' ')[0] : '';
                const endedDate = claim.ended_date ? claim.ended_date.split(' ')[0] : '';
                return startedDate === today && endedDate === today && claim.state === 'draft';
            });

            console.log(`🔍 Found ${todayClaims.length} claims for ${patientId}`);


            return {
                claim_code: todayClaims.claim_code,
                success: true,
                data: todayClaims,
                patient_id: patientId,
                total: todayClaims.length,
                status: res.status
            };
        } else {
            console.log('❌ Invalid response format');
            return {
                success: false,
                error: 'Invalid response format from server',
                status: res.status
            };
        }

    } catch (error) {
        console.error("Error:", error.message);
        if (error.response) {
            console.error("Response status:", error.response.status);
            console.error("Response data:", error.response.data);
        }

        return {
            success: false,
            error: error.message,
            status: error.response?.status || 0
        };
    }
}