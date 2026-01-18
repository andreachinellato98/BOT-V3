import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ytDlpBinary = "yt-dlp";
const DOWNLOAD_TIMEOUT = 30 * 60 * 1000; // 30 minuti

function sanitizeFileName(name) {
  return name.replace(/[<>:"\/\\|?*]+/g, "").trim();
}

const queue = [];
let isProcessing = false;

export function addDownloadToQueue(url, channel, userId) {
  // Controlla se URL già in coda
  const alreadyQueued = queue.some(item => item.url === url);
  if (alreadyQueued) {
    safeChannelMessage(channel, `⚠️ | This video is already in the download queue.`);
    return;
  }
  
  queue.push({ 
    url, 
    channel,
    userId
  });
  if (!isProcessing) processQueue();
}

async function processQueue() {
  if (isProcessing) return;
  isProcessing = true;

  while (queue.length > 0) {
    const { url, channel, userId } = queue.shift();

    try {
      // Validazione URL
      new URL(url);

      // Recupero info video con timeout
      const info = await getVideoInfo(url);
      const videoTitle = sanitizeFileName(info.title);
      const localDir = process.env.LOCAL_DIR_PATH;
      
      if (!localDir) throw new Error("LOCAL_DIR_PATH not defined.");

      if (!fs.existsSync(localDir)) fs.mkdirSync(localDir, { recursive: true });

      const outputFile = path.join(localDir, `${videoTitle}.mp4`);

      // Log del path completo
      console.log(`Checking file: ${outputFile}`);
      console.log(`File exists: ${fs.existsSync(outputFile)}`);

      // Check se file esiste PRIMA di scaricare
      if (fs.existsSync(outputFile)) {
        await safeChannelMessage(channel, `⚠️ | File named '**${videoTitle}.mp4**' already exists. Skipping download.`);
        continue;
      }

      await safeChannelMessage(channel, `⬇️ | Downloading **${videoTitle}**...`);

      // Download con timeout
      await downloadVideo(url, outputFile);

      await safeChannelMessage(channel, `✅ | Download completed. Saved as **${videoTitle}.mp4**.`);
      
    } catch (err) {
      console.error("❌ | Download error:", err.message);
      await safeChannelMessage(channel, `❌ | Download failed: ${err.message}`);
    }
  }

  isProcessing = false;
}

// Recupero info del video con timeout
function getVideoInfo(url) {
  return new Promise((resolve, reject) => {
    let timeoutId = setTimeout(() => {
      ytProcess.kill("SIGKILL");
      reject(new Error("Timeout retrieving video info"));
    }, 30 * 1000);

    const args = ["-j", url];
    
    // User agent per evitare 403
    args.push("--user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
    
    // Aggiungo cookies se esistono (al momento no, quindi sticazzi)
    const cookiesPath = path.join(__dirname, "cookies.txt");
    if (fs.existsSync(cookiesPath)) {
      args.push("--cookies", cookiesPath);
    }

    const ytProcess = spawn(ytDlpBinary, args);
    let data = "";
    let errorData = "";

    ytProcess.stdout.on("data", chunk => {
      data += chunk.toString();
    });

    ytProcess.stderr.on("data", chunk => {
      errorData += chunk.toString();
    });

    ytProcess.on("close", code => {
      clearTimeout(timeoutId);
      if (code === 0) {
        try {
          resolve(JSON.parse(data));
        } catch (err) {
          reject(new Error("Failed to parse video info"));
        }
      } else {
        reject(new Error(errorData || "Failed to retrieve video info"));
      }
    });

    ytProcess.on("error", err => {
      clearTimeout(timeoutId);
      reject(err);
    });
  });
}

function downloadVideo(url, outputFile) {
  return new Promise((resolve, reject) => {
    const args = [
      "-f", "bestaudio[ext=m4a]+bestvideo[ext=mp4]/best",
      "-o", outputFile,
      url
    ];
    
    // User agent per evitare 403
    args.push("--user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
    
    // Aggiungo cookies se esistono (al momento no, quindi sticazzi)
    const cookiesPath = path.join(__dirname, "cookies.txt");
    if (fs.existsSync(cookiesPath)) {
      args.push("--cookies", cookiesPath);
    }

    const dlProcess = spawn(ytDlpBinary, args);

    let timeoutId = setTimeout(() => {
      dlProcess.kill("SIGKILL");
      reject(new Error("Download timeout"));
    }, DOWNLOAD_TIMEOUT);

    let errorData = "";
    dlProcess.stderr.on("data", chunk => {
      errorData += chunk.toString();
    });

    dlProcess.on("close", code => {
      clearTimeout(timeoutId);
      if (code === 0) {
        resolve();
      } else {
        // Pulisco file incompleto
        if (fs.existsSync(outputFile)) {
          try {
            fs.unlinkSync(outputFile);
          } catch (err) {
            console.warn("⚠️ | Could not delete incomplete file:", err);
          }
        }
        reject(new Error(errorData || "Download failed"));
      }
    });

    dlProcess.on("error", err => {
      clearTimeout(timeoutId);
      reject(err);
    });
  });
}

// Invio messaggi nel canale
async function safeChannelMessage(channel, content) {
  if (!channel) return;

  try {
    await channel.send({ content });
  } catch (err) {
    console.warn("⚠️ | Could not send channel message:", err.message);
  }
}