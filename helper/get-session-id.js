import axios from "axios";
import { config } from "dotenv";

config({
	quiet: true,
});

export const odooLogin = async () => {
	try {
		const loginUrl = `${process.env.ODOO_URL}/web/login`;

		// Step 1: Get CSRF token from the login page
		// console.log("🔍 Getting CSRF token...");
		const csrfResponse = await axios.get(loginUrl, {
			headers: {
				"User-Agent":
					"Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:144.0) Gecko/20100101 Firefox/144.0",
				Accept:
					"text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
				"Accept-Language": "en-US,en;q=0.5",
				"Accept-Encoding": "gzip, deflate, br",
				Connection: "keep-alive",
			},
			timeout: 10000,
		});

		// Extract CSRF token from HTML
		let csrfToken = "";
		const csrfMatch = csrfResponse.data.match(
			/csrf_token.*?value=['"]([^'"]+)['"]/,
		);
		if (csrfMatch) {
			csrfToken = csrfMatch[1];
		} else {
			// Try alternative pattern
			const altMatch = csrfResponse.data.match(
				/name="csrf_token"[^>]*value=['"]([^'"]+)['"]/,
			);
			if (altMatch) {
				csrfToken = altMatch[1];
			}
		}

		if (!csrfToken) {
			return {
				success: false,
				sessionId: null,
				status: 0,
				error: "Could not extract CSRF token",
			};
		}

		// console.log("✅ CSRF token extracted successfully");

		// Extract cookies from the CSRF response
		const setCookieHeader = csrfResponse.headers["set-cookie"];
		let initialCookies = "";
		if (setCookieHeader && setCookieHeader.length > 0) {
			initialCookies = setCookieHeader
				.map((cookie) => cookie.split(";")[0])
				.join("; ");
		}

		// Step 2: Login with fresh CSRF token
		const url = `${process.env.ODOO_URL}/web/login`;

		// body: application/x-www-form-urlencoded
		const body = new URLSearchParams({
			csrf_token: csrfToken,
			login: `${process.env.ODOO_USERNAME}`,
			password: `${process.env.ODOO_PASSWORD}`,
			redirect: "",
		}).toString();

		const res = await axios.post(url, body, {
			// axios automatically sets Content-Length
			headers: {
				"User-Agent":
					"Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:144.0) Gecko/20100101 Firefox/144.0",
				Accept:
					"text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
				"Accept-Language": "en-US,en;q=0.5",
				"Accept-Encoding": "gzip, deflate, br",
				"Content-Type": "application/x-www-form-urlencoded",
				Origin: process.env.ODOO_URL,
				Connection: "keep-alive",
				Referer: `${process.env.ODOO_URL}/web/login`,
				"Upgrade-Insecure-Requests": "1",
				Cookie: initialCookies,
			},
			// keep cookies allowed (useful if the server sets cookies in response)
			withCredentials: true,
			// timeout (optional)
			timeout: 10000,
			// let axios handle decompression automatically
			decompress: true,
		});

		// console.log("HTTP", res.status, res.statusText);

		// Extract session_id from the set-cookie header
		const loginSetCookieHeader = res.headers["set-cookie"];
		let sessionId = null;

		if (loginSetCookieHeader && loginSetCookieHeader.length > 0) {
			// Extract session_id from the cookie string
			const cookieString = loginSetCookieHeader[0];
			const match = cookieString.match(/session_id=([^;]+)/);
			if (match) {
				sessionId = `session_id=${match[1]}`;
				// console.log("✅ Session ID extracted:", sessionId);
			}
		}

		if (!sessionId) {
			return {
				success: false,
				sessionId: null,
				status: res.status,
			};
		}

		// Check if login was successful (status 200 and redirected away from login page)
		const loginSuccess =
			res.status === 200 && !res.request.res.responseUrl?.includes("/login");

		return {
			success: loginSuccess,
			sessionId: sessionId,
			status: res.status,
			statusText: res.statusText,
		};
	} catch (_err) {
		return null;
	}
};
