export type BuiltinStyleId =
  | "default"
  | "proactive"
  | "concise"
  | "explanatory"
  | "learning"
  | "reviewer"
  | "diagrams-first"
  | "ste"
  | "caveman"
  | "eli5";

export interface StyleDefinition {
  id: string;
  name: string;
  description: string;
  keepCodingInstructions: boolean;
  instructions: string;
  source: "builtin" | "file" | "user" | "project";
  filePath?: string;
  turnReminder?: string;
  waitingTurnReminder?: string;
}

export interface StyleRegistry {
  list(): readonly StyleDefinition[];
  resolve(id: string): StyleDefinition | undefined;
}
