import Fastify from 'fastify';
import WebSocket from 'ws';
import dotenv from 'dotenv';
import fastifyFormBody from '@fastify/formbody';
import fastifyWs from '@fastify/websocket';
import { performance } from 'perf_hooks';
import client from 'prom-client';

// Load environment variables from .env file
dotenv.config();

// Retrieve the OpenAI API key from environment variables. You must have OpenAI Realtime API access.
const { OPENAI_API_KEY } = process.env;
if (!OPENAI_API_KEY) {
  console.error('Missing OpenAI API key. Please set it in the .env file.');
  process.exit(1);
}

// Initialize Fastify
const fastify = Fastify();
fastify.register(fastifyFormBody);
fastify.register(fastifyWs);

// =====================
// Constants
// =====================

// Clean, readable markdown prompt for Roberto (no Tools section)
const ROBERTO_PROMPT = `
# Role & Objective
You are **Roberto**, the warm and attentive **virtual host for Veeno Leicester**.  
Your objective is to provide a seamless booking experience by **collecting and confirming booking details**, answering common questions using the **Knowledge Base**, and ensuring callers feel cared for.  
**Success** means the guest’s details are captured clearly, they get accurate answers, or they are smoothly transferred to a human when required.

---

# Personality & Tone
- Warm, conversational, personable, and confidence-building.  
- Adapt to caller style: simplify if uncertain, match detail if specific.  
- Supportive and never impatient — politely re-ask missing details once.  
- Always close with clarity so the guest knows what happens next.

---

# Context
Use this Knowledge Base to answer caller questions. If the information requested is not here, or the situation requires escalation, use the **transferToNumber** tool.

## Venue
- **Name:** Veeno Leicester (Agent for Veeno Bars).  
- **Address:** 9 St Martins, Leicester LE1 5DE.  
- **Timezone:** Europe/London (GMT/BST).  
- **Accessibility:** Wheelchair accessible; disabled toilet available.  
- **Pet Policy:** Dog friendly.

## Opening Hours
- **Sunday–Thursday:** 12:00 – 21:00.  
- **Friday–Saturday:** 12:00 – 23:00.

## Parking (short walk; subject to change)
- **St Margaret’s Pastures:** ~136 spaces, ~£2 for 2h, up to £9 for 12h. Cash/card/contactless.  
- **Newarke Street Multi-Storey:** 470 spaces. 1h £2.50; 3h £5; up to 12h £15. Disabled bays + EV charging.  
- **Mansfield Street Lot:** ~9-min walk. 2h £3.20; 12h up to £8; 24h £10.  
- **St James Street:** Small, ~15 spaces. 2h £1.80; 4h £3.80; 24h £8.

## Menu (Italian inspired)
- **Overview:** Sharing boards, bruschette, pasta, pizza, salads, desserts, cocktails, Italian wines.  
- **Wine:** Family-produced in Sicily (Caruso & Minini). Varieties include Nero d’Avola, Grillo, Zibibbo.  
- **Suppliers:** Artisanal and family-run producers, high quality and authentic.

### Dietary & Allergens
- **Vegetarian (v):** Clearly marked (e.g., Margherita pizza, parmigiana, tiramisù).  
- **Vegan (vg):** Options include olives, breads, caponata, penne all’arrabbiata, salads.  
- **Gluten-Free:** GF bread/bruschetta and pizza bases available. No GF pasta. Cross-contamination risk — advise guests to notify staff.  
- **Customisation:** Some flexibility (e.g., removing cheese), substitutions limited.

### Sample / Guide Prices
*(Give as guidance, clarify they may vary)*  
- **Light Bites:** Olives ~£3.50; breads ~£4.50; dips ~£2.00.  
- **Piattini:** Arancina al ragù ~£5.50; Italian Nachos ~£9.50; Parmigiana di melanzane (v) ~£6.00; Caponata (vg) ~£6.00.  
- **Pasta:** Arrabbiata (vg) ~£11.00; Lasagne alla bolognese ~£13.00; Tagliatelle al ragù ~£14.00; Tagliatelle ai funghi (v) ~£15.00; Ravioli nduja e pecorino ~£14.00.  
- **Pizza:** Margherita (v) ~£9.00; Vegetariana (v) ~£12.00; Quattro formaggi (v) ~£14.00; Diavola ~£14.00; Parma e Bufala ~£15.00.  
- **Boards:** Piccolino (1) ~£20.00; Grande (2) ~£35.00; Grandissimo (4+) ~£65.00.  
- **Salads & Sides:** Insalata della Mamma (vg) ~£8.00; Caprese (v) ~£12.00; sides ~£3–£3.50.  
- **Desserts:** Chocolate Fondant ~£6.50; Cannoli ~£7.00; Tiramisù ~£6.50; Torta al limone ~£7.50; Affogato ~£6.00.  
- **Lunch Set Menu (Mon–Fri):** Panino + drink ~£9.50; One course + drink ~£12.95.  
- **Drinks & Experiences:** Cocktails (Aperol Spritz, Negroni, Espresso Martini, etc.), mocktails, beers, Italian wines.

## Offers
- **Aperitivo:** Buy any bottle of wine → complimentary sharing board (16:00–18:00 daily).  
- **Two-for-One (Mon–Thu):** 2-for-1 on food (2 starters, 2 mains, or 2 desserts; min. 2 courses).

## Experiences (always escalate)
- Wine tastings, “Trip to Sicily,” fine Italian wine tasting, Pizza & Fizz, Afternoon Tea (£22.50–£55 pp).  
- **Christmas Menu/Offer:**  
  - Up to 12 guests: 3-course set menu £30 incl. Christmas Cocktail.  
  - More than 12: Groups menu — platters, pizza/pasta buffet.

## Raffle & Charity Requests
- Policy is to decline kindly:  
  > “Ciao, thank you for contacting Veeno about your charity event. We receive many requests and, in fairness, must say no, even if it’s a great cause. We wish you the best of luck with your efforts.”

---

# Reference Pronunciations
- **Veeno** → *Vee-noh*  
- **Nero d’Avola** → *Neh-roh DAH-voh-lah*  
- **Zibibbo** → *Tzee-beeb-boh*  
- **Parmigiano** → *Par-mee-JAH-noh*  
- **Caponata** → *Kah-poh-NAH-tah*  
- **Stracchino** → *Stra-KEE-noh*  
- **Focaccia** → *Foh-KAH-cha*  

---

# Tools
### transferToNumber
- **Purpose:** Escalates caller to a human team member.  
- **When to use:**  
  - Caller mentions existing booking (change, cancel, late arrival).  
  - Caller requests voucher, gift card, or special experience.  
  - Caller wants private hire, corporate/bespoke booking, or >12 guests.  
  - Caller is frustrated, upset, confused, or asks for staff/manager.  
  - Caller enquires about lost property, delivery, or urgent matter.  
  - Caller refuses to provide required booking details.  
  - Caller asks about a menu item or topic not covered in Knowledge Base.  
- **Reassurance before transfer:**  
  - “I’ll connect you to a team member who can finalise that for you.”  
  - “That’s best handled by our team — I’ll connect you now.”  

---

# Instructions / Rules
- Always follow **step-by-step booking flow**: ask in order → name → date → time → guests → email → phone → dietary → notes.  
- Confirm absolute dates in **Europe/London** timezone.  
- Use **24-hour time**.  
- Repeat back **email and phone digits** exactly as provided (do not validate format).  
- Give **guide prices** as estimates (may vary).  
- Never invent information not in Knowledge Base. If asked about unlisted items, explain politely and offer transfer.  
- Stay within **Veeno Leicester** context only.  
- Be polite and calm, even if caller is testing or difficult.

---

# Conversation Flow
### Entry
- Greet warmly: “Hello, this is Roberto at Veeno Leicester. How can I help today?”  
- Detect intent: **booking** vs. **general enquiry**.

### Booking (Table Path)
- Collect details following booking flow.  
- If guests >12 → **transfer**.  
- If caller asks for an **experience** → acknowledge once, then **transfer**.  
- Finish with full **read-back of details** and reassure:  
  - “Thank you, I’ve noted your booking details. Our team will send you a confirmation email shortly.”

### Knowledge Base Path
- Answer directly about address, hours, parking, dietary, menu, offers.  
- Provide guide prices if asked.  
- If caller asks about experiences, vouchers, group bookings, or anything not in KB → **transfer**.

### Exit
- If booking: reassure confirmation will be emailed.  
- If enquiry: polite closure.  
- If transfer: short reassurance + handoff.

---

# Safety & Escalation
- **Immediate transfer** if caller is upset, urgent, unclear, or asks for manager/staff.  
- “‘Unclear’ means caller intent cannot be determined after one polite clarification attempt.”  
- Escalate if caller asks about: vouchers, gift cards, experiences, >12 guests, lost property, corporate/private hire, charity/raffle exceptions, business or delivery.  
- **Do not speculate** — transfer if uncertain.  
- Always reassure before transfer.
`;

const VOICE = 'alloy';
const TEMPERATURE = 0.8; // Controls the randomness of the AI's responses
const PORT = process.env.PORT || 5050; // Allow dynamic port assignment

// List of Event Types to log to the console. See the OpenAI Realtime API Documentation
const LOG_EVENT_TYPES = [
  'error',
  'response.content.done',
  'rate_limits.updated',
  'response.done',
  'input_audio_buffer.committed',
  'input_audio_buffer.speech_stopped',
  'input_audio_buffer.speech_started',
  'session.created',
  'session.updated',
];

// =====================
// Prometheus metrics setup
// =====================
const register = new client.Registry();
client.collectDefaultMetrics({ register });

const hOpenAITTFB = new client.Histogram({
  name: 'openai_ttfb_ms',
  help: 'Time from OpenAI server VAD speech_stopped → first audio delta',
  buckets: [50, 100, 200, 300, 500, 800, 1200, 2000, 3000, 5000],
});
const hE2EReply = new client.Histogram({
  name: 'e2e_reply_latency_ms',
  help: 'speech_stopped → first audio chunk sent back to Twilio',
  buckets: [50, 100, 200, 300, 500, 800, 1200, 2000, 3000, 5000],
});
const hRespStream = new client.Histogram({
  name: 'response_stream_duration_ms',
  help: 'first audio delta → response.done',
  buckets: [100, 300, 600, 1000, 2000, 4000, 8000],
});
const hWSRttOpenAI = new client.Histogram({
  name: 'ws_rtt_openai_ms',
  help: 'WebSocket RTT to OpenAI',
  buckets: [10, 20, 50, 100, 200, 400, 800, 1600],
});
const hWSRttTwilio = new client.Histogram({
  name: 'ws_rtt_twilio_ms',
  help: 'WebSocket RTT to Twilio',
  buckets: [10, 20, 50, 100, 200, 400, 800, 1600],
});
const cBytesIn = new client.Counter({
  name: 'twilio_audio_bytes_in_total',
  help: 'Bytes received from Twilio (decoded ~ base64_len*0.75)',
});
const cBytesOut = new client.Counter({
  name: 'twilio_audio_bytes_out_total',
  help: 'Bytes sent to Twilio (decoded ~ base64_len*0.75)',
});

// Felt (user-perceived) latency: user stops speaking → Twilio has audio buffered to play
const hFeltLatency = new client.Histogram({
  name: 'felt_latency_ms',
  help: 'User perceived latency: user stop speaking → audio buffered at Twilio edge',
  buckets: [100, 200, 300, 500, 800, 1200, 2000, 3000, 5000],
});

register.registerMetric(hOpenAITTFB);
register.registerMetric(hE2EReply);
register.registerMetric(hRespStream);
register.registerMetric(hWSRttOpenAI);
register.registerMetric(hWSRttTwilio);
register.registerMetric(cBytesIn);
register.registerMetric(cBytesOut);
register.registerMetric(hFeltLatency);

// =====================
// Routes
// =====================
fastify.get('/', async (request, reply) => {
  reply.send({ message: 'Twilio Media Stream Server is running!' });
});

// Prometheus metrics endpoint
fastify.get('/metrics', async (req, reply) => {
  reply.type(register.contentType).send(await register.metrics());
});

// Route for Twilio to handle incoming and outgoing calls
// <Say> punctuation to improve text-to-speech translation
fastify.all('/incoming-call', async (request, reply) => {
  const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Google.en-GB-Standard-A">Hello, you are through to Roberto at Veeno Bars Leicester.</Say>
  <Pause length="1"/>
  <Connect>
    <Stream url="wss://${request.headers.host}/media-stream" />
  </Connect>
</Response>`;

  reply.type('text/xml').send(twimlResponse);
});

// =====================
// Helpers
// =====================
function pretty(obj) {
  return JSON.stringify(obj, null, 2);
}

function attachRttMeter(ws, observeFn, intervalMs = 5000) {
  let lastPingAt = null;
  const timer = setInterval(() => {
    lastPingAt = performance.now();
    try { ws.ping(); } catch {}
  }, intervalMs);

  ws.on('pong', () => {
    if (lastPingAt) observeFn(performance.now() - lastPingAt);
  });
  ws.on('close', () => clearInterval(timer));
}

// =====================
// WebSocket route for media-stream
// =====================
fastify.register(async (fastify) => {
  fastify.get('/media-stream', { websocket: true }, (connection, req) => {
    console.log('Client connected');

    const openAiWs = new WebSocket(
      `wss://api.openai.com/v1/realtime?model=gpt-realtime&temperature=${TEMPERATURE}`,
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
      }
    );

    let streamSid = null;
    let currentTurn = null; // { speechStoppedAt, firstDeltaAt, firstDeltaSentAt, lastDeltaAt, userStopAt, turnId }
    let turnCounter = 0;
    let firstAudioMark = null; // { name, sentAt }

    // Align Twilio's stream-relative timestamps to server wall clock
    let streamStartAt = null; // performance.now() at 'start' event
    let lastUserPacketTs = 0; // Twilio media.timestamp (ms since stream start)

    const sendSessionUpdate = () => {
      const sessionUpdate = {
        type: 'session.update',
        session: {
          type: 'realtime',
          model: 'gpt-realtime',
          output_modalities: ['audio'],
          audio: {
            input: { format: { type: 'audio/pcmu' }, turn_detection: { type: 'server_vad' } },
            output: { format: { type: 'audio/pcmu' }, voice: VOICE },
          },
          // Embed Roberto instructions
          instructions: ROBERTO_PROMPT,
        },
      };
      console.log('Sending session update:', JSON.stringify(sessionUpdate));
      openAiWs.send(JSON.stringify(sessionUpdate));
    };

    // Open event for OpenAI WebSocket
    openAiWs.on('open', () => {
      console.log('Connected to the OpenAI Realtime API');
      attachRttMeter(openAiWs, (rtt) => hWSRttOpenAI.observe(rtt));
      setTimeout(sendSessionUpdate, 250); // Ensure connection stability
    });

    // Listen for messages from the OpenAI WebSocket (and send to Twilio if necessary)
    openAiWs.on('message', (data) => {
      const now = performance.now();
      try {
        const response = JSON.parse(data);

        if (LOG_EVENT_TYPES.includes(response.type)) {
          console.log(`Received event: ${response.type}`, response);
        }
        if (response.type === 'session.updated') {
          console.log('Session updated successfully:', response);
        }

        // Track VAD stop as turn boundary (and compute user stop wall-clock if we can)
        if (response.type === 'input_audio_buffer.speech_stopped') {
          currentTurn = {
            speechStoppedAt: now,
            firstDeltaAt: null,
            firstDeltaSentAt: null,
            lastDeltaAt: null,
            userStopAt: null,
            turnId: ++turnCounter,
          };
          if (streamStartAt !== null && lastUserPacketTs !== null) {
            currentTurn.userStopAt = streamStartAt + lastUserPacketTs; // align Twilio stream time → wall clock
          }
        }

        if (response.type === 'response.output_audio.delta' && response.delta) {
          // First audio delta from OpenAI → TTFB
          if (currentTurn && !currentTurn.firstDeltaAt) {
            currentTurn.firstDeltaAt = now;
            hOpenAITTFB.observe(currentTurn.firstDeltaAt - currentTurn.speechStoppedAt);
          }
          currentTurn && (currentTurn.lastDeltaAt = now);

          // Forward to Twilio (response.delta is already base64)
          const audioDelta = {
            event: 'media',
            streamSid: streamSid,
            media: { payload: response.delta },
          };
          connection.send(JSON.stringify(audioDelta));

          // Count bytes out (approx)
          cBytesOut.inc(Math.floor(response.delta.length * 0.75));

          // First chunk sent back → observe e2e; also send a Twilio 'mark' to time playback-at-edge
          if (currentTurn && !currentTurn.firstDeltaSentAt) {
            currentTurn.firstDeltaSentAt = performance.now();
            hE2EReply.observe(currentTurn.firstDeltaSentAt - currentTurn.speechStoppedAt);

            const name = `first-audio-${Date.now()}`;
            firstAudioMark = { name, sentAt: performance.now() };
            connection.send(JSON.stringify({ event: 'mark', streamSid, mark: { name } }));
          }
        }

        if (response.type === 'response.done') {
          if (currentTurn?.firstDeltaAt && currentTurn?.lastDeltaAt) {
            hRespStream.observe(currentTurn.lastDeltaAt - currentTurn.firstDeltaAt);
          }
          currentTurn = null;
        }
      } catch (error) {
        console.error('Error processing OpenAI message:', error, 'Raw message:', data);
      }
    });

    // Handle incoming messages from Twilio
    connection.on('message', (message) => {
      try {
        const data = JSON.parse(message);
        switch (data.event) {
          case 'media':
            if (openAiWs.readyState === WebSocket.OPEN) {
              const b64 = data.media?.payload || '';
              // Count bytes in (approx)
              cBytesIn.inc(Math.floor(b64.length * 0.75));

              // Track Twilio's notion of elapsed time since stream start (ms)
              const ts = Number(data.media?.timestamp);
              if (!Number.isNaN(ts)) {
                lastUserPacketTs = ts;
              }

              const audioAppend = {
                type: 'input_audio_buffer.append',
                audio: b64,
              };
              openAiWs.send(JSON.stringify(audioAppend));
            }
            break;

          case 'start':
            streamSid = data.start.streamSid;
            streamStartAt = performance.now();
            lastUserPacketTs = 0;
            console.log('Incoming stream has started', streamSid);
            attachRttMeter(connection, (rtt) => hWSRttTwilio.observe(rtt));
            break;

          case 'mark':
            // Twilio echoes our mark when audio is buffered/played at its edge
            if (firstAudioMark && data.mark?.name === firstAudioMark.name) {
              const markEchoAt = performance.now();

              let felt = null;
              if (currentTurn?.userStopAt) {
                felt = markEchoAt - currentTurn.userStopAt;
                hFeltLatency.observe(felt);
              } else if (currentTurn?.speechStoppedAt) {
                const fallback = markEchoAt - currentTurn.speechStoppedAt;
                felt = fallback;
                hFeltLatency.observe(fallback);
              }

              // Compute TTFB and E2E if available
              const ttfb = (currentTurn?.firstDeltaAt && currentTurn?.speechStoppedAt)
                ? currentTurn.firstDeltaAt - currentTurn.speechStoppedAt
                : null;
              const e2e = (currentTurn?.firstDeltaSentAt && currentTurn?.speechStoppedAt)
                ? currentTurn.firstDeltaSentAt - currentTurn.speechStoppedAt
                : null;

              const summary = {
                turn: currentTurn?.turnId ?? null,
                streamSid,
                felt_latency_ms: felt !== null ? Math.round(felt) : null,
                ttfb_ms: ttfb !== null ? Math.round(ttfb) : null,
                e2e_first_byte_ms: e2e !== null ? Math.round(e2e) : null,
              };
              console.log('TURN SUMMARY:', pretty(summary));

              firstAudioMark = null;
            }
            break;

          default:
            console.log('Received non-media event:', data.event);
            break;
        }
      } catch (error) {
        console.error('Error parsing message:', error, 'Message:', message);
      }
    });

    // Handle connection close
    connection.on('close', () => {
      if (openAiWs.readyState === WebSocket.OPEN) openAiWs.close();
      console.log('Client disconnected.');
    });

    // Handle WebSocket close and errors
    openAiWs.on('close', () => {
      console.log('Disconnected from the OpenAI Realtime API');
    });
    openAiWs.on('error', (error) => {
      console.error('Error in the OpenAI WebSocket:', error);
    });
  });
});

// =====================
// Start server
// =====================
fastify.listen({ port: PORT }, (err) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`Server is listening on port ${PORT}`);
});
