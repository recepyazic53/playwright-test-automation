// OTOMATİK TARAMA İŞİ — Nöbetçi sunucusu (scripts/platform/tarama/yonetici.mjs) bu testi ayrı bir süreç grubunda
// "playwright test --config scripts/platform/tarama/tarama.config.ts" ile başlatır. Tek test: girdiyi sunucudan
// işe özel token'la BİR KEZ alır (gizli değerler yalnızca bellekte), taramayı yürütür (tarama-motoru.ts), ilerlemeyi
// ve sonucu (envanter + ekran görüntüleri ya da açık hata) aynı token'la sunucuya gönderir. Test her durumda sonucu
// bildirir; hata sunucuda iş durumuna yazılır. Protokol: protokol.mjs.
import { test } from '@playwright/test';
import { TARAMA_ADRES_DEGISKENI, TARAMA_TOKEN_BASLIGI, TARAMA_TOKEN_DEGISKENI, type TaramaGirdisi, type TaramaOlayi, type TaramaSonucu } from './protokol.mjs';
import { hataBilgisi, taramayiYurut } from './tarama-motoru';

const ADRES = process.env[TARAMA_ADRES_DEGISKENI] ?? '';
const TOKEN = process.env[TARAMA_TOKEN_DEGISKENI] ?? '';

async function istek(yol: string, govde?: unknown): Promise<Response> {
  const r = await fetch(`${ADRES}${yol}`, {
    method: govde === undefined ? 'GET' : 'POST',
    headers: { [TARAMA_TOKEN_BASLIGI]: TOKEN, ...(govde === undefined ? {} : { 'content-type': 'application/json' }) },
    body: govde === undefined ? undefined : JSON.stringify(govde)
  });
  if (!r.ok) throw new Error(`Nöbetçi sunucusu isteği reddetti (${yol}: HTTP ${r.status}).`);
  return r;
}

test('Nöbetçi otomatik ekran taraması', async ({ browser }) => {
  if (!ADRES || !TOKEN) throw new Error('Bu test yalnızca Nöbetçi sunucusu tarafından başlatılır (tarama adresi/token yok).');
  const girdi = (await (await istek('/girdi')).json()) as TaramaGirdisi;
  test.setTimeout(girdi.zamanAsimiMs + 30_000);
  const olay = async (o: TaramaOlayi): Promise<void> => { await istek('/olay', o).catch(() => undefined); };
  let sonuc: TaramaSonucu;
  try {
    sonuc = { basarili: true, envanter: await taramayiYurut(browser, girdi, olay) };
  } catch (hata) {
    sonuc = { basarili: false, hata: hataBilgisi(hata) };
  }
  await istek('/sonuc', sonuc);
});
