import fs from "node:fs";
import path from "node:path";

export function getFolderList(directoryPath) {
	try {
		const items = fs.readdirSync(directoryPath);

		const folders = items.filter((item) => {
			const itemPath = path.join(directoryPath, item);

			// Only keep directories
			if (!fs.statSync(itemPath).isDirectory()) return false;

			// 🚫 Skip unwanted or system folders
			const skipFolders = ["Failed_Claim", "@Recycle"];
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
