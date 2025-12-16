# Neuro-Symbolic Legal Intake AI

A React-based Proof of Concept (POC) demonstrating a **Neuro-Symbolic Architecture** for legal case intake. This system combines the flexibility of Large Language Models (Gemini Flash Lite) with the strict rule adherence of symbolic logic (TypeScript interfaces & State Machines).

<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

## 🚀 Key Features

*   **Neuro-Symbolic Core**: Decouples "Conversation" (Neural) from "Logic" (Symbolic logic/State Machine).
*   **Real-time State Visualizer**: Watch the AI "fill out the form" in real-time as you chat.
*   **Supervisor Audit Loop**: A "Slow Thinking" model (Gemini Pro) runs in the background to audit the chat and correct data errors (e.g., converting relative dates to absolute ones).
*   **Strict SOP Adherence**: The AI cannot hallucinate the process; it is constrained by a deterministic Finite State Machine (SOP).
*   **Type-Safe Extraction**: enforces strict TypeScript interfaces (`ContactVector`, `IncidentVector`, etc.) for all data extraction.

## 🛠️ Architecture

The system operates on a dual-process theory (System 1 vs System 2):

1.  **Fast Model (System 1 - Gemini Flash Lite)**: Handles the immediate conversation and raw text extraction. It is fast but prone to minor logic errors.
2.  **Symbolic Logic (The "Ontology")**: A TypeScript state machine that holds the "Truth". It calculates exactly what data is missing from the `CaseFile`.
3.  **Slow Model (System 2 - Gemini Pro)**: A Supervisor Agent that wakes up every 5 turns to review the case file, fix complex errors, and flagging inconsistencies.

```mermaid
graph TD
    User[User] <--> UI[Chat Interface]
    UI --> FastModel[Fast Model (Gemini Flash Lite)]
    FastModel --> |Extracts Data| CaseFile[Case File (State)]
    CaseFile --> |SOP Status| Logic[Symbolic Logic (SOP)]
    Logic --> |Next Question| FastModel
    CaseFile -.-> |Audit Trigger| SlowModel[Supervisor Agent (Gemini Pro)]
    SlowModel -.-> |Corrections| CaseFile
```

## 📦 Run Locally

**Prerequisites:** Node.js (v18+)

1.  **Clone the repository**:
    ```bash
    git clone <repository_url>
    cd legalintake-ai
    ```

2.  **Install dependencies**:
    ```bash
    npm install
    ```

3.  **Configure Environment**:
    Create a `.env.local` file in the root directory:
    ```env
    GEMINI_API_KEY=your_google_gemini_api_key
    ```

4.  **Run Development Server**:
    ```bash
    npm run dev
    ```

## ⚠️ Deployment & Security

**IMPORTANT UPDATE ON VERCEL DEPLOYMENT:**

This project is a **Client-Side POC**. It uses the Gemini API directly from the browser for demonstration purposes.

*   **Security Risk**: The `GEMINI_API_KEY` is embedded in the build. If you deploy this to a public URL (like Vercel) without protection, **your API key will be exposed to the public**.
*   **Recommendation**:
    *   **Private Demo**: You can deploy to Vercel ONLY if you use Password Protection (Vercel Pro) or strict API Key restrictions in Google Cloud Console (restrict to specific HTTP Referrers).
    *   **Production**: You must move the `services/geminiService.ts` logic to a backend API (Next.js API Routes, Express, or Edge Functions) to hide the API key.

## 📄 Documentation

See [report.md](./report.md) for a deep dive into the technical implementation and architectural decisions.
