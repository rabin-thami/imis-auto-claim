import { config } from "dotenv";
import { chromium } from "playwright";
import { getFolderList } from "./lib/getFile.js";
import { uploadClaimDoc } from "./lib/uploadClaimDoc.js";
import fs from "fs";
import path from "path";

// Load environment variables
config();

const USER = process.env.USER;
const PASS = process.env.PASS;

// 🧩 Base directory
const BASE_DIR = "C:\\Users\\rabin\\OneDrive\\Desktop\\imis-file";
const ERROR_DIR = path.join(BASE_DIR, "Error_Claim");

// Ensure Error_Claim folder exists
if (!fs.existsSync(ERROR_DIR)) {
	fs.mkdirSync(ERROR_DIR, { recursive: true });
}

if (!USER || !PASS) {
	console.error("❌ Missing credentials. Set USER and PASS in your .env file.");
	process.exit(1);
}

// ---------- MAIN SCRIPT ----------
const browser = await chromium.launch({
	headless: false,
	slowMo: 50,
	args: ["--start-maximized"],
});

const context = await browser.newContext({ viewport: null });
const page = await context.newPage();

const folderList = getFolderList(BASE_DIR);
console.log("📁 Folder list:", folderList);

try {
	// 1️⃣ LOGIN
	await page.goto("http://192.168.1.3:8069/web/login", {
		waitUntil: "networkidle",
	});
	await page.fill("#login", USER);
	await page.fill("#password", PASS);
	await page.click("text=Log in");
	console.log("✅ Login successful!");

	// 2️⃣ GO TO CLAIM LIST PAGE
	await page.goto(
		"http://192.168.1.3:8069/web#min=1&limit=10&view_type=list&model=insurance.claim&menu_id=448&action=399",
		{ waitUntil: "networkidle" },
	);
	console.log("✅ Insurance claim page loaded!");

	for (const folder of folderList) {
		console.log(`\n🔍 Searching for folder: ${folder}`);

		await page.click("input.o_searchview_input");
		await page.type("input.o_searchview_input", folder);
		await page.keyboard.press("Enter");
		await page.waitForTimeout(2000);

		const hasRows = await page
			.locator("table.o_list_view tbody tr[data-id]")
			.count();
		if (hasRows === 0) {
			console.log("⚠️ No data rows found. Clearing search...");
			await page.click("input.o_searchview_input", { clickCount: 3 });
			await page.keyboard.press("Backspace");
			continue;
		}

		await page.waitForSelector("table.o_list_view tbody tr[data-id]");

		const visibleColumns = await page.$$eval(
			"table.o_list_view tbody tr[data-id]:first-child td",
			(cells) =>
				cells.filter(
					(td) => td.offsetParent !== null && td.textContent.trim().length > 0,
				).length,
		);
		console.log(`📊 Visible data columns: ${visibleColumns}`);

		const rowsData = await page.$$eval(
			"table.o_list_view tbody tr[data-id]",
			(rows) =>
				rows.map((row) => {
					const get = (sel) => row.querySelector(sel)?.innerText.trim() || "";
					return {
						id: row.getAttribute("data-id"),
						claimCode: get('td[data-field="claim_code"]'),
						start: get('td[data-field="started_date"]'),
						end: get('td[data-field="ended_date"]'),
						status: get('td[data-field="state"]'),
					};
				}),
		);

		const today = new Date();
		const checkDate = (d) => {
			const [mm, dd, yyyy] = d.split(/[ /:]/).map(Number);
			return (
				mm === today.getMonth() + 1 &&
				dd === today.getDate() &&
				yyyy === today.getFullYear()
			);
		};

		const matches = rowsData.filter(
			(r) => checkDate(r.start) && checkDate(r.end) && r.status === "Confirmed",
		);

		if (!matches.length) {
			console.log("⚠️ No matching data or status mismatch. Clearing search...");
			await page.click("input.o_searchview_input", { clickCount: 3 });
			await page.keyboard.press("Backspace");
			continue;
		}

		let pdfGenerated = false;
		let externalPageOpened = false;

		for (const match of matches) {
			console.log(
				`✅ Match: ${match.claimCode} | ${match.start} - ${match.end} | Status: ${match.status}`,
			);

			const rowLocator = page.locator(
				`table.o_list_view tbody tr[data-id="${match.id}"]`,
			);
			if (!(await rowLocator.count())) {
				console.log(`⚠️ Could not find row for ${match.claimCode}`);
				continue;
			}

			console.log(`🖱️ Clicking row for Claim ${match.claimCode}...`);
			await rowLocator.click();
			await page.waitForTimeout(1000);

			console.log("✅ Confirm Claim Button Clicked!");

			// 🧩 Unexpected modal after Confirm Claim
			const confirmModal = page.locator("div.modal-dialog");
			await confirmModal
				.waitFor({ state: "visible", timeout: 3000 })
				.catch(() => null);
			if (await confirmModal.count()) {
				const msg = (
					await confirmModal.locator(".modal-body").innerText()
				).trim();
				console.error(`❌ Unexpected modal after Confirm Claim: "${msg}"`);
				const okButton = confirmModal.locator('button:has-text("Ok")');
				if (await okButton.count()) await okButton.click();

				const oldPath = path.join(BASE_DIR, folder);
				const newPath = path.join(ERROR_DIR, folder);
				try {
					if (fs.existsSync(oldPath)) fs.renameSync(oldPath, newPath);
					console.log(
						`📦 Moved folder to Error_Claim (Confirm Claim error): ${folder}`,
					);
				} catch (err) {
					console.error(`❌ Error moving folder ${folder}:`, err.message);
				}

				await page.goBack();
				continue;
			}

			await page
				.locator(".o_notebook ul.nav-tabs a", { hasText: /attachements/i })
				.click();
			console.log("✅ Attachments Tab Clicked!");

			// Generate PDF only once
			if (!pdfGenerated) {
				await page
					.getByRole("button", { name: /Generate Onepager PDF/i })
					.click();
				await page.waitForResponse(
					(r) =>
						r.url().includes("/web/dataset/call_button") && r.status() === 200,
					{ timeout: 30000 },
				);
				console.log("✅ Generate Onepager PDF Done!");
				pdfGenerated = true;
			} else {
				console.log("⏭️ Skipping PDF generation (already done).");
			}

			// ✅ Submit Claim - click first, then wait for backend
			await page.getByRole("button", { name: /Submit Claim/i }).click();
			console.log("✅ Submit Claim Clicked!");

			const submitResponse = await page
				.waitForResponse(
					(res) =>
						res.url().includes("/web/dataset/call_button") &&
						res.status() === 200,
					{ timeout: 30000 },
				)
				.catch(() => null);

			await page.waitForTimeout(1000);
			let submitSuccess = true;

			// 🧩 Check if warning modal appears
			const modal = page.locator("div.modal-content");
			if (await modal.count()) {
				const message = (await modal.locator(".modal-body").innerText()).trim();
				console.error(`❌ Submit Claim Warning: "${message}"`);

				const oldPath = path.join(BASE_DIR, folder);
				const newPath = path.join(ERROR_DIR, folder);
				try {
					if (fs.existsSync(oldPath)) fs.renameSync(oldPath, newPath);
					console.log(`📦 Moved folder to Error_Claim: ${folder}`);
				} catch (err) {
					console.error(`❌ Error moving folder ${folder}:`, err.message);
				}

				const okButton = modal.locator('button:has-text("Ok")');
				if (await okButton.count()) await okButton.click();
				console.log("🆗 Modal closed.");
				await page.goBack({ waitUntil: "networkidle" });
				console.log("↩️ Skipping claim due to Odoo warning.");
				submitSuccess = false;
			} else if (!submitResponse) {
				console.warn("⚠️ No backend response after Submit Claim (timeout).");
				submitSuccess = false;
			}

			// ✅ If Submit successful → do API
			if (submitSuccess && !externalPageOpened) {
				console.log("🚀 Submit success — calling ClaimDoc API...");
				const folderPath = path.join(BASE_DIR, folder);
				const apiResult = await uploadClaimDoc(match.claimCode, folderPath);
				if (apiResult) {
					console.log(`✅ ClaimDoc API upload success for ${match.claimCode}`);
				} else {
					console.warn(`⚠️ ClaimDoc API upload failed for ${match.claimCode}`);
					const oldPath = path.join(BASE_DIR, folder);
					const newPath = path.join(ERROR_DIR, folder);
					try {
						if (fs.existsSync(oldPath)) fs.renameSync(oldPath, newPath);
					} catch (err) {
						console.error(`❌ Error moving folder ${folder}:`, err.message);
					}
				}
				externalPageOpened = true;
			}

			// ✅ Upload Attachment
			await page.getByRole("button", { name: /Upload Attachment/i }).click();
			console.log("📤 Upload Attachment Clicked!");
			await page.waitForResponse(
				(r) =>
					r.url().includes("/web/dataset/call_button") && r.status() === 200,
				{ timeout: 30000 },
			);

			console.log("🕓 Waiting for modal popup...");
			const uploadModal = page.locator("div.modal-dialog");
			await uploadModal
				.waitFor({ state: "visible", timeout: 10000 })
				.catch(() => null);

			if (await uploadModal.count()) {
				const message = (
					await uploadModal.locator(".modal-body").innerText()
				).trim();
				if (message.includes("Upload Successfull")) {
					console.log(`✅ Upload Success for Claim ${match.claimCode}`);
				} else {
					console.error(
						`❌ Upload Failed for ${match.claimCode}: "${message}"`,
					);
					const oldPath = path.join(BASE_DIR, folder);
					const newPath = path.join(ERROR_DIR, folder);
					try {
						if (fs.existsSync(oldPath)) fs.renameSync(oldPath, newPath);
						console.log(`📦 Moved folder to Error_Claim: ${folder}`);
					} catch (err) {
						console.error(`❌ Error moving folder ${folder}:`, err.message);
					}
				}
				const okButton = uploadModal.locator('button:has-text("Ok")');
				if (await okButton.count()) await okButton.click();
				console.log("🆗 Modal closed.");
				await page.goBack();
			} else {
				console.warn("⚠️ No modal appeared after upload.");
			}

			await page.waitForTimeout(1500);
		}

		await page.click("input.o_searchview_input", { clickCount: 3 });
		await page.keyboard.press("Backspace");
	}
} catch (err) {
	console.error("❌ Automation error:", err.message);
} finally {
	console.log("🕓 Waiting 5s before closing browser...");
	await page.waitForTimeout(5000);
	await browser.close();
	console.log("👋 Browser closed. Task complete.");
}
