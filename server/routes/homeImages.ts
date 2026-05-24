import { Router } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BLOG_ROOT = path.resolve(__dirname, '../../../blog');
const HOME_IMAGES_PATH = path.join(BLOG_ROOT, 'src', 'data', 'homeImages.json');
const DEFAULT_CARD_IMAGES = [
  '/article-cover-knowledge-01.png',
  '/article-cover-knowledge-02.png',
  '/article-cover-knowledge-03.png',
  '/article-cover-knowledge-04.png',
];

const router = Router();

function normalizeImages(images: unknown): string[] {
  if (!Array.isArray(images)) return [];
  return images
    .map((image) => String(image || '').trim())
    .filter(Boolean);
}

async function readHomeImages() {
  try {
    const raw = await fs.readFile(HOME_IMAGES_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    return {
      cardImages: normalizeImages(parsed.cardImages),
      defaults: DEFAULT_CARD_IMAGES,
    };
  } catch {
    return {
      cardImages: [],
      defaults: DEFAULT_CARD_IMAGES,
    };
  }
}

router.get('/', async (_req, res) => {
  try {
    res.json(await readHomeImages());
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post('/', async (req, res) => {
  try {
    const nextImages = normalizeImages(req.body?.cardImages);
    await fs.mkdir(path.dirname(HOME_IMAGES_PATH), { recursive: true });
    await fs.writeFile(
      HOME_IMAGES_PATH,
      JSON.stringify({ cardImages: nextImages }, null, 2) + '\n',
      'utf-8'
    );
    res.json({
      success: true,
      cardImages: nextImages,
      defaults: DEFAULT_CARD_IMAGES,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
