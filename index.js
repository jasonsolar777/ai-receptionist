const express = require("express");
const bodyParser = require("body-parser");

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

app.get("/", (req, res) => res.send("AI Receptionist Live ✅"));

app.post("/voice", (req, res) => {
  const { VoiceResponse } = require("twilio").twiml;
  const twiml = new VoiceResponse();
  twiml.say("Hello! Thanks for calling. This is your AI receptionist.");
  res.type("text/xml");
  res.send(twiml.toString());
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("AI Receptionist listening on", PORT));
