// EKRAN KEŞFİ (Modeli güncelle > Nöbetçi taraması; tests/support/model-kosucu.ts > NOBETCI_EKRAN_ANALIZI). Senaryo doldurulmadan
// önce: radyolar ve kısa listelerin (yer tutucu hariç en çok KISA_LISTE seçenek) her seçeneği tek tek seçilir, kayıt oluşturmayan
// düğmelere basılır; her denemeden sonra sayfa okunur, beliren alanlar / düğmeler toplanır. Bir seçimle BELİREN seçimler ve düğmeler
// de denenir (önce o seçim yapılır; en çok EN_DERIN düzey). Her denemeden önce ekran yeniden açılır (bir seçim bağlı alanları
// sıfırlayabilir; denemeler birbirini etkilemez). Uzun listelerin yalnız seçenekleri okunur. Başka sayfaya giden bağlantılara basılmaz
// (javascript: / # bağlantıları düğme sayılır). Hiçbir şey yazılmaz; keşif bitince ekran yeniden açılır ve senaryo temiz ekranda koşar.
// Motor genel kalır: siteye özgü kural yok.
import type { Page } from '@playwright/test';
import { alanKapsami, envanterOku } from '../../scripts/platform/tarama/tarama-motoru';
import { eylemAdaylariniCikar } from '../../scripts/platform/tarama/eylem-kesfi-motoru';
import type { HamAlan } from '../../scripts/platform/tarama/paket-olusturucu.mjs';

/** Her seçeneği denenecek listenin en çok seçenek sayısı (yer tutucu hariç). */
export const KISA_LISTE = 9;
const EN_COK_DENEME = 60;
const EN_DERIN = 3;

export type GorulenDugme = { metin: string | null; secici: string; cerceve?: string[]; baglanti?: true };
/** yol: alanın göründüğü deneme (ör. "İşlem Tipi = Yeni İş › Sigortalı Tipi = Tüzel"); degisken: seçenekleri denemeler arasında değişti (bağlı liste). */
export type KesifAlani = HamAlan & { yol?: string; degisken?: true };
export type EkranKesfi = { alanlar: KesifAlani[]; dugmeler: GorulenDugme[]; denemeSayisi: number; notlar: string[] };

type Secim = { alan: KesifAlani; deger: string; metin: string };
type Deneme = { yol: Secim[] } & ({ tur: 'secim'; secim: Secim } | { tur: 'dugme'; dugme: GorulenDugme });

const yerTutucu = (s: { deger: string; metin: string | null }): boolean =>
  s.deger === '' || !String(s.metin ?? '').trim() || /^(seçiniz|seciniz|seçin|lütfen seçiniz|-+)\W*$/i.test(String(s.metin ?? '').trim());
const anahtar = (a: { secici: string; cerceve?: string[] }): string => `${a.secici}|${JSON.stringify(a.cerceve ?? [])}`;
const yolMetni = (y: Secim[]): string => y.map((s) => `${s.alan.etiket || s.alan.secici} = ${s.metin}`).join(' › ');

/** Sayfanın oturmasını bekler (ağ sakinleşene kadar, kısa). */
async function otur(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout: 4_000 }).catch(() => undefined);
  await page.waitForTimeout(400);
}

/** Alanın denenecek seçimleri (radyonun her düğmesi; kısa listenin her seçeneği). */
function secimleri(a: KesifAlani): Secim[] {
  if (a.devreDisi || a.saltOkunur) return [];
  if (a.tur === 'radio') return (a.radyolar ?? []).filter((r) => r.secici).map((r) => ({ alan: a, deger: r.secici as string, metin: r.metin ?? r.deger }));
  if (a.tur.startsWith('select') && !a.coklu) {
    const s = (a.secenekler ?? []).filter((x) => !yerTutucu(x));
    if (s.length >= 2 && s.length <= KISA_LISTE) return s.map((x) => ({ alan: a, deger: x.deger, metin: x.metin }));
  }
  return [];
}

async function sec(page: Page, s: Secim): Promise<void> {
  const k = alanKapsami(page, s.alan.cerceve);
  if (s.alan.tur === 'radio') { await k.locator(s.deger).first().check({ force: true, timeout: 3_000 }); return; }
  const l = k.locator(s.alan.secici).first();
  // Özel açılır liste (gizli <select>): değer atanır ve change tetiklenir.
  await l.selectOption(s.deger, { timeout: 3_000 }).catch(() => l.evaluate((e, v) => {
    const x = e as HTMLSelectElement; x.value = v; x.dispatchEvent(new Event('change', { bubbles: true }));
  }, s.deger));
}

/**
 * @param ac ekranı (yeniden) açar — koşucunun ekran açma yolu.
 */
export async function ekranKesfi(page: Page, ac: () => Promise<void>): Promise<EkranKesfi> {
  const alanlar = new Map<string, KesifAlani>();
  const dugmeler = new Map<string, GorulenDugme>();
  const kayitli: string[] = [];
  const kuyruk: Deneme[] = [];
  let denemeSayisi = 0;
  /** Sayfayı okur; ilk kez görülen alan / düğme kaydedilir, ilk kez görülen seçimler ve düğmeler (bu yolla) kuyruğa girer. */
  const topla = async (yol: Secim[], kuyrugaEkle = true): Promise<void> => {
    const env = await envanterOku(page).catch(() => null);
    for (const a of env?.alanlar ?? []) {
      const k = anahtar(a);
      const eski = alanlar.get(k);
      if (eski) {
        // Aynı alan başka bir seçimde farklı seçeneklerle görüldüyse (bağlı liste) seçenekleri birleştirilir.
        if (a.secenekler?.length && eski.secenekler) {
          const var_ = new Set(eski.secenekler.map((s) => s.deger));
          if (a.secenekler.length !== eski.secenekler.length || a.secenekler.some((s) => !var_.has(s.deger))) eski.degisken = true;
          eski.secenekler.push(...a.secenekler.filter((s) => !var_.has(s.deger)));
        }
        continue;
      }
      const yeni: KesifAlani = { ...a, ...(yol.length ? { yol: yolMetni(yol) } : {}) };
      alanlar.set(k, yeni);
      if (kuyrugaEkle && yol.length < EN_DERIN) for (const s of secimleri(yeni)) kuyruk.push({ yol, tur: 'secim', secim: s });
    }
    const eylem = await eylemAdaylariniCikar(page, { cerceveler: true }).catch(() => null);
    for (const d of eylem?.gonderim ?? []) {
      if (!d.metin || dugmeler.has(d.metin)) continue;
      const g: GorulenDugme = { metin: d.metin, secici: d.secici, ...(d.cerceve?.length ? { cerceve: d.cerceve } : {}), ...(d.baglanti ? { baglanti: true as const } : {}) };
      dugmeler.set(d.metin, g);
      if (d.kayitOlusturabilir) { kayitli.push(d.metin); continue; }
      if (kuyrugaEkle && yol.length < EN_DERIN) kuyruk.push({ yol, tur: 'dugme', dugme: g });
    }
  };
  await topla([]);

  while (kuyruk.length && denemeSayisi < EN_COK_DENEME) {
    const d = kuyruk.shift() as Deneme;
    try {
      await ac(); await otur(page);
      for (const s of d.yol) { await sec(page, s); await otur(page); }
      if (d.tur === 'secim') {
        await sec(page, d.secim);
        denemeSayisi++;
        await otur(page);
        await topla([...d.yol, d.secim]);
      } else {
        const l = alanKapsami(page, d.dugme.cerceve).locator(d.dugme.secici).first();
        // Başka sayfaya giden bağlantıya basılmaz (javascript: / # bağlantıları sayfa içi düğmedir).
        const href = d.dugme.baglanti ? await l.getAttribute('href', { timeout: 2_000 }).catch(() => null) : null;
        if (href && !/^\s*(javascript:|#)/i.test(href)) continue;
        await l.click({ timeout: 3_000 });
        denemeSayisi++;
        await otur(page);
        await page.waitForTimeout(800);
        // Düğmeden sonra belirenler yalnız toplanır (düğme bir seçim değildir; arkasından yeni denemeler açılmaz).
        await topla(d.yol, false);
      }
    } catch { /* denenemeyen seçim / düğme atlanır */ }
  }
  const notlar: string[] = [];
  if (kuyruk.length) notlar.push(`Keşifte ${denemeSayisi} deneme yapıldı; ${kuyruk.length} deneme sınır nedeniyle yapılmadı.`);
  if (kayitli.length) notlar.push(`Kayıt oluşturabilecek düğmelere keşifte basılmadı: ${kayitli.join(', ')}.`);
  return { alanlar: [...alanlar.values()], dugmeler: [...dugmeler.values()], denemeSayisi, notlar };
}
