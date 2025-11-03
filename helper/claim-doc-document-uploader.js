// lib/uploadClaimDoc.js

import fs from "node:fs";
import path from "node:path";
import { config } from "dotenv";

config({
	quiet: true,
});

export async function uploadClaimDoc(claimCode, folderPath) {
	try {
		const CLAIMDOC_USER = process.env.CLAIMDOC_USER;
		const CLAIMDOC_PASS = process.env.CLAIMDOC_PASS;

		if (!CLAIMDOC_USER || !CLAIMDOC_PASS) {
			console.error("❌ Missing CLAIMDOC_USER or CLAIMDOC_PASS in .env.");
			return false;
		}

		// ✅ 1️⃣ LOGIN → get access_code
		// console.log("🔐 Authenticating with ClaimDoc API...");
		const loginRes = await fetch("https://claimdoc.hib.gov.np/user/check.php", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				username: CLAIMDOC_USER,
				password: CLAIMDOC_PASS,
			}),
		});

		const loginData = await loginRes.json().catch(() => ({}));
		if (loginData.status !== "success" || !loginData.data?.access_code) {
			console.error("❌ ClaimDoc login failed:", loginData);
			return false;
		}
		const accessCode = loginData.data.access_code;
		console.log("\n✅ Access code obtained.");

		// ✅ 2️⃣ CREATE CLAIM → get claim_id
		const createRes = await fetch(
			"https://claimdoc.hib.gov.np/claim/create.php",
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					claim_code: claimCode,
					access_code: accessCode,
				}),
			},
		);

		const createData = await createRes.json().catch(() => ({}));
		if (createData.status !== "success" || !createData.data?.id) {
			console.error("❌ Claim creation failed:", createData);
			return false;
		}

		const claimId = createData.data.id;
		console.log(`✅ Claim created: ID = ${claimId}`);

		// ✅ 3️⃣ Find .pdf file in the folder
		const pdfFile = fs
			.readdirSync(folderPath)
			.find((f) => f.toLowerCase().endsWith(".pdf"));

		if (!pdfFile) {
			console.warn(`⚠️ No PDF file found in folder: ${folderPath}`);
			return false;
		}

		const filePath = path.join(folderPath, pdfFile);
		console.log(`📄 Found PDF file: ${pdfFile}`);

		// ✅ 4️⃣ Read and convert file to Base64
		const fileBuffer = fs.readFileSync(filePath);
		const fileBase64 = fileBuffer.toString("base64");

		// ✅ 5️⃣ Upload the file
		const uploadRes = await fetch(
			"https://claimdoc.hib.gov.np/claim/upload.php",
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					claim_id: claimId,
					name: pdfFile,
					access_code: accessCode,
					file: fileBase64,
				}),
			},
		);

		const uploadData = await uploadRes.json().catch(() => ({}));

		if (uploadData.status === "success") {
			// console.log(`✅ File uploaded successfully for claim ${claimCode}`);
			return true;
		} else {
			console.error(`❌ Upload failed for ${claimCode}:`, uploadData);
			return false;
		}
	} catch (err) {
		console.error(
			`❌ Error in uploadClaimDoc for claim ${claimCode}:`,
			err.message,
		);
		return false;
	}
}
