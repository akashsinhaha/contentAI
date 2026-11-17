export interface LLMRequest {
  system: string;
  prompt: string;
  /** Hint to the mock provider about which task is being performed. */
  task?: string;
  json?: boolean;
}
export interface LLMProvider {
  name: string;
  complete(request: LLMRequest): Promise<string>;
}
export interface ImageProvider {
  generate(prompt: string): Promise<string>; // returns URL or data URI
}
export interface VideoProvider {
  generate(prompt: string): Promise<{ script: string; mediaUrl: string }>;
}
