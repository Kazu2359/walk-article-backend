import OpenAI, { toFile } from "openai";
import { env } from "../config/env.js";

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

export async function transcribeAudio(audio: Buffer): Promise<string> {
  const file = await toFile(audio, "recording.m4a");
  const transcription = await openai.audio.transcriptions.create({
    file,
    model: "whisper-1",
    language: "ja",
  });
  return transcription.text;
}
