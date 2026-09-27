// TAŞINABİLİR PAKET — Windows (scripts/paketle.mjs) ve macOS (scripts/paketle-mac.mjs) paketleyicilerinin ORTAK listesi:
// pakete giren uygulama dosyaları (kullanıcı verisi, günlük ve geçici dosyalar hariç) ve çalışma zamanı modülleri (geliştirme
// araçları — typescript, @types — hariç). Bu klasör (scripts/paket/) pakete girmez. Tipler: paket-ortak.d.mts.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Proje kökünden pakete (uygulama/) kopyalanan kökler. Kullanıcı verisi (veri/), .env, test sonuçları BURADA YOK. */
export const UYGULAMA_GIRDILERI = Object.freeze([
  'package.json', 'playwright.config.ts', 'tsconfig.json', 'README.md', 'docs', 'scripts', join('tests', 'support'), join('tests', 'model-kosucu')
]);
/** Kopyalanmayan dosyalar: sunucu günlüğü, sunucu token dosyası, paketleme araçları (scripts/paket/). */
export const HARIC_DESENLERI = Object.freeze([/[\\/]test-sunucu\.log$/, /[\\/]\.test-sunucu-token$/, /[\\/]paket[\\/]/]);
/** @param {string} yol */
export const haricMi = (yol) => HARIC_DESENLERI.some((d) => d.test(yol));

/** Her pakete giren modüller. */
export const TEMEL_MODULLER = Object.freeze(['@playwright', 'playwright', 'playwright-core', 'sql.js', 'dotenv']);
/** Veritabanı sürücüleri (Ayarlar > Entegrasyonlar > Veritabanı bağlantısı; kuruluysa). */
export const EK_MODULLER = Object.freeze(['mssql', 'oracledb', 'pg', 'mysql2']);

export class PaketHatasi extends Error {
  /** @param {string} mesaj */
  constructor(mesaj) {
    super(mesaj);
    this.name = 'PaketHatasi';
  }
}

/**
 * Pakete girecek node_modules kök klasörleri (sırasıyla): TEMEL_MODULLER, package.json "dependencies" ve EK_MODULLER
 * bağımlılık ağaçlarıyla birlikte (node_modules kökündeki bağımlılıklar tek tek izlenir; paketin kendi node_modules'ü onunla
 * kopyalanır). Eksik zorunlu modülde PaketHatasi.
 * @param {string} kok proje kökü
 * @returns {{ moduller: string[]; veritabaniSurucuLeri: string[] }}
 */
export function calismaZamaniModulleri(kok) {
  /** @type {string[]} */
  const moduller = [];
  for (const m of TEMEL_MODULLER) {
    if (!existsSync(join(kok, 'node_modules', m))) throw new PaketHatasi(`Eksik modül: node_modules/${m} ("npm install" çalıştırın).`);
    moduller.push(m);
  }
  const kopyalananlar = new Set(TEMEL_MODULLER);
  /** @param {string} ad @param {boolean} zorunlu */
  const ekle = (ad, zorunlu) => {
    if (kopyalananlar.has(ad) || kopyalananlar.has(ad.split('/')[0])) return;
    const k = join(kok, 'node_modules', ad);
    if (!existsSync(join(k, 'package.json'))) {
      if (zorunlu) throw new PaketHatasi(`Eksik modül: node_modules/${ad} ("npm install" çalıştırın).`);
      return;
    }
    kopyalananlar.add(ad);
    moduller.push(ad);
    const p = JSON.parse(readFileSync(join(k, 'package.json'), 'utf8'));
    for (const b of Object.keys({ ...(p.dependencies ?? {}), ...(p.optionalDependencies ?? {}) })) ekle(b, false);
  };
  const kokPaket = JSON.parse(readFileSync(join(kok, 'package.json'), 'utf8'));
  for (const m of Object.keys(kokPaket.dependencies ?? {})) ekle(m, true);
  for (const m of EK_MODULLER) ekle(m, false);
  return { moduller, veritabaniSurucuLeri: EK_MODULLER.filter((m) => kopyalananlar.has(m)) };
}

/**
 * uygulama/ klasörünün içeriği (Windows paketindeki cpSync kopyasıyla aynı küme): uygulama dosyaları (HARIC_DESENLERI
 * dışındakiler) + çalışma zamanı modülleri. Göreli yollar "/" ayraçlıdır; klasörler dosyalarından önce gelir.
 * @param {string} kok proje kökü
 * @returns {Generator<{ goreli: string; kaynak: string; klasor: boolean }>}
 */
export function* uygulamaIcerigi(kok) {
  /** @type {Set<string>} */
  const verilen = new Set();
  /** @param {string} kaynak @param {string} goreli @param {boolean} suz @returns {Generator<{ goreli: string; kaynak: string; klasor: boolean }>} */
  function* gez(kaynak, goreli, suz) {
    if (suz && haricMi(kaynak)) return;
    const s = statSync(kaynak);
    // Üst klasörler (ör. tests/) de kayıt olarak verilir.
    const parcalar = goreli.split('/');
    for (let i = 1; i < parcalar.length; i++) {
      const ust = parcalar.slice(0, i).join('/');
      if (!verilen.has(ust)) { verilen.add(ust); yield { goreli: ust, kaynak: '', klasor: true }; }
    }
    if (s.isDirectory()) {
      if (!verilen.has(goreli)) { verilen.add(goreli); yield { goreli, kaynak, klasor: true }; }
      for (const a of readdirSync(kaynak).sort()) yield* gez(join(kaynak, a), `${goreli}/${a}`, suz);
    } else if (!verilen.has(goreli)) {
      verilen.add(goreli);
      yield { goreli, kaynak, klasor: false };
    }
  }
  for (const g of UYGULAMA_GIRDILERI) {
    const kaynak = join(kok, g);
    if (existsSync(kaynak)) yield* gez(kaynak, g.split(/[\\/]/).join('/'), true);
  }
  for (const m of calismaZamaniModulleri(kok).moduller) yield* gez(join(kok, 'node_modules', m), `node_modules/${m}`, false);
}
