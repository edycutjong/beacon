import { chromium } from 'playwright';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

const AUDIO_PATH = '/Users/edycu/Projects/DemoStudio/public/projects/Pulse/demo_audio.mp3';

async function runDemo() {
  console.log('🚀 Starting Pulse Demo Recording Script...');
  
  const browser = await chromium.launch({ headless: false, slowMo: 50 });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: { dir: 'recordings/', size: { width: 1920, height: 1080 } }
  });

  const page = await context.newPage();
  await page.goto('http://localhost:3000');
  await page.waitForLoadState('networkidle');
  
  const hasAudio = fs.existsSync(AUDIO_PATH);
  let audioProcess: ReturnType<typeof spawn> | undefined;
  const startTime = Date.now();

  if (hasAudio) {
    console.log('🔊 Starting audio...');
    audioProcess = spawn('afplay', [AUDIO_PATH]);
  }

  const waitTo = async (targetSecond: number) => {
    const targetMs = targetSecond * 1000;
    const elapsed = Date.now() - startTime;
    if (targetMs > elapsed) await page.waitForTimeout(targetMs - elapsed);
  };

  // Timeline
  await waitTo(5);
  await page.click('a[href="/dashboard"]');
  
  await waitTo(15);
  await page.fill('#sweep-input', 'Routing Request: Run model classification on 12MB sensory log bundle from Remote Node #82.');
  await page.keyboard.press('Enter');
  
  await waitTo(60);
  
  await page.close();
  await context.close();
  
  const videoPath = await page.video()?.path();
  if (videoPath) {
    const finalPath = path.join('/Users/edycu/Projects/DemoStudio/public/projects/Pulse', 'Pulse_Demo.webm');
    const finalDir = path.dirname(finalPath);
    if (!fs.existsSync(finalDir)) fs.mkdirSync(finalDir, { recursive: true });
    fs.renameSync(videoPath, finalPath);
    console.log(`🎬 Demo recorded at: ${finalPath}`);
  }

  await browser.close();
  if (audioProcess) audioProcess.kill();
  process.exit(0);
}

runDemo().catch(console.error);
