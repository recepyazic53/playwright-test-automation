// OTOMATİK TARAMA / AKIŞ KAYDI İŞİ — Nöbetçi sunucusu (scripts/platform/tarama/yonetici.mjs) bu testi ayrı bir süreç
// grubunda "playwright test --config scripts/platform/tarama/tarama.config.ts" ile başlatır. Tek test: girdiyi sunucudan
// işe özel token'la BİR KEZ alır (gizli değerler yalnızca bellekte), girdinin kipine göre taramayı (tarama-motoru.ts) ya
// da akış kaydını (kayit-motoru.ts; görünür tarayıcı) ya da öğe seçmeyi (oge-secme-motoru.ts; görünür tarayıcı) yürütür, ilerlemeyi ve sonucu (envanter ya da açık hata) aynı
// token'la sunucuya gönderir. Test her durumda sonucu bildirir; hata sunucuda iş durumuna yazılır. Protokol: protokol.mjs.
import { test } from '@playwright/test';
import { TARAMA_ADRES_DEGISKENI, TARAMA_TOKEN_BASLIGI, TARAMA_TOKEN_DEGISKENI, type TaramaGirdisi, type TaramaOlayi, type TaramaSonucu } from './protokol.mjs';
import { akisiKaydet } from './kayit-motoru';
import { girisiDene } from './giris-denemesi';
import { ogeleriSec } from './oge-secme-motoru';
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
  // "Koşunun saklanan oturumunu kullan": başarılı girişin oturumu sunucuya (sunucu koşunun şifreli dosyasına yazar).
  const oturumGonder = async (durum: unknown): Promise<void> => { await istek('/oturum', durum); };
  let sonuc: TaramaSonucu;
  try {
    sonuc = { basarili: true, envanter: girdi.kip === 'kayit' ? await akisiKaydet(browser, girdi, olay, oturumGonder)
      : girdi.kip === 'girisDenemesi' ? await girisiDene(browser, girdi, olay)
        : girdi.kip === 'ogeSecme' ? await ogeleriSec(browser, girdi, olay, oturumGonder) : await taramayiYurut(browser, girdi, olay, oturumGonder) };
  } catch (hata) {
    sonuc = { basarili: false, hata: hataBilgisi(hata) };
  }
  await istek('/sonuc', sonuc);
});
