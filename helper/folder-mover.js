import fs from "node:fs";
import path from "node:path";

export function moveFolderToError(baseDirectory, folderName) {
	try {
		const sourcePath = path.join(baseDirectory, folderName);
		const errorDirectory = path.join(baseDirectory, "Failed_Claim");
		const destinationPath = path.join(errorDirectory, folderName);

		// Check if source folder exists
		if (!fs.existsSync(sourcePath)) {
			console.log(`❌ Source folder does not exist: ${folderName}`);
			return false;
		}

		// Create Failed_Claim directory if it doesn't exist
		if (!fs.existsSync(errorDirectory)) {
			fs.mkdirSync(errorDirectory, { recursive: true });
			console.log(`📂 Created Failed_Claim directory`);
		}

		// Check if folder already exists in Failed_Claim
		if (fs.existsSync(destinationPath)) {
			console.log(`✅ Folder already exists in Failed_Claim: ${folderName}`);
			return false;
		}

		// Move the folder
		fs.renameSync(sourcePath, destinationPath);
		console.log(`✅ Moved folder to Failed_Claim: ${folderName}`);
		return true;
	} catch (error) {
		console.error(`❌ Error moving folder ${folderName}:`, error.message);
		return false;
	}
}

export function moveFolderToRecycle(baseDirectory, folderName) {
	try {
		const sourcePath = path.join(baseDirectory, folderName);
		const recycleDirectory = path.join(baseDirectory, "@Recycle");
		const destinationPath = path.join(recycleDirectory, folderName);

		// Check if source folder exists
		if (!fs.existsSync(sourcePath)) {
			console.log(`❌ Source folder does not exist: ${folderName}`);
			return false;
		}

		// Create @Recycle directory if it doesn't exist
		if (!fs.existsSync(recycleDirectory)) {
			fs.mkdirSync(recycleDirectory, { recursive: true });
			console.log(`📂 Created @Recycle directory`);
		}

		// Check if folder already exists in @Recycle
		if (fs.existsSync(destinationPath)) {
			console.log(`✅ Folder already exists in @Recycle: ${folderName}`);
			return false;
		}

		// Move the folder
		fs.renameSync(sourcePath, destinationPath);
		console.log(`♻️ Moved folder to @Recycle: ${folderName}`);
		return true;
	} catch (error) {
		console.error(
			`❌ Error moving folder ${folderName} to @Recycle:`,
			error.message,
		);
		return false;
	}
}
