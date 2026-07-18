import { Expo } from "expo-server-sdk";
import { env } from "../config/env.js";
import { prisma } from "../db/client.js";

const expo = new Expo({ accessToken: env.EXPO_ACCESS_TOKEN || undefined });

export async function notifyRecordingCompleted(userId: string, recordingId: string): Promise<void> {
  const pushTokens = await prisma.pushToken.findMany({ where: { userId } });
  const validTokens = pushTokens.map((t) => t.expoPushToken).filter((token) => Expo.isExpoPushToken(token));
  if (validTokens.length === 0) {
    return;
  }

  const messages = validTokens.map((token) => ({
    to: token,
    title: "記事ができました",
    body: "散歩の記事プレビューを確認しましょう",
    data: { recordingId },
  }));

  const chunks = expo.chunkPushNotifications(messages);
  for (const chunk of chunks) {
    await expo.sendPushNotificationsAsync(chunk);
  }
}
