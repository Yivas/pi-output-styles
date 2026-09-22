export type BuiltinStyleId = "default" | "proactive" | "concise" | "explanatory" | "learning";

export interface StyleDefinition {
  id: string;
  name: string;
  description: string;
  keepCodingInstructions: boolean;
  instructions: string;
  source: "builtin" | "file";
}

export interface StyleRegistry {
  list(): readonly StyleDefinition[];
  resolve(id: string): StyleDefinition | undefined;
}
