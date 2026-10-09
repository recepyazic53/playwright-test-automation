// EKRAN KEŞFİ (Modeli güncelle > Nöbetçi taraması; tests/support/model-kosucu.ts > NOBETCI_EKRAN_ANALIZI). Senaryo doldurulmadan
// önce ekran açıkken: radyolar ve kısa listelerin (yer tutucu hariç en çok KISA_LISTE seçenek) her seçeneği tek tek seçilir, kayıt
// oluşturmayan düğmelere basılır; her denemeden sonra sayfa okunur ve beliren alanlar / düğmeler toplanır. Her denemeden önce ekran
// yeniden açılır (bir seçim bağlı alanları sıfırlayabilir; denemeler birbirini etkilemez). Uzun listelerin yalnız seçenekleri okunur.
// Hiçbir şey yazılmaz; keşif bitince ekran yeniden açılır ve senaryo temiz ekranda koşar. Motor genel kalır: siteye özgü kural yok.
import type { Page } from '@playwright/test';
import { alanKapsami, envanterOku } from '../../scripts/platform/tarama/tarama-motoru';
import { eylemAdaylariniCikar } from '../../scripts/platform/tarama/eylem-kesfi-motoru';
import type { HamAlan } from '../../scripts/platform/tarama/paket-olusturucu.mjs';

/** Her seçeneği denenecek listenin en çok seçenek sayısı (yer tutucu hariç). */
export const KISA_LISTE = 9;
const EN_COK_DENEME = 40;
const EN_COK_DUGME = 10;

export type GorulenDugme = { metin: string | null; secici: string; cerceve?: string[]; baglanti?: true };
/** yol: alanın göründüğü deneme (ör. "Sigortalı Tipi = Tüzel"); degisken: seçenekleri denemeler arasında değişti (bağlı liste). */
export type KesifAlani = HamAlan & { yol?: string; degisken?: true };
export type EkranKesfi = { alanlar: KesifAlani[]; dugmeler: GorulenDugme[]; denemeSayisi: number; notlar: string[] };

const yerTutucu = (s: { deger: string; metin: string | null }): boolean =>
  s.deger === '' || !String(s.metin ?? '').trim() || /^(seçiniz|seciniz|seçin|lütfen seçiniz|-+)\W*$/i.test(String(s.metin ?? '').trim());
const anahtar = (a: { secici: string; cerceve?: string[] }): string => `${a.secici}|${JSON.stringify(a.cerceve ?? [])}`;

async function dugmeleriOku(page: Page): Promise<GorulenDugme[]> {
  const e = await eylemAdaylariniCikar(page, { cerceveler: true }).catch(() => null);
  return (e?.gonderim ?? []).map((d) => ({ metin: d.metin, secici: d.secici, ...(d.cerceve?.length ? { cerceve: d.cerceve } : {}), ...(d.baglanti ? { baglanti: true as const } : {}) }));
}

/** Sayfanın oturmasını bekler (ağ sakinleşene kadar, kısa). */
async function otur(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout: 4_000 }).catch(() => undefined);
  await page.waitForTimeout(400);
}

/**
 * @param ac ekranı (yeniden) açar — koşucunun ekran açma yolu.
 */
export async function ekranKesfi(page: Page, ac: () => Promise<void>): Promise<EkranKesfi> {
  const alanlar = new Map<string, KesifAlani>();
  const dugmeler = new Map<string, GorulenDugme>();
  const notlar: string[] = [];
  let denemeSayisi = 0;
  const topla = async (yol: string | null): Promise<void> => {
    const env = await envanterOku(page).catch(() => null);
    for (const a of env?.alanlar ?? []) {
      const k = anahtar(a);
      const eski = alanlar.get(k);
      // Aynı alan başka bir seçimde farklı seçeneklerle görüldüyse (bağlı liste) seçenekleri birleştirilir.
      if (eski) {
        if (a.secenekler?.length && eski.secenekler) {
          const var_ = new Set(eski.secenekler.map((s) => s.deger));
          if (a.secenekler.length !== eski.secenekler.length || a.secenekler.some((s) => !var_.has(s.deger))) eski.degisken = true;
          eski.secenekler.push(...a.secenekler.filter((s) => !var_.has(s.deger)));
        }
        continue;
      }
      alanlar.set(k, { ...a, ...(yol ? { yol } : {}) });
    }
    for (const d of await dugmeleriOku(page)) if (d.metin && !dugmeler.has(d.metin)) dugmeler.set(d.metin, d);
  };
  // Kayıt oluşturabilecek düğmeler ilk (dokunulmamış) ekranda belirlenir.
  const ilkEylem = await eylemAdaylariniCikar(page, { cerceveler: true }).catch(() => null);
  const kayitli = new Set((ilkEylem?.gonderim ?? []).filter((d) => d.kayitOlusturabilir).map((d) => d.secici));
  await topla(null);
  const ilk = [...alanlar.values()];
  const ilkDugmeler = await dugmeleriOku(page);

  // 1) Radyolar ve kısa listeler: her seçenek ayrı denenir (her alan için ekran yeniden açılır).
  type Deneme = { alan: KesifAlani; deger: string; metin: string };
  const denemeler: Deneme[] = [];
  for (const a of ilk) {
    if (a.devreDisi || a.saltOkunur) continue;
    if (a.tur === 'radio') for (const r of a.radyolar ?? []) if (r.secici) denemeler.push({ alan: a, deger: r.secici, metin: r.metin ?? r.deger });
    if (a.tur.startsWith('select') && !a.coklu) {
      const s = (a.secenekler ?? []).filter((x) => !yerTutucu(x));
      if (s.length >= 2 && s.length <= KISA_LISTE) for (const x of s) denemeler.push({ alan: a, deger: x.deger, metin: x.metin });
    }
  }
  if (denemeler.length > EN_COK_DENEME) notlar.push(`Keşifte ${denemeler.length} seçimden ilk ${EN_COK_DENEME} tanesi denendi.`);
  let sonAlan: KesifAlani | null = null;
  for (const d of denemeler.slice(0, EN_COK_DENEME)) {
    try {
      if (sonAlan !== d.alan) { await ac(); await otur(page); sonAlan = d.alan; }
      const k = alanKapsami(page, d.alan.cerceve);
      if (d.alan.tur === 'radio') await k.locator(d.deger).first().check({ force: true, timeout: 3_000 });
      else {
        const l = k.locator(d.alan.secici).first();
        // Özel açılır liste (gizli <select>): değer atanır ve change tetiklenir.
        await l.selectOption(d.deger, { timeout: 3_000 }).catch(() => l.evaluate((e, v) => {
          const s = e as HTMLSelectElement; s.value = v; s.dispatchEvent(new Event('change', { bubbles: true }));
        }, d.deger));
      }
      denemeSayisi++;
      await otur(page);
      await topla(`${d.alan.etiket || d.alan.secici} = ${d.metin}`);
    } catch { /* denenemeyen seçim atlanır */ }
  }

  // 2) Düğmeler: kayıt oluşturabilecekler ve bağlantılar hariç; her basıştan önce ekran yeniden açılır.
  const basilacak = ilkDugmeler.filter((d) => !d.baglanti && d.metin);
  for (const d of basilacak.filter((x) => !kayitli.has(x.secici)).slice(0, EN_COK_DUGME)) {
    try {
      await ac(); await otur(page);
      await alanKapsami(page, d.cerceve).locator(d.secici).first().click({ timeout: 3_000 });
      denemeSayisi++;
      await otur(page);
      await page.waitForTimeout(800);
      await topla(`“${d.metin}” düğmesine basıldı`);
    } catch { /* basılamayan düğme atlanır */ }
  }
  const atlanan = basilacak.filter((x) => kayitli.has(x.secici)).map((x) => x.metin);
  if (atlanan.length) notlar.push(`Kayıt oluşturabilecek düğmelere keşifte basılmadı: ${atlanan.join(', ')}.`);
  return { alanlar: [...alanlar.values()], dugmeler: [...dugmeler.values()], denemeSayisi, notlar };
}
