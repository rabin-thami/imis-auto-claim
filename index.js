import {config} from "dotenv";
import {getFolderList} from "./helper/get-folder-list.js";
import {odooLogin} from "./helper/get-session-id.js";
import {getClaimIds} from "./helper/get-claim-ids.js";
import {getClaimDetailsAndUpload} from "./helper/get-claim-details-and-upload.js";
import {moveFolderToRecycle} from "./helper/folder-mover.js";


config({
    quiet: true,
});

// Real progress tracking system
const createProgressTracker = (patientId) => {
    const steps = [
        { emoji: "🔍", text: "Finding claims...", status: "pending" },
        { emoji: "📋", text: "Getting claim details...", status: "pending" },
        { emoji: "✅", text: "Confirming claims...", status: "pending" },
        { emoji: "📄", text: "Generating documents...", status: "pending" },
        { emoji: "🚀", text: "Submitting claims...", status: "pending" },
        { emoji: "📤", text: "Uploading to Odoo...", status: "pending" },
        { emoji: "🌐", text: "Uploading to ClaimDoc...", status: "pending" },
        { emoji: "📁", text: "Organizing folders...", status: "pending" }
    ];

    let currentStep = 0;
    let loadingDots = 0;

    const updateDisplay = () => {
        const step = steps[currentStep];
        const dots = '.'.repeat((loadingDots % 3) + 1);
        process.stdout.write(`\r${step.emoji} ${step.text}${dots} [${currentStep + 1}/${steps.length}]`);
        loadingDots++;
    };

    const interval = setInterval(updateDisplay, 300);

    return {
        nextStep: () => {
            if (currentStep < steps.length - 1) {
                steps[currentStep].status = "completed";
                currentStep++;
                loadingDots = 0;
            }
        },
        setStep: (stepIndex) => {
            if (stepIndex >= 0 && stepIndex < steps.length) {
                currentStep = stepIndex;
                loadingDots = 0;
            }
        },
        complete: (success) => {
            clearInterval(interval);
            if (success) {
                steps.forEach(s => s.status = "completed");
                process.stdout.write(`\r✅ All steps completed successfully!                \n`);
            } else {
                process.stdout.write(`\r❌ Process failed at step ${currentStep + 1}             \n`);
            }
        }
    };
};

(async () => {
    try {
        const folders = await getFolderList(`${process.env.BASE_URL}`);

        // Total patients found
        console.log(`\n👦 ${folders.length} Patient Found`)

        if (folders.length > 0) {
            console.log("\n==== Starting Claim ====")

            // now logging in odoo once (outside the folder loop)
            const logginSession = await odooLogin();
            if (!logginSession.success) {
                console.log("❌ Login failed")
                process.exit(0)
            }


            // Process each folder (folder name = patient ID)
            for (const folder of folders) {
                console.log(`\n🟩 Starting ${folder} Claim`)

                // Start real progress tracking
                const progress = createProgressTracker(folder);

                try {
                    const patientId = folder; // Use folder name as patient ID

                    // Step 1: Finding claims
                    const claimIds = await getClaimIds(logginSession.sessionId, patientId)

                    if (!claimIds.success) {
                        progress.complete(false);
                        console.log(`❌ No claims found for patient ${patientId}`);
                        continue; // Skip to next folder
                    }
                    progress.nextStep(); // Move to next step

                    // Extract claim IDs and claim codes
                    const claimIdArray = claimIds.data.map(claim => claim.id)
                    const claimCodes = claimIds.data.map(claim => claim.claim_code)

                    if (claimIdArray.length > 0) {
                        // Step 2-8: Process claims with real progress
                        const claimDetails = await getClaimDetailsAndUpload(logginSession.sessionId, claimIdArray, claimCodes, patientId, progress)

                        if (claimDetails && claimDetails.success) {
                            progress.complete(true);
                            // Move folder to @Recycle after successful processing
                            moveFolderToRecycle(process.env.BASE_URL, patientId);
                        } else {
                            progress.complete(false);
                        }
                    } else {
                        progress.complete(false);
                        console.log(`⏭️ No claims to process for patient ${patientId}`);
                    }
                } catch (error) {
                    progress.complete(false);
                    console.log(`❌ Error: ${error.message}`);
                }
            }

            console.log("\n==== Process End ====\n\n")


        } else {
            console.log("👦 0 Patient Found")
            process.exit(0)
        }
    } catch (error) {
        console.error("❌ Error:", error);
        console.log("\n==== Process End ====")
    }
})();