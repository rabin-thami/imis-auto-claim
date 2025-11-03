import path from "node:path";
import axios from "axios";
import { config } from "dotenv";
import { uploadClaimDoc } from "./claim-doc-document-uploader.js";
import { moveFolderToError } from "./folder-mover.js";

config({
	quiet: true,
});

// Helper function to create JSON-RPC request body
const createJsonRpcBody = (method, model, params) => ({
	jsonrpc: "2.0",
	method: "call",
	params: {
		model: model,
		method: method,
		...params,
	},
	id: Math.floor(100000000 + Math.random() * 900000000),
});

// Helper function to create common headers
const createHeaders = (sessionId) => ({
	"User-Agent":
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:144.0) Gecko/20100101 Firefox/144.0",
	Accept: "application/json, text/javascript, */*; q=0.01",
	"Content-Type": "application/json",
	"X-Requested-With": "XMLHttpRequest",
	Cookie: sessionId,
});

// Common request config
const createRequestConfig = (sessionId) => ({
	headers: createHeaders(sessionId),
	// Removed timeout to let the request complete naturally
	timeout: 0,
});

// Helper function to make Odoo API calls with retry mechanism
// Helper function to make Odoo API calls with polling until success
const makeOdooApiCall = async (endpoint, sessionId, method, model, params) => {
	const url = `${process.env.ODOO_URL}${endpoint}`;
	const body = createJsonRpcBody(method, model, params);
	const config = createRequestConfig(sessionId);

	while (true) {
		try {
			const response = await axios.post(url, body, config);
			return response;
		} catch (_error) {
			// Wait for 5 seconds before trying again
			await new Promise((resolve) => setTimeout(resolve, 5000));
		}
	}
};

// Helper function to check if API response is successful
const isApiSuccess = (response) => {
	return (
		response?.data && !response.data.error && response.data.result !== false
	);
};

export const getClaimDetailsAndUpload = async (
	sessionId,
	claimId,
	claimCodes = null,
	patientId = null,
	progressTracker = null,
) => {
	// Get details for all claims but generate one pager only for the first one
	const firstClaimId = claimId[0]; // Get only the first claim ID for one pager generation

	for (const id of claimId) {
		try {
			// Step 2: Get claim details
			if (progressTracker) progressTracker.setStep(1);
			const readParams = {
				args: [
					[id],
					[
						"package_claim",
						"message_follower_ids",
						"visit_type",
						"insurance_claim_history",
						"careType",
						"claim_id",
						"message_ids",
						"attachment_ids",
						"partner_id",
						"insurance_claim_line",
						"state",
						"hospital_diagnosis",
						"claim_code",
						"icd_code",
						"nhis_number",
						"claimed_amount_total_package",
						"sale_orders",
						"nmc",
						"claimed_amount_total",
						"started_date",
						"ended_date",
						"ipd_code",
						"claimed_received_date",
						"onepager_attachment_ids",
						"claim_manager_id",
						"access_code",
						"rejection_reason",
						"display_name",
						"__last_update",
					],
				],
				kwargs: {
					context: {
						lang: "en_US",
						tz: "Asia/Kathmandu",
						uid: 9,
						params: { action: 399 },
						bin_size: true,
					},
				},
			};

			const readResponse = await makeOdooApiCall(
				"/web/dataset/call_kw/insurance.claim/read",
				sessionId,
				"read",
				"insurance.claim",
				readParams,
			);

			if (!isApiSuccess(readResponse)) {
				continue; // Skip to the next claim
			}

			// Step 3: Confirm claim (only if read was successful)
			if (progressTracker) progressTracker.setStep(2);
			const confirmParams = {
				domain_id: null,
				context_id: 1,
				args: [
					[id],
					{
						lang: "en_US",
						tz: "Asia/Kathmandu",
						uid: 9,
						params: { action: 399 },
					},
				],
			};

			const _confirmResponse = await makeOdooApiCall(
				"/web/dataset/call_button",
				sessionId,
				"action_confirm",
				"insurance.claim",
				confirmParams,
			);

			// Step 4: Generate one pager only for the first claim ID
			if (id === firstClaimId) {
				if (progressTracker) progressTracker.setStep(3);
				// calling generate one page api
				const generateOnepagerParams = {
					domain_id: null,
					context_id: 1,
					args: [
						[id],
						{
							lang: "en_US",
							tz: "Asia/Kathmandu",
							uid: 9,
							params: { action: 399 },
						},
					],
				};

				const _generateOnepagerResponse = await makeOdooApiCall(
					"/web/dataset/call_button",
					sessionId,
					"print_generated_onepager",
					"insurance.claim",
					generateOnepagerParams,
				);
			}

			// Step 5: Submit claim
			if (progressTracker) progressTracker.setStep(4);
			const submitClaimParams = {
				args: [
					[id],
					{
						lang: "en_US",
						tz: "Asia/Kathmandu",
						uid: 9,
						params: {
							action: 399,
						},
					},
				],
			};

			const submitClaimResponse = await makeOdooApiCall(
				"/web/dataset/call_button",
				sessionId,
				"action_claim_submit",
				"insurance.claim",
				submitClaimParams,
			);

			if (submitClaimResponse.data?.error) {
				// Move folder to Error_Claim if there's an error (use patientId which is the folder name)
				if (patientId) {
					moveFolderToError(process.env.BASE_URL, patientId);
				}
				return { success: false, message: "Folder moved to Error_Claim" }; // Stop processing this patient
			} else {
				// Step 6: Upload document to Odoo
				if (progressTracker) progressTracker.setStep(5);
				const uploadDocumentParams = {
					args: [
						[id],
						{
							lang: "en_US",
							tz: "Asia/Kathmandu",
							uid: 9,
							params: { action: 400 },
						},
					],
				};

				const _uploadDocumentResponse = await makeOdooApiCall(
					"/web/dataset/call_button",
					sessionId,
					"upload_claim_attachments",
					"insurance.claim",
					uploadDocumentParams,
				);

				// Step 7: Call claim-doc API to upload document
				if (patientId && claimCodes && claimCodes.length > 0) {
					if (progressTracker) progressTracker.setStep(6);
					const folderPath = path.join(process.env.BASE_URL, patientId);
					const claimCode = claimCodes[0]; // Use first claim code
					await uploadClaimDoc(claimCode, folderPath);
				}

				// Step 8: Organize folders (will be handled in index.js)
				if (progressTracker) progressTracker.setStep(7);
			}
		} catch (error) {
			if (error.code === "ECONNABORTED" || error.message.includes("timeout")) {
				console.log(`⏰ Timeout processing claim ${id}, will retry...`);
			} else {
				console.log(`❌ Error processing claim ${id}: ${error.message}`);
			}

			// If there's a patient ID, move the folder to error state
			if (patientId) {
				await moveFolderToError(process.env.BASE_URL, patientId);
			}

			// Continue to next claim even if current one fails
		}
	}

	return { success: true, message: "All claims processed successfully" };
};
