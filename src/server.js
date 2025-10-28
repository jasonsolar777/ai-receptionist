require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const twilio = require("twilio");
const { OpenAI } = require("openai");

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// super simple per-call memory (fine for pilots)
const memory = new Map();

const SYSTEM_PROMPT = `
You are a calm, friendly, concise AI receptionist for ${process.env.BUSINESS_NAME || "the business"}.
Goals: answer FAQs, qualify callers, capture name/number, and book or route correctly.
Keep replies under 2 sentences. If caller asks to book, confirm preference and say you'll text a link.
If emergency or out-of-scope, offer to take a message and escalate to a human.
`;

function sayAndGather(reply, action = "/gather") {
  const vr = new twilio.twiml.VoiceResponse();
  if (reply) vr.say({ voice: "Polly.Joanna" }, reply);
  const g = vr.gather({
    input: "speech",
    language: "en-US",
    speechTimeout: "auto",
    action,
    profanityFilter: true
  });
  g.say({ voice: "Polly.Joanna" }, "I'm listening.");
  return vr.toString();
}

// health check
app.get("/", (_req, res) => res.send("AI Receptionist up"));

app.post("/voice", (req, res) => {
  const callSid = req.body.CallSid;
  memory.set(callSid, []);
  const greet = `Thanks for calling ${process.env.BUSINESS_NAME || "our office"}. How can I help today?`;
  res.type("text/xml").send(sayAndGather(greet));
});

app.post("/gather", async (req, res) => {
  const callSid = req.body.CallSid;
  const from = req.body.From;
  const to = req.body.To;
  const userText = (req.body.SpeechResult || "").trim();

  if (!userText) {
    return res.type("text/xml").send(
      sayAndGather("Sorry, I didn't catch that. Could you say it again in a short sentence?")
    );
  }

  const convo = memory.get(callSid) || [];
  convo.push({ role: "user", content: userText });

  let assistantReply = "Could you restate that a bit more simply?";
  try {
    const messages = [{ role: "system", content: SYSTEM_PROMPT }, ...convo];
    const out = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      messages
    });
    assistantReply = out.choices?.[0]?.message?.content?.trim() || assistantReply;
  } catch (e) {
    assistantReply = "I hit a hiccup. Could you repeat that once more?";
  }

  // basic booking intent + SMS booking link
  const wantsBooking = /book|schedule|appointment|reserve|come in/i.test(userText);
  if (wantsBooking && process.env.BOOKING_LINK) {
    try {
      const sms = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
      await sms.messages.create({
        to: from,
        from: to,
        body: `Here’s the booking link for ${process.env.BUSINESS_NAME || "our office"}: ${process.env.BOOKING_LINK}`
      });
      assistantReply += " I’ve texted you our booking link. What day works best for you?";
    } catch (_) {}
  }

  convo.push({ role: "assistant", content: assistantReply });
  memory.set(callSid, convo);

  res.type("text/xml").send(sayAndGather(assistantReply));
});

app.post("/goodbye", (_req, res) => {
  const vr = new twilio.twiml.VoiceResponse();
  vr.say({ voice: "Polly.Joanna" }, "Thanks for calling. Have a great day.");
  vr.hangup();
  res.type("text/xml").send(vr.toString());
});
const PORT = process.env.PORT || 3000;

// quick health check so we can see it's up
app.get('/', (req, res) => res.send('ok'));

// IMPORTANT: bind to 0.0.0.0 on Render
app.listen(PORT, '0.0.0.0', () => {
  console.log('AI Receptionist listening on', PORT);
});
