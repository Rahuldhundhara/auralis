const sharp = require('sharp');
const fs = require('fs');
(async () => {
  await sharp('resources/icon.svg').resize(512,512).png().toFile('resources/icon.png');
  await sharp('resources/icon.svg').resize(256,256).png().toFile('resources/icon-256.png');
  await sharp('resources/icon.svg').resize(32,32).png().toFile('resources/tray.png');
  console.log('icons written');
})();
