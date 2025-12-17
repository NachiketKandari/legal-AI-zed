
import { GoogleGenAI } from "@google/genai";
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
    console.error("GEMINI_API_KEY not found in .env.local");
    process.exit(1);
}

const ai = new GoogleGenAI({ apiKey });

async function listModels() {
    try {
        console.log("Fetching models...");
        // Use the listModels method from the SDK if available, or fetch direct
        // The Node SDK might expose it differently. 
        // Let's try a direct fetch to be sure as the SDK version might vary.

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        if (!response.ok) {
            console.error(`Error: ${response.status} ${response.statusText}`);
            const text = await response.text();
            console.error(text);
            return;
        }

        const data = await response.json();
        console.log("Available Models:");
        if (data.models) {
            data.models.forEach((m: any) => {
                if (m.name.includes('gemini')) {
                    console.log(`- ${m.name} (${m.displayName})`);
                    console.log(`  Methods: ${m.supportedGenerationMethods.join(', ')}`);
                }
            });
        }
    } catch (error) {
        console.error("Error listing models:", error);
    }
}

listModels();
