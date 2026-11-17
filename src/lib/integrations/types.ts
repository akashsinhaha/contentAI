export interface InstagramPublisher {
  publish(input: { caption: string; mediaUrl?: string | null }): Promise<{ externalId: string }>;
}
export interface MetaAds {
  launch(input: { name: string; objective: string; audience: string; budget?: number | null; message: string }): Promise<{ externalId: string }>;
  insights(externalId: string): Promise<{ impressions: number; clicks: number }>;
}
export interface WhatsAppClient {
  send(input: { to: string; body: string }): Promise<{ externalId: string }>;
  broadcast(input: { recipients: string[]; body: string }): Promise<{ sent: number }>;
}
