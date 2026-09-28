// PDF BASKISI (sunucu): rapor HTML'i YEREL Playwright Chromium ile PDF'e çevrilir. Güvenlik:
//   - JavaScript kapalı bağlam (javaScriptEnabled: false), sayfa page.setContent ile yüklenir (dosya / adres yok);
//   - data: dışındaki TÜM istekler route ile engellenir (sayılır; rapor dış kaynak içermediğinden beklenen 0);
//   - servis çalışanı engelli, indirmeler kapalı; PDF yalnız bellekte döner — diske yazılmaz.
// Tek tarayıcı örneği paylaşılır ve aynı anda tek rapor basılır (kuyruk); boşta kalan tarayıcı BOSTA_KAPATMA_MS sonra kapanır.
// NOT: import.meta KULLANILMAZ.
import { kacis } from '../html-rapor.mjs';

/** Tek raporun en uzun basım süresi. */
export const PDF_ZAMAN_ASIMI_MS = 60_000;
const BOSTA_KAPATMA_MS = 60_000;

/** @type {Promise<import('@playwright/test').Browser> | null} */
let tarayiciSozu = null;
/** @type {Promise<unknown>} */
let kuyruk = Promise.resolve();
/** @type {ReturnType<typeof setTimeout> | null} */
let kapatici = null;

async function tarayici() {
  if (kapatici) { clearTimeout(kapatici); kapatici = null; }
  if (!tarayiciSozu) {
    tarayiciSozu = import('@playwright/test').then(({ chromium }) => chromium.launch({ headless: true }));
    tarayiciSozu.catch(() => { tarayiciSozu = null; });
  }
  const t = await tarayiciSozu;
  if (!t.isConnected()) { tarayiciSozu = null; return tarayici(); }
  return t;
}

function bostaKapat() {
  if (kapatici) clearTimeout(kapatici);
  kapatici = setTimeout(() => { void pdfTarayicisiniKapat(); }, BOSTA_KAPATMA_MS);
  kapatici.unref?.();
}

/** Paylaşılan tarayıcıyı kapatır (sunucu kapanırken / testlerde). */
export async function pdfTarayicisiniKapat() {
  if (kapatici) { clearTimeout(kapatici); kapatici = null; }
  const s = tarayiciSozu;
  tarayiciSozu = null;
  if (s) { try { await (await s).close(); } catch { /* zaten kapalı */ } }
}

/**
 * HTML → PDF (A4, arka planlar basılı, sayfa numaralı alt bilgi).
 * @param {string} html @param {{ altBilgi?: string; zamanAsimiMs?: number }} [s]
 * @returns {Promise<{ pdf: Buffer; engellenenIstek: number }>}
 */
export function htmldenPdf(html, s = {}) {
  const is = kuyruk.then(() => bas(html, s));
  kuyruk = is.catch(() => undefined);
  return is;
}

/** @param {string} html @param {{ altBilgi?: string; zamanAsimiMs?: number }} s */
async function bas(html, s) {
  const t = await tarayici();
  const baglam = await t.newContext({ javaScriptEnabled: false, serviceWorkers: 'block', acceptDownloads: false, offline: true });
  let engellenenIstek = 0;
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let zamanlayici;
  try {
    await baglam.route('**/*', (r) => {
      if (r.request().url().startsWith('data:')) return r.continue();
      engellenenIstek++;
      return r.abort('blockedbyclient');
    });
    const sayfa = await baglam.newPage();
    const zamanAsimi = s.zamanAsimiMs ?? PDF_ZAMAN_ASIMI_MS;
    const is = (async () => {
      await sayfa.setContent(html, { waitUntil: 'load', timeout: zamanAsimi });
      return sayfa.pdf({
        format: 'A4', printBackground: true, displayHeaderFooter: true, preferCSSPageSize: false,
        margin: { top: '13mm', bottom: '15mm', left: '12mm', right: '12mm' },
        headerTemplate: '<span></span>',
        footerTemplate: `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:7pt;color:#6b7482;width:100%;padding:0 12mm;display:flex;justify-content:space-between">`
          + `<span>${kacis(s.altBilgi ?? 'Nöbetçi raporu')}</span><span>Sayfa <span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`
      });
    })();
    const zaman = new Promise((_, reddet) => { zamanlayici = setTimeout(() => reddet(new Error('PDF basımı zaman aşımına uğradı.')), zamanAsimi); });
    const pdf = /** @type {Buffer} */ (await Promise.race([is, zaman]));
    return { pdf: Buffer.from(pdf), engellenenIstek };
  } finally {
    if (zamanlayici) clearTimeout(zamanlayici);
    await baglam.close().catch(() => {});
    bostaKapat();
  }
}

/** PDF'teki sayfa sayısı ("/Type /Page" nesneleri; "/Pages" hariç) — testler ve rapor meta verisi için. @param {Buffer} pdf */
export function pdfSayfaSayisi(pdf) {
  return (pdf.toString('latin1').match(/\/Type\s*\/Page(?![a-zA-Z])/g) ?? []).length;
}
