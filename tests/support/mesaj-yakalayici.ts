// KOŞUDA YAKALANAN MESAJLAR — koşu sürecindeki toplayıcı (sayfa başına bir tane). Test geçse de kalsa da sayfanın konsol
// hataları, yakalanmamış sayfa hataları ve aynı kökene giden isteklerdeki HTTP 4xx / 5xx yanıtları burada dinlenir; diyalog
// metinleri ve hata göstergesi / uyarı öğesi metinleri model koşucusunun MEVCUT okuma noktalarından bildirilir (diyalog
// işleme davranışı değişmez — ayrı bir 'dialog' dinleyicisi KURULMAZ). Kayıtlar maskelenir (bkz.
// scripts/platform/sonuclar/yakalanan-mesajlar.mjs); fixtures.ts testin sonunda "yakalananMesajlar" annotation'ı olarak
// ekler, raporlayıcı sonuç satırına bağlar.
import type { Page, TestInfo } from '@playwright/test';
import {
  agMesajiMetni, mesajToplayici, yakalananMetniMaskele, type YakalamaKaynagi, type YakalananMesaj
} from '../../scripts/platform/sonuclar/yakalanan-mesajlar.mjs';
import { mesajIceriyorMu } from './beklenen-sonuc';

export const YAKALANAN_MESAJLAR_ANNOTATION = 'yakalananMesajlar';

export type MesajYakalayici = {
  /** Şu anki adım adı (model koşucusu her test.step'te günceller). */
  adim: string | null;
  /** Maskelenecek bilinen gizli değerler (parola, kod, gizli alan değerleri…). */
  gizliDegerEkle(...degerler: unknown[]): void;
  /** Kullanıcının senaryoda / akışta beklediği mesajlar: eşleşen yakalanan mesaj "beklenen" işaretlenir. */
  beklenenEkle(...mesajlar: unknown[]): void;
  /** Mesaj bildirir (maskelenir, tekrarlar sayılır). */
  yakala(kaynak: YakalamaKaynagi, metin: string): void;
  /**
   * Hata göstergesi / uyarı öğesi metni: aynı adımda sürekli okunan (yoklanan) aynı metin bir kez sayılır; metin kaybolup
   * yeniden görünürse ya da başka adımda görünürse yeniden sayılır. grup: okuma noktası (ör. gösterge seçicisi).
   */
  gostergeMetinleri(grup: string, metinler: readonly string[]): void;
  liste(): YakalananMesaj[];
};

const yakalayicilar = new WeakMap<Page, MesajYakalayici>();

/** Sayfanın toplayıcısı (yoksa undefined). */
export function mesajYakalayicisi(page: Page): MesajYakalayici | undefined {
  return yakalayicilar.get(page);
}

/** Sayfaya toplayıcıyı kurar (zaten kuruluysa onu döndürür). */
export function mesajYakalayicisiKur(page: Page): MesajYakalayici {
  const mevcut = yakalayicilar.get(page);
  if (mevcut) return mevcut;
  const toplayici = mesajToplayici();
  const gizliler = new Set<string>();
  const beklenenler: string[] = [];
  let gorunenAdim: string | null = null;
  let gorunenler = new Map<string, Set<string>>();
  const y: MesajYakalayici = {
    adim: null,
    gizliDegerEkle(...degerler) {
      for (const d of degerler) if ((typeof d === 'string' || typeof d === 'number') && String(d).trim().length >= 3) gizliler.add(String(d));
    },
    beklenenEkle(...mesajlar) {
      for (const m of mesajlar) if (typeof m === 'string' && m.trim()) beklenenler.push(m);
    },
    yakala(kaynak, metin) {
      const ham = String(metin ?? '').trim();
      if (!ham) return;
      const maskeli = yakalananMetniMaskele(ham, { gizliDegerler: [...gizliler] });
      // "Beklenen" karşılaştırması maskelenmemiş metinle yapılır (beklenen mesajda maskelenen bir parça olabilir).
      toplayici.ekle({ kaynak, metin: maskeli, adim: y.adim, beklenen: beklenenler.some((b) => mesajIceriyorMu(ham, b)) });
    },
    gostergeMetinleri(grup, metinler) {
      if (gorunenAdim !== y.adim) { gorunenAdim = y.adim; gorunenler = new Map(); }
      const once = gorunenler.get(grup) ?? new Set<string>();
      const simdi = new Set(metinler.map((m) => m.trim()).filter(Boolean));
      for (const m of simdi) if (!once.has(m)) y.yakala('hata-gostergesi', m);
      gorunenler.set(grup, simdi);
    },
    liste: () => toplayici.liste()
  };
  yakalayicilar.set(page, y);

  page.on('console', (m) => { if (m.type() === 'error') y.yakala('konsol', m.text()); });
  page.on('pageerror', (e) => y.yakala('sayfa-hatasi', e.message || String(e)));
  page.on('response', (r) => {
    const durum = r.status();
    if (durum < 400) return;
    try {
      const sayfa = new URL(page.url());
      const hedef = new URL(r.url());
      if (!/^https?:$/.test(sayfa.protocol) || hedef.origin !== sayfa.origin) return;
      y.yakala('ag', agMesajiMetni(r.request().method(), r.url(), durum));
    } catch { /* sayfa kapanıyor ya da adres çözülemedi: yok sayılır */ }
  });
  return y;
}

/** Testin yakalanan mesajlarını annotation olarak ekler (raporlayıcı okur). Mesaj yoksa eklenmez. */
export function yakalananMesajlariEkle(page: Page, testInfo: TestInfo): void {
  const liste = mesajYakalayicisi(page)?.liste() ?? [];
  if (liste.length) testInfo.annotations.push({ type: YAKALANAN_MESAJLAR_ANNOTATION, description: JSON.stringify(liste) });
}
