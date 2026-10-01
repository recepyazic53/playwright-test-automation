// SAYFANIN AĞ SAKİNLİĞİ (genel) — hızlı test motoru (her alan / basış sonrası "sayfa izleme") ve normal koşu (model-kosucu.ts: alan
// sonrası arka plan istekleri) aynı kuralla bekler. Siteye özgü adres / sabit yoktur.
//
// Kural: sayfanın işi bitti mi sorusuna yalnız KISA ömürlü, anlamlı istekler karar verir:
//  - Sayılmaz: websocket, eventsource (SSE), beacon (ping), görüntü / yazı tipi / medya / stil / manifest istekleri.
//  - Uzun süren istek (uzun yoklama, keep-alive, analitik akışı): enUzunMs'den uzun bekleyen istek sayılmaz ve adresi (yöntem + köken +
//    yol) "uzun" olarak öğrenilir; aynı adrese sonraki istekler de hiç sayılmaz — sürekli açık isteği olan sitede her alanda süre
//    sonuna kadar beklenmez.
//  - Sessizlik: son sayılan istek başlangıcından / bitişinden bu yana kısa bir süre geçmiş olmalı (zincirleme istekler).
import type { BrowserContext, Page, Request } from '@playwright/test';

/** Bundan uzun bekleyen istek "uzun" sayılır (alan sonrası bekleme). */
export const UZUN_ISTEK_MS = 5_000;
/** Sakinlik için gereken, sayılan istek etkinliği olmayan süre. */
export const SESSIZLIK_MS = 400;
const SAYILMAYAN_TURLER = new Set(['websocket', 'eventsource', 'ping', 'image', 'media', 'font', 'manifest', 'texttrack', 'stylesheet', 'other']);

const adresAnahtari = (r: Request): string => {
  try { const u = new URL(r.url()); return `${r.method()} ${u.origin}${u.pathname}`; } catch { return `${r.method()} ${r.url()}`; }
};

export class AgIzleyici {
  private readonly suren = new Map<Request, { bas: number; anahtar: string }>();
  private readonly uzunlar = new Set<string>();
  /** Sayılan son istek etkinliği (başlama / bitiş) zamanı. */
  private son = 0;

  constructor(kaynak: Page | BrowserContext, secenek: { yalnizXhr?: boolean } = {}) {
    const k = kaynak as Page;
    k.on('request', (r: Request) => {
      const tur = r.resourceType();
      if (secenek.yalnizXhr ? tur !== 'xhr' && tur !== 'fetch' : SAYILMAYAN_TURLER.has(tur)) return;
      const anahtar = adresAnahtari(r);
      if (this.uzunlar.has(anahtar)) return;
      this.suren.set(r, { bas: Date.now(), anahtar });
      this.son = Date.now();
    });
    const bitti = (r: Request): void => { if (this.suren.delete(r)) this.son = Date.now(); };
    k.on('requestfinished', bitti);
    k.on('requestfailed', bitti);
  }

  /**
   * baslangic'tan (ms; 0 = hepsi) sonra başlamış, enUzunMs'den kısa süredir bekleyen istek sayısı. Uzun bekleyenlerin adresi öğrenilir
   * (sonraki istekleri sayılmaz).
   */
  bekleyen(baslangic = 0, enUzunMs = UZUN_ISTEK_MS): number {
    const simdi = Date.now();
    let n = 0;
    for (const [r, b] of this.suren) {
      if (this.uzunlar.has(b.anahtar)) { this.suren.delete(r); continue; }
      if (simdi - b.bas >= enUzunMs) { this.uzunlar.add(b.anahtar); this.suren.delete(r); continue; }
      if (b.bas >= baslangic) n++;
    }
    return n;
  }

  /** Sakin mi: sayılan bekleyen istek yok ve son etkinlikten (ya da baslangic'tan) bu yana sessizlikMs geçti. */
  sakinMi(baslangic = 0, secenek: { enUzunMs?: number; sessizlikMs?: number } = {}): boolean {
    if (this.bekleyen(baslangic, secenek.enUzunMs) > 0) return false;
    return Date.now() - Math.max(baslangic, this.son) >= (secenek.sessizlikMs ?? SESSIZLIK_MS);
  }

  /** Öğrenilen uzun istek adresleri (test / tanı). */
  uzunAdresler(): string[] { return [...this.uzunlar]; }
}
