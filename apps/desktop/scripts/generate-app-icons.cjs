#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { app, BrowserWindow } = require("electron");

const projectRoot = path.resolve(__dirname, "..");
const assetsDir = path.join(projectRoot, "assets");
const buildDir = path.join(projectRoot, "build");

const svgPath = path.join(assetsDir, "app-icon.svg");
const appPngPath = path.join(assetsDir, "app-icon.png");
const buildPngPath = path.join(buildDir, "icon.png");
const buildIcoPath = path.join(buildDir, "icon.ico");

const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

function createIcoFile(imagesBySize) {
  const count = imagesBySize.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);

  const directoryEntries = [];
  const imagePayloads = [];
  let imageOffset = 6 + count * 16;

  for (const { size, pngBuffer } of imagesBySize) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size === 256 ? 0 : size, 0);
    entry.writeUInt8(size === 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(pngBuffer.length, 8);
    entry.writeUInt32LE(imageOffset, 12);
    directoryEntries.push(entry);
    imagePayloads.push(pngBuffer);
    imageOffset += pngBuffer.length;
  }

  return Buffer.concat([header, ...directoryEntries, ...imagePayloads]);
}

function fail(message) {
  console.error(message);
  app.exit(1);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function renderSvgToNativeImage(svgMarkup) {
  const window = new BrowserWindow({
    width: 1024,
    height: 1024,
    show: false,
    frame: false,
    transparent: true,
    webPreferences: {
      offscreen: true,
      backgroundThrottling: false,
    },
  });

  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      html, body {
        margin: 0;
        width: 1024px;
        height: 1024px;
        background: transparent;
        overflow: hidden;
      }
      svg {
        display: block;
        width: 1024px;
        height: 1024px;
      }
    </style>
  </head>
  <body>${svgMarkup}</body>
</html>`;

  await window.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(html)}`);
  await wait(80);
  const image = await window.webContents.capturePage({
    x: 0,
    y: 0,
    width: 1024,
    height: 1024,
  });
  window.destroy();
  return image;
}

app
  .whenReady()
  .then(async () => {
    if (!fs.existsSync(svgPath)) {
      fail(`Missing icon source at ${svgPath}`);
      return;
    }

    fs.mkdirSync(assetsDir, { recursive: true });
    fs.mkdirSync(buildDir, { recursive: true });

    const svgMarkup = fs.readFileSync(svgPath, "utf8");
    const sourceImage = await renderSvgToNativeImage(svgMarkup);
    if (sourceImage.isEmpty()) {
      fail(`Failed to rasterize SVG source at ${svgPath}`);
      return;
    }

    const png512 = sourceImage.resize({ width: 512, height: 512, quality: "best" }).toPNG();
    fs.writeFileSync(appPngPath, png512);
    fs.writeFileSync(buildPngPath, png512);

    const icoImages = ICO_SIZES.map((size) => ({
      size,
      pngBuffer: sourceImage.resize({ width: size, height: size, quality: "best" }).toPNG(),
    }));
    const icoFile = createIcoFile(icoImages);
    fs.writeFileSync(buildIcoPath, icoFile);

    console.log("Generated icon assets:");
    console.log(`- ${appPngPath}`);
    console.log(`- ${buildPngPath}`);
    console.log(`- ${buildIcoPath}`);
    app.quit();
  })
  .catch((error) => {
    console.error("Failed to generate icon assets:", error);
    app.exit(1);
  });
