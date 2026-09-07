/**
 * Генерирует dev-варианты иконок: те же PNG из public/icons/, но с оранжевым
 * треугольником-бейджем в углу — чтобы dev-сборку нельзя было спутать с
 * прод-версией из Chrome Web Store. Запускать вручную (npm run icons:dev),
 * когда меняются исходные иконки — результат коммитится в репозиторий.
 */
import { mkdir } from 'node:fs/promises';
import sharp from 'sharp';

const sizes = [16, 32, 48, 128];
const srcDir = 'public/icons';
const outDir = 'public/icons-dev';
const badgeColor = '#FF6A00';

await mkdir(outDir, { recursive: true });

for (const size of sizes) {
  const corner = Math.round(size * 0.55);
  const badge = Buffer.from(
    `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <polygon points="${size - corner},${size} ${size},${size - corner} ${size},${size}" fill="${badgeColor}" />
    </svg>`
  );

  await sharp(`${srcDir}/icon-${size}.png`)
    .composite([{ input: badge }])
    .png()
    .toFile(`${outDir}/icon-${size}.png`);

  console.log(`${outDir}/icon-${size}.png`);
}
