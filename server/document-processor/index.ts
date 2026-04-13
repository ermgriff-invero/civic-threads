import { PDFParse } from "pdf-parse";
import fs from "fs";
import path from "path";
import { getOpenAI } from "../openai-client";

const UPLOADS_DIR = path.join(process.cwd(), "uploads");

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

export interface ProcessingResult {
  success: boolean;
  content?: string;
  error?: string;
  duration?: number;
  pageCount?: number;
}

export async function extractPdfText(buffer: Buffer): Promise<ProcessingResult> {
  try {
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    const pageCount = result.pages?.length || 0;
    await parser.destroy();
    return {
      success: true,
      content: result.text,
      pageCount,
    };
  } catch (error) {
    console.error("PDF extraction error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to extract PDF content",
    };
  }
}

export async function transcribeAudio(buffer: Buffer, fileName: string): Promise<ProcessingResult> {
  try {
    const tempFilePath = path.join(UPLOADS_DIR, `temp_${Date.now()}_${fileName}`);
    fs.writeFileSync(tempFilePath, buffer);

    try {
      const fileStream = fs.createReadStream(tempFilePath);
      const response = await getOpenAI().audio.transcriptions.create({
        file: fileStream,
        model: "whisper-1",
        response_format: "text",
      });

      return {
        success: true,
        content: response,
      };
    } finally {
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
    }
  } catch (error) {
    console.error("Audio transcription error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to transcribe audio",
    };
  }
}

export async function transcribeVideo(buffer: Buffer, fileName: string): Promise<ProcessingResult> {
  return transcribeAudio(buffer, fileName);
}

export function saveUploadedFile(buffer: Buffer, fileName: string): string {
  const uniqueName = `${Date.now()}_${fileName}`;
  const filePath = path.join(UPLOADS_DIR, uniqueName);
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

export function deleteUploadedFile(filePath: string): boolean {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  } catch (error) {
    console.error("Error deleting file:", error);
    return false;
  }
}

export function getMediaType(mimeType: string): "pdf" | "audio" | "video" | "text" | "other" {
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("text/")) return "text";
  return "other";
}

export const SUPPORTED_MIME_TYPES = {
  pdf: ["application/pdf"],
  audio: ["audio/mpeg", "audio/mp3", "audio/wav", "audio/webm", "audio/ogg", "audio/m4a", "audio/mp4"],
  video: ["video/mp4", "video/webm", "video/mpeg", "video/quicktime"],
  text: ["text/plain", "text/markdown", "text/csv"],
};

export const MAX_FILE_SIZE = {
  pdf: 20 * 1024 * 1024,
  audio: 25 * 1024 * 1024,
  video: 25 * 1024 * 1024,
  text: 5 * 1024 * 1024,
};
