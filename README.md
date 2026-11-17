# Business Assistant

Two AI assistants for small businesses (home bakers, boutiques, salons, consultants, local services), with you approving everything public.

- **Marketing Assistant**: Instagram posts, captions, product images, UGC-style video scripts, monthly content calendar, scheduling and publishing, Meta ad campaigns, WhatsApp marketing campaigns.
- **Customer Assistant**: replies to WhatsApp and Instagram enquiries, answers calls when you are busy, follows up with leads and keeps conversations organised.
- **Chat**: talk to either assistant on the home page ("Plan a Diwali campaign", "How did last week's posts perform?", "Show open leads").

## Run it

```bash
npm install
npm run setup      # creates the SQLite database and a demo business
npm run dev        # http://localhost:3000
npm test           # approval gate, scheduler, replies, follow-ups, calls, providers
```

It works out of the box with **mock** AI and **mock** integrations (no keys). Nothing is actually posted or sent anywhere in mock mode.

## You stay in control

- Every post, ad campaign and WhatsApp broadcast becomes an item in **Approvals**. Only `decideAction()` in `src/lib/approval.ts` can make it go live, and you can edit the text first.
- The scheduler only publishes content you already approved. WhatsApp broadcasts go only to contacts marked opted-in.
- The Customer Assistant replies on its own only if you leave auto-reply on. Messages containing your escalation words (refund, complaint, ...) are handed to you instead.
- Lead follow-ups wait in Approvals unless you switch on "send follow-ups without asking" in Settings.
- Brand voice, do/don't rules and products are yours to edit under **Brand**. They are included in every AI request.

## Switching to real services

Edit `.env` (copy from `.env.example`).

| Setting | Values |
| --- | --- |
| `AI_PROVIDER` | `mock`, `anthropic` (needs `ANTHROPIC_API_KEY`), `openai` (needs `OPENAI_API_KEY`, also gives image generation) |
| `INTEGRATIONS_MODE` | `mock` or `real` |

Real mode needs:

- **Instagram publishing / DMs and WhatsApp**: a Meta developer app, a business Instagram account, and the WhatsApp Cloud API. Set `META_ACCESS_TOKEN`, `INSTAGRAM_BUSINESS_ID`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, and point Meta webhooks at `/api/webhooks/whatsapp` and `/api/webhooks/instagram` with your `WEBHOOK_VERIFY_TOKEN`. Instagram needs a **public image URL**, so store generated images somewhere public.
- **Meta ads**: `src/lib/integrations/real.ts` has the adapter but the campaign/ad set/creative calls are not written yet. Needs `META_AD_ACCOUNT_ID` and Meta app review.
- **Voice calls**: the Calls page is a text simulator that uses the same logic as a real call would (`handleCall` in `src/lib/customer.ts`). Connect a telephony or voice-AI provider (for example Twilio) that forwards the caller's speech text to it.
- **Video**: only a script and storyboard are generated. Plug a video-generation vendor into `getVideoProvider()` in `src/lib/ai/index.ts`.

## Security settings (set these before putting it online)

- `OWNER_PASSWORD`: turns on the owner login. Without it the app is open in development and **locked** in production.
- `META_APP_SECRET`: webhooks must carry a valid `X-Hub-Signature-256`. In real mode, webhooks are refused until it is set.
- `CRON_SECRET`: needed to call `POST /api/cron` from an external scheduler (`Authorization: Bearer <secret>`). The endpoint is disabled in production without it.
- Website learning refuses localhost, private and cloud-metadata addresses, including names that resolve to them. A determined attacker could still change DNS between the check and the fetch, so keep the login on.

## Before using it with real customers
- WhatsApp rules: marketing messages need pre-approved templates and customer opt-in; free text works only inside the 24-hour customer-service window.
- Scheduled jobs run through `node-cron` inside the server process (`src/instrumentation.ts`). On serverless hosting call `POST /api/cron` from an external scheduler instead.

## Layout

```
src/lib/ai/            LLM, image, video providers (mock, anthropic, openai)
src/lib/integrations/  Instagram, Meta Ads, WhatsApp adapters (mock, real)
src/lib/approval.ts    the approval gate
src/lib/content.ts     posts, images, UGC video, calendar, publishing
src/lib/campaigns.ts   Meta ad and WhatsApp campaigns
src/lib/customer.ts    inbox replies, leads, follow-ups, calls
src/lib/agents/chat.ts chat for both assistants
src/app/               pages and webhooks
```
