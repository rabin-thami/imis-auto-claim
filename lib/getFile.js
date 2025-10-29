import fs from "fs";
import path from "path";

/**
 * Returns a list of subfolders inside the given directory.
 * Automatically skips system or unwanted folders:
 * - "Error_Claim"
 * - "@Recycle Bin"
 * - Hidden folders (starting with ".")
 */
export function getFolderList(directoryPath) {
	try {
		const items = fs.readdirSync(directoryPath);

		const folders = items.filter((item) => {
			const itemPath = path.join(directoryPath, item);

			// Only keep directories
			if (!fs.statSync(itemPath).isDirectory()) return false;

			// 🚫 Skip unwanted or system folders
			const skipFolders = ["Error_Claim", "@Recycle Bin"];
			if (skipFolders.includes(item)) return false;

			// 🚫 Skip hidden folders (like .git, .Trash, etc.)
			if (item.startsWith(".")) return false;

			return true;
		});

		return folders;
	} catch (error) {
		console.error("Error reading directory:", error.message);
		return [];
	}
}
