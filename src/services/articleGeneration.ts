import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { env } from "../config/env.js";

const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

const ArticleSetSchema = z.object({
  noteTitle: z.string(),
  noteBody: z.string(),
  xBody: z.string(),
});

export type Tone = "casual" | "polite";

const TONE_INSTRUCTIONS: Record<Tone, string> = {
  casual: "カジュアルで親しみやすい文体（「〜だよね」「〜かも」など）",
  polite: "丁寧語（「〜です」「〜ます」）",
};

export interface GeneratedArticleSet {
  noteTitle: string;
  noteBody: string;
  xBody: string;
}

// 要件定義書 §9-4: 1回の録音からNote用1本・X用1本を固定生成
export async function generateArticles(transcript: string, tone: Tone): Promise<GeneratedArticleSet> {
  const response = await anthropic.messages.parse({
    model: "claude-opus-4-8",
    max_tokens: 4096,
    output_config: { effort: "medium", format: zodOutputFormat(ArticleSetSchema) },
    system: [
      "あなたは散歩中の音声メモをNote記事とX(旧Twitter)投稿に変換するライターです。",
      `文体は${TONE_INSTRUCTIONS[tone]}を使ってください。`,
      "Note用は見出し(noteTitle)と本文(noteBody)からなる読み物記事、X用(xBody)は140字程度の短文（ハッシュタグを1つ程度含めてよい）にしてください。",
      "音声の書き起こしには言い淀みや繰り返しが含まれることがあるため、自然な文章に整えてください。",
    ].join("\n"),
    messages: [{ role: "user", content: transcript }],
  });

  if (!response.parsed_output) {
    throw new Error("記事生成の構造化出力に失敗しました");
  }
  return response.parsed_output;
}
