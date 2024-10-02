import { exec } from "child_process";
import cors from "cors";
import dotenv from "dotenv";
import voice from "elevenlabs-node";
import express from "express";
import { promises as fs } from "fs";
import { GoogleGenerativeAI } from "@google/generative-ai"; // Import Google Generative AI SDK
import path from "path";
import userRoutes from './routes/users.js';
import authRoutes from './routes/auth.js';
import cookieParser from 'cookie-parser';

dotenv.config();

const ffmpegPath = "C:\\FFMPEG\\bin\\ffmpeg.exe";
const rhubarbPath = path.join(process.cwd(), "bin", "rhubarb.exe");

const apiKey = process.env.GEMINI_API_KEY;
const elevenLabsApiKey = process.env.ELEVEN_LABS_API_KEY;
const voiceID = "XB0fDUnXU5powFXDhCwa";

const genAI = new GoogleGenerativeAI(apiKey);
const model = genAI.getGenerativeModel({
  model: "gemini-1.5-flash",
  systemInstruction: `
    You are a virtual Assistant.
    You should always talk in a friendly and helpful manner.
    You will always reply with a JSON array of messages, with a maximum of 3 messages.
    Each message has a text, facialExpression, and animation property.
    The different facial expressions are: smile, sad, angry, surprised, funnyFace, and default.
    The different animations are: Talking_0, Talking_1, Talking_2, Crying, Laughing, Rumba, Idle, Terrified, and Angry.`,
});

const app = express();
app.use(express.json());
app.use(cors({
  credentials: true,
  origin: process.env.FRONTEND_URL || 'http://localhost:5173'
}));
app.use(cookieParser());
const port = 3000;

app.use('/api/users', userRoutes);
app.use('/api/auth', authRoutes);

app.get("/voices", async (req, res) => {
  res.send(await voice.getVoices(elevenLabsApiKey));
});

const execCommand = (command) => {
  return new Promise((resolve, reject) => {
    exec(command, { shell: true }, (error, stdout, stderr) => {
      if (error) reject(error);
      resolve(stdout);
    });
  });
};

const lipSyncMessage = async (message) => {
  const time = new Date().getTime();
  console.log(`Starting conversion for message ${message}`);
  const ffmpegCommand = `"${ffmpegPath}" -y -i audios/message_${message}.mp3 audios/message_${message}.wav`;
  console.log(`Executing ffmpeg command: ${ffmpegCommand}`);
  await execCommand(ffmpegCommand);
  console.log(`Conversion done in ${new Date().getTime() - time}ms`);
  
  const rhubarbCommand = `"${rhubarbPath}" -f json -o audios/message_${message}.json audios/message_${message}.wav -r phonetic`;
  console.log(`Executing rhubarb command: ${rhubarbCommand}`);
  await execCommand(rhubarbCommand);
  console.log(`Lip sync done in ${new Date().getTime() - time}ms`);
};


app.post("/chat", async (req, res) => {
  const userMessage = req.body.message;
  if (!userMessage) {
    res.send({
      messages: [
        {
          text: "Hey dear... How was your day?",
          audio: await audioFileToBase64("audios/intro_0.wav"),
          lipsync: await readJsonTranscript("audios/intro_0.json"),
          facialExpression: "smile",
          animation: "Talking_1",
        },
        {
          text: "I missed you so much... Please don't go for so long!",
          audio: await audioFileToBase64("audios/intro_1.wav"),
          lipsync: await readJsonTranscript("audios/intro_1.json"),
          facialExpression: "sad",
          animation: "Crying",
        },
      ],
    });
    return;
  }
  if (!elevenLabsApiKey || !apiKey) {
    res.send({
      messages: [
        {
          text: "Please my dear, don't forget to add your API keys!",
          audio: await audioFileToBase64("audios/api_0.wav"),
          lipsync: await readJsonTranscript("audios/api_0.json"),
          facialExpression: "angry",
          animation: "Angry",
        },
        {
          text: "You don't want to ruin Wawa Sensei with a crazy bill, right?",
          audio: await audioFileToBase64("audios/api_1.wav"),
          lipsync: await readJsonTranscript("audios/api_1.json"),
          facialExpression: "smile",
          animation: "Laughing",
        },
      ],
    });
    return;
  }

  const chatSession = model.startChat({
    generationConfig: {
      temperature: 0.6,
      topP: 0.95,
      topK: 64,
      maxOutputTokens: 8192,
      responseMimeType: "application/json",
    },
    history: [
      {
        role: "user",
        parts: [{ text: userMessage }],
      },
    ],
  });

  const result = await chatSession.sendMessage(userMessage);
  let messages = result.response.text();
  
  messages = JSON.parse(messages); // Ensure JSON format
  console.log(messages);

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    // generate audio file
    const fileName = `audios/message_${i}.mp3`; // The name of your audio file
    const textInput = message.text; // The text you wish to convert to speech
    await voice.textToSpeech(elevenLabsApiKey, voiceID, fileName, textInput);
    // generate lipsync
    await lipSyncMessage(i);
    message.audio = await audioFileToBase64(fileName);
    message.lipsync = await readJsonTranscript(`audios/message_${i}.json`);
  }

  res.send({ messages });
});

app.post("/chat-bot", async (req, res) => {
  const userMessage = req.body.message;

  if (!userMessage) {
    res.send({
      messages: [
        {
          text: "Hey Hi... How was your day?"
        },
        {
          text: "I missed you so much... Please don't go for so long!"
        },
      ],
    });
    return;
  }

  if (!apiKey) {
    res.send({
      messages: [
        {
          text: "Please my dear, don't forget to add your API keys!"
        },
        {
          text: "You don't want to ruin Wawa Sensei with a crazy bill, right?"
        },
      ],
    });
    return;
  }

  try {
    const chatSession = model.startChat({
      generationConfig: {
        temperature: 0.6,
        topP: 0.95,
        topK: 64,
        maxOutputTokens: 8192,
        responseMimeType: "application/json",
      },
      history: [
        {
          role: "user",
          parts: [{ text: userMessage }],
        },
      ],
    });

    const result = await chatSession.sendMessage(userMessage);
    const messages = await result.response.text();
    const parsedMessages = JSON.parse(messages); // Ensure it's in JSON format
    // Extract only the 'text' fields
    const onlyTextMessages = parsedMessages.map(message => ({ text: message.text }));
    res.send({ messages: onlyTextMessages });
    console.log(onlyTextMessages);
  } catch (error) {
    console.error("Error handling chat:", error);
    res.status(500).send({ error: "An error occurred. Please try again." });
  }
});


const readJsonTranscript = async (file) => {
  const data = await fs.readFile(file, "utf8");
  return JSON.parse(data);
};

const audioFileToBase64 = async (file) => {
  const data = await fs.readFile(file);
  return data.toString("base64");
};

app.listen(port, () => {
  console.log(`Virtual Assitant listening on port ${port}`);
});