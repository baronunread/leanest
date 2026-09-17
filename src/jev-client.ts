import { config } from "dotenv";

config({ quiet: true });

export const API_KEY = process.env.TYPESAFE_API_KEY ?? "";
export const API_BASE = process.env.TYPESAFE_API_BASE ?? "https://api.typesafe.ai/v1";
export const MODEL = process.env.TYPESAFE_MODEL ?? "jev-latest";

export interface JevQuestion {
  type: "noul" | "choice" | "score";
  instructions: string | object;
  criteria?: object;
}

export interface JevState {
  changedFiles: string[];
  diff: string;
  base: string;
  head: string;
  tests?: Array<{
    id: string;
    path: string;
    suite: string[];
    name: string;
    source: string;
  }>;
}

export interface JevResponse {
  answers: Record<string, { noul?: number; choice?: string; score?: number; confidence?: number }>;
  model?: string;
}

export class JevClient {
  private apiKey: string;
  private baseUrl: string;
  private model: string;

  constructor(apiKey?: string, baseUrl?: string, model?: string) {
    this.apiKey = apiKey ?? API_KEY;
    this.baseUrl = baseUrl ?? API_BASE;
    this.model = model ?? MODEL;
  }

  get hasApiKey(): boolean {
    return this.apiKey.length > 0;
  }

  async evaluate(state: JevState, questions: Record<string, JevQuestion>): Promise<JevResponse> {
    if (!this.hasApiKey) {
      throw new Error("TYPESAFE_API_KEY is not set. Export it or create a .env file.");
    }

    const body = {
      state,
      questions,
      model: this.model,
    };

    const response = await fetch(`${this.baseUrl}/systemone`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`TypeSafe API error (${response.status}): ${text}`);
    }

    // SAFETY: TypeSafe /v1/systemone always returns a JSON response matching JevResponse shape
    const data = (await response.json()) as JevResponse;
    return data;
  }
}
