// UÇTAN UCA AKIŞIN EKRAN ADIMI (koşucu tarafı) — Nöbetçi bir uçtan uca akışın ekran adımını bu süreçte koşarken
// (scripts/platform/akislar/uctan-uca.mjs) akış değerlerini NOBETCI_AKIS_ADIMI ile verir:
//   - ezmeler: senaryonun bu koşu için ezilen alan değerleri (${akis:Ad} sunucuda çözülmüş),
//   - gizliDegerler: önceki adımların gizli değerleri (yakalanan mesajlarda ve hata metinlerinde maskelenir),
//   - okumalar: senaryo bitince ekrandan okunacak değerler (seçicinin ilk görünür öğesi; girdi / seçim ise değeri, değilse metni).
// Okunan değerler koşuya özgü anahtarla ŞİFRELİ geçici dosyaya yazılır (uctan-uca-cikti.mjs); rapora yalnız maskeli özet eklenir.
import type { Page, TestInfo } from '@playwright/test';
import {
  AKIS_ADIMI_DEGISKENI, AKIS_CIKTI_ANAHTARI_DEGISKENI, AKIS_CIKTI_DOSYASI_DEGISKENI, akisCiktisiYaz
} from '../../scripts/platform/akislar/uctan-uca-cikti.mjs';
import { gizliDegerleriMaskele } from '../../scripts/platform/senaryolar/model-kosusu.mjs';
import type { PlatformModelSenaryosu } from './platform-veri';

export type UctanUcaOkumasi = { ad: string; yol: string; gizli: boolean };
export type UctanUcaAdimi = { senaryoId: string; ezmeler: Record<string, string>; gizliDegerler: string[]; okumalar: UctanUcaOkumasi[] };

/** Okunacak öğenin görünmesi için beklenen süre. */
const OKUMA_BEKLEME_MS = 10_000;

/** Bu süreç bir uçtan uca akışın ekran adımı mı? Değilse (ya da değişken bozuksa) null. */
export function uctanUcaAdimi(ortam: NodeJS.ProcessEnv = process.env): UctanUcaAdimi | null {
  const ham = ortam[AKIS_ADIMI_DEGISKENI];
  if (!ham) return null;
  try {
    const v = JSON.parse(ham) as Record<string, unknown>;
    if (typeof v.senaryoId !== 'string' || !v.senaryoId) return null;
    const ezmeler: Record<string, string> = {};
    if (v.ezmeler && typeof v.ezmeler === 'object') for (const [a, d] of Object.entries(v.ezmeler)) if (typeof d === 'string') ezmeler[a] = d;
    const gizliDegerler = Array.isArray(v.gizliDegerler) ? v.gizliDegerler.filter((x): x is string => typeof x === 'string') : [];
    const okumalar = (Array.isArray(v.okumalar) ? v.okumalar : []).flatMap((o): UctanUcaOkumasi[] => {
      const x = o as Record<string, unknown>;
      return typeof x.ad === 'string' && typeof x.yol === 'string' ? [{ ad: x.ad, yol: x.yol, gizli: x.gizli === true }] : [];
    });
    return { senaryoId: v.senaryoId, ezmeler, gizliDegerler, okumalar };
  } catch {
    return null;
  }
}

/** Senaryonun bu koşuluk hâli: alanlar ezilir, akışın gizli değerleri maskelenecekler listesine eklenir. */
export function senaryoyaUygula(s: PlatformModelSenaryosu, adim: UctanUcaAdimi): PlatformModelSenaryosu {
  return { ...s, veri: { ...s.veri, ...adim.ezmeler }, tabloGizliDegerleri: [...(s.tabloGizliDegerleri ?? []), ...adim.gizliDegerler] };
}

/** Öğenin değeri: girdi / metin alanı / seçim ise değeri, değilse görünen metni (baştaki / sondaki boşluklar atılır). */
async function ogeDegeri(page: Page, secici: string): Promise<string> {
  const l = page.locator(secici).first();
  await l.waitFor({ state: 'visible', timeout: OKUMA_BEKLEME_MS });
  const etiket = await l.evaluate((e) => e.tagName.toLowerCase());
  const deger = etiket === 'input' || etiket === 'textarea' || etiket === 'select' ? await l.inputValue() : await l.innerText();
  return deger.trim();
}

/**
 * Senaryo bittikten sonra ekrandan okur; okunan değerleri şifreli çıktıya yazar (okunamayan olsa da okunanlar yazılır) ve rapora
 * maskeli özet ekler. Okunamayan değer testi "Beklenen / Görülen" benzeri açık hatayla düşürür.
 */
export async function ekrandanOku(page: Page, testInfo: TestInfo, adim: UctanUcaAdimi, ortam: NodeJS.ProcessEnv = process.env): Promise<void> {
  const okunanlar: Record<string, string> = {};
  const eksik: string[] = [];
  for (const o of adim.okumalar) {
    try {
      const d = await ogeDegeri(page, o.yol);
      if (d) okunanlar[o.ad] = d; else eksik.push(`${o.ad} (boş)`);
    } catch {
      eksik.push(`${o.ad} (öğe görünmedi)`);
    }
  }
  const gizliOkunanlar = adim.okumalar.filter((o) => o.gizli).map((o) => o.ad);
  const yol = ortam[AKIS_CIKTI_DOSYASI_DEGISKENI];
  const anahtar = ortam[AKIS_CIKTI_ANAHTARI_DEGISKENI];
  if (yol && anahtar) akisCiktisiYaz(yol, anahtar, { okunanlar, gizliOkunanlar });
  const gizliler = [...adim.gizliDegerler, ...gizliOkunanlar.map((ad) => okunanlar[ad]).filter((x): x is string => Boolean(x))];
  if (adim.okumalar.length) {
    const ozet = Object.fromEntries(adim.okumalar.map((o) => [o.ad, o.ad in okunanlar ? (o.gizli ? '***' : gizliDegerleriMaskele(okunanlar[o.ad], gizliler)) : '(okunamadı)']));
    await testInfo.attach('Akış değerleri (ekrandan okunan)', { contentType: 'application/json', body: JSON.stringify(ozet, null, 2) });
  }
  if (eksik.length) throw new Error(`Uçtan uca akış: ekrandan okunamayan değer — ${eksik.join(', ')}.`);
}
