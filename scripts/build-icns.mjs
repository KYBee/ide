import fs from "node:fs";
import path from "node:path";

const iconsetDir = path.resolve("assets/icon.iconset");
const outputPath = path.resolve("Session Control Launcher.app/Contents/Resources/AppIcon.icns");

const entries = [
  ["icp4", "icon_16x16.png"],
  ["icp5", "icon_32x32.png"],
  ["icp6", "icon_32x32@2x.png"],
  ["ic07", "icon_128x128.png"],
  ["ic08", "icon_256x256.png"],
  ["ic09", "icon_512x512.png"],
  ["ic10", "icon_512x512@2x.png"]
];

function makeEntry(type, fileName) {
  const data = fs.readFileSync(path.join(iconsetDir, fileName));
  const header = Buffer.alloc(8);
  header.write(type, 0, 4, "ascii");
  header.writeUInt32BE(data.length + 8, 4);
  return Buffer.concat([header, data]);
}

const chunks = entries.map(([type, fileName]) => makeEntry(type, fileName));
const length = chunks.reduce((sum, chunk) => sum + chunk.length, 8);
const header = Buffer.alloc(8);
header.write("icns", 0, 4, "ascii");
header.writeUInt32BE(length, 4);

fs.writeFileSync(outputPath, Buffer.concat([header, ...chunks]));

