// macOS PAKETİ — içerik düzeni ve arşiv yazımı (ağ YOK; indirmeyi scripts/paketle-mac.mjs yapar). Windows paketiyle aynı
// uygulama içeriği (paket-ortak.mjs), Mac için Node ve Playwright tarayıcıları. Tipler: mac-paketi.d.mts.
//
// Arşiv (<paket adı>.tar.gz) düzeni:
//   Nöbetçi-mac-<mimari>/
//     OKUBENI.txt
//     Nöbetçi.app/Contents/Info.plist, PkgInfo
//     Nöbetçi.app/Contents/MacOS/Nobetci          başlatıcı kabuk betiği (0755, LF)
//     Nöbetçi.app/Contents/Resources/runtime/node Node (0755)
//     Nöbetçi.app/Contents/Resources/uygulama/    Nöbetçi (veri/ ve .env YOK)
//     Nöbetçi.app/Contents/Resources/tarayicilar/ Playwright tarayıcıları (PLAYWRIGHT_BROWSERS_PATH)
// Kullanıcı verisi pakette DEĞİL: ~/Library/Application Support/Nöbetçi (NOBETCI_VERI_KOKU; başlatıcı ayarlar).
// İzinler: klasörler 0755; kaynak arşivde yürütülebilir olanlar (Node, Chromium ikilileri, *.dylib, yardımcılar…) 0755,
// diğerleri 0644; sembolik bağlantılar (Chromium çerçevelerinde Versions/Current vb.) bağlantı olarak korunur.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TarYazici, tarGirdileri, yurutulebilirIcerikMi, zipGirdileri } from './arsiv.mjs';
import { uygulamaIcerigi } from './paket-ortak.mjs';

export const UYGULAMA_ADI = 'Nöbetçi';
export const APP_KLASORU = `${UYGULAMA_ADI}.app`;
export const BASLATICI_ADI = 'Nobetci';
/** Kullanıcı verisinin macOS'taki yeri ($HOME altında). */
export const MAC_VERI_KLASORU = `Library/Application Support/${UYGULAMA_ADI}`;
/** Playwright'ın bu sürümünde Chromium'un desteklediği en eski macOS (registry: mac14 öncesi için indirme yok). */
export const EN_ESKI_MACOS = '14.0';

/** @typedef {'arm64' | 'x64'} MacMimarisi */
/** @type {Readonly<Record<MacMimarisi, { node: string; playwright: string; uname: string; ad: string }>>} */
export const MIMARILER = Object.freeze({
  arm64: { node: 'darwin-arm64', playwright: 'mac15-arm64', uname: 'arm64', ad: 'Apple Silicon (M1 ve sonrası)' },
  x64: { node: 'darwin-x64', playwright: 'mac15', uname: 'x86_64', ad: 'Intel' }
});

/** @param {MacMimarisi} mimari */
export const paketAdi = (mimari) => `${UYGULAMA_ADI}-mac-${mimari}`;

/**
 * Contents/MacOS/Nobetci: Nobetci.cs'nin Mac karşılığı. Finder'dan açılınca kendini Terminal'de yeniden açar (Windows'taki konsol
 * penceresi gibi: pencere açık kaldıkça Nöbetçi çalışır, kapanınca sunucu da kapanır). --arka-plan: pencere açmadan yalnız sunucu.
 * @param {MacMimarisi} mimari
 */
export function baslaticiBetigi(mimari) {
  const m = MIMARILER[mimari];
  return `#!/bin/bash
# Nöbetçi — macOS başlatıcı (scripts/paketle-mac.mjs üretir; ${m.ad} / ${mimari}).
# Paketteki Node'u (Resources/runtime/node) ve tarayıcıları (Resources/tarayicilar) kullanarak Nöbetçi'yi başlatır.
# Kullanıcı verisi paket içinde DEĞİL, ~/${MAC_VERI_KLASORU} altında durur (uygulama salt okunur bir yerden de çalışabilir).
# İnternete hiçbir şey göndermez; sunucu yalnızca 127.0.0.1'e bağlanır.
set -u

uyari() {
  printf '%s\\n' "$1" >&2
  if [ ! -t 1 ]; then
    /usr/bin/osascript -e 'on run argv' -e 'display alert "${UYGULAMA_ADI}" message (item 1 of argv) as critical' -e 'end run' "$1" >/dev/null 2>&1 || true
  fi
}

BURASI="$(cd "$(dirname "$0")" && pwd -P)"
KAYNAK="$(cd "$BURASI/../Resources" && pwd -P)"
NODE="$KAYNAK/runtime/node"
UYGULAMA="$KAYNAK/uygulama"
BASLAT="$UYGULAMA/scripts/baslat.mjs"

if [ ! -x "$NODE" ] || [ ! -f "$BASLAT" ]; then
  uyari "Nöbetçi dosyaları eksik: paketi yeniden çıkarın (Contents/Resources/runtime/node ve uygulama/scripts/baslat.mjs gerekli)."
  exit 1
fi

MAKINE="$(/usr/bin/uname -m)"
if [ "${mimari}" = "arm64" ] && [ "$MAKINE" != "arm64" ]; then
  uyari "Bu paket Apple Silicon (arm64) içindir; bu Mac Intel ($MAKINE). Nöbetçi-mac-x64 paketini kullanın."
  exit 1
fi
if [ "${mimari}" = "x64" ] && [ "$MAKINE" = "arm64" ] && ! /usr/bin/arch -x86_64 /usr/bin/true >/dev/null 2>&1; then
  uyari "Bu paket Intel (x64) içindir; bu Mac Apple Silicon. Nöbetçi-mac-arm64 paketini kullanın (ya da Rosetta 2'yi kurun)."
  exit 1
fi

VERI="\${NOBETCI_VERI_KOKU:-$HOME/${MAC_VERI_KLASORU}}"
ONBELLEK="$HOME/Library/Caches/${UYGULAMA_ADI}"
/bin/mkdir -p "$VERI" "$ONBELLEK" && /bin/chmod 700 "$VERI" || { uyari "Veri klasörü oluşturulamadı: $VERI"; exit 1; }

export PLAYWRIGHT_BROWSERS_PATH="$KAYNAK/tarayicilar"
export NOBETCI_VERI_KOKU="$VERI"
export NOBETCI_YUKLEME_KLASORU="\${NOBETCI_YUKLEME_KLASORU:-$VERI/yuklenecek-dosyalar}"
export TEST_SUNUCU_LOG_DOSYASI="\${TEST_SUNUCU_LOG_DOSYASI:-$VERI/test-sunucu.log}"
export NOBETCI_CIKTI_KLASORU="\${NOBETCI_CIKTI_KLASORU:-$ONBELLEK/test-results}"
cd "$UYGULAMA" || exit 1

if [ "\${1:-}" = "--arka-plan" ]; then
  exec "$NODE" "$BASLAT" --arka-plan
fi

# Finder'dan açıldı (terminal yok): Terminal penceresinde yeniden açılır. NOBETCI_TERMINALSIZ=1 ile terminalsiz çalışır.
if [ ! -t 0 ] && [ -z "\${NOBETCI_TERMINALSIZ:-}" ]; then
  if /usr/bin/open -a Terminal "$BURASI/${BASLATICI_ADI}"; then
    exit 0
  fi
  exec "$NODE" "$BASLAT" >>"$VERI/baslatici.log" 2>&1
fi

printf '\\033]0;%s\\007' "${UYGULAMA_ADI}"
echo "Nöbetçi başlatılıyor…"
echo "Bu pencere açık kaldığı sürece Nöbetçi çalışır. Nöbetçi penceresini ya da bu pencereyi kapatınca Nöbetçi kapanır."
echo "Verileriniz: $VERI"
echo
exec "$NODE" "$BASLAT"
`;
}

/** @param {string} s */
const xml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Contents/Info.plist.
 * @param {{ mimari: MacMimarisi; surum: string }} g
 */
export function infoPlist(g) {
  const m = MIMARILER[g.mimari];
  const satirlar = /** @type {Array<[string, string]>} */ ([
    ['CFBundleDevelopmentRegion', 'tr'],
    ['CFBundleExecutable', BASLATICI_ADI],
    ['CFBundleIdentifier', 'local.nobetci.paket'],
    ['CFBundleInfoDictionaryVersion', '6.0'],
    ['CFBundleName', UYGULAMA_ADI],
    ['CFBundleDisplayName', UYGULAMA_ADI],
    ['CFBundlePackageType', 'APPL'],
    ['CFBundleShortVersionString', g.surum],
    ['CFBundleVersion', g.surum],
    ['LSMinimumSystemVersion', EN_ESKI_MACOS]
  ]);
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
${satirlar.map(([a, d]) => `\t<key>${a}</key>\n\t<string>${xml(d)}</string>`).join('\n')}
\t<key>LSArchitecturePriority</key>
\t<array>
\t\t<string>${m.uname}</string>
\t</array>
\t<key>NSHighResolutionCapable</key>
\t<true/>
</dict>
</plist>
`;
}

/**
 * OKUBENI.txt (Türkçe).
 * @param {{ mimari: MacMimarisi; nodeSurumu: string }} g
 */
export function okubeni(g) {
  const m = MIMARILER[g.mimari];
  const diger = g.mimari === 'arm64' ? 'x64' : 'arm64';
  return [
    `NÖBETÇİ — macOS taşınabilir sürüm (${m.ad}, ${g.mimari})`,
    '',
    `Bu paket ${m.ad} işlemcili Mac'ler içindir. ${g.mimari === 'arm64' ? 'Intel' : 'Apple Silicon'} bir Mac için`,
    `"${paketAdi(/** @type {MacMimarisi} */ (diger))}" paketini kullanın. macOS ${EN_ESKI_MACOS} ya da üstü gerekir. Node ${g.nodeSurumu} ve Playwright`,
    'tarayıcıları paketin içindedir; kurulum, Node ya da internet bağlantısı gerekmez.',
    '',
    'KURULUM',
    `1) "${APP_KLASORU}" uygulamasını Uygulamalar (Applications) klasörüne sürükleyin.`,
    '2) Paket imzasızdır. İlk açılışta: Nöbetçi\'ye sağ tıklayıp "Aç"ı seçin ve uyarıda yine "Aç"a basın. Açılmazsa',
    '   Sistem Ayarları > Gizlilik ve Güvenlik bölümünde Nöbetçi için "Yine de Aç" düğmesine basın.',
    '3) Uygulama yine açılmıyorsa ya da Nöbetçi penceresi (Chromium) açılmıyorsa, Terminal\'de karantina işaretini kaldırın:',
    `      xattr -dr com.apple.quarantine "/Applications/${APP_KLASORU}"`,
    '   (Uygulamayı başka bir klasöre koyduysanız o yolu yazın.)',
    '',
    'KULLANIM',
    `"${APP_KLASORU}" uygulamasına çift tıklayın. Bir Terminal penceresi açılır ve Nöbetçi kendi penceresinde açılır (Ayarlar >`,
    'Arayüz bölümünden varsayılan tarayıcıyı da seçebilirsiniz). Terminal penceresi açık kaldığı sürece Nöbetçi çalışır;',
    'Nöbetçi penceresini ya da Terminal penceresini kapatınca Nöbetçi kapanır. Nöbetçi yalnızca bu bilgisayardan erişilebilir.',
    '',
    'VERİLERİNİZ',
    `Verileriniz uygulamanın İÇİNDE DEĞİL, "~/${MAC_VERI_KLASORU}" klasöründe, sizin belirlediğiniz kasa parolasıyla`,
    'şifreli durur (Finder > Git > Klasöre Git ile açabilirsiniz). Uygulamayı silmek ya da yeni sürümle değiştirmek verilerinizi',
    'silmez. Yine de yeni bir sürüme geçmeden önce Ayarlar > Yedekleme\'den yedek alın. Koşu sırasındaki geçici çıktılar',
    `"~/Library/Caches/${UYGULAMA_ADI}" altındadır.`,
    '',
    'MAC\'TE OLMAYANLAR',
    '"Bilgisayar açılınca Nöbetçi arka planda başlasın" (zamanlanmış görev) ve Windows oturumuna bağlı otomatik kasa açma',
    '(DPAPI) yalnızca Windows\'ta vardır; Mac\'te bu seçenekler kapalıdır.',
    ''
  ].join('\n');
}

/**
 * @typedef {{
 *   dosyaSayisi: number; klasorSayisi: number; baglantiSayisi: number; yurutulebilirSayisi: number; tarBayti: number;
 *   kayitlar: Map<string, { tur: 'dosya' | 'klasor' | 'baglanti'; mod: number; boyut: number; hedef?: string }>
 * }} MacPaketiOzeti
 */

/**
 * Paketi tar.gz olarak yazar (ağ yok; kaynak arşivler bellekte verilir).
 * @param {{
 *   kok: string;
 *   hedef: string;
 *   mimari: MacMimarisi;
 *   nodeArsivi: Buffer;
 *   nodeSurumu: string;
 *   tarayicilar: Array<{ klasor: string; zip: Buffer; yurutulebilir?: string }>;
 *   zaman?: number;
 *   seviye?: number;
 * }} g
 * tarayicilar[].klasor: PLAYWRIGHT_BROWSERS_PATH altındaki klasör (ör. chromium-1243); yurutulebilir: klasöre göreli ana ikili
 * (varsa arşivde bulunması ve 0755 olması denetlenir).
 * @returns {Promise<MacPaketiOzeti>}
 */
export async function macPaketiYaz(g) {
  if (!MIMARILER[g.mimari]) throw new Error(`Bilinmeyen mimari: ${g.mimari}`);
  const kokAd = paketAdi(g.mimari);
  const app = `${kokAd}/${APP_KLASORU}/Contents`;
  const kaynak = `${app}/Resources`;
  const surum = String(JSON.parse(readFileSync(join(g.kok, 'package.json'), 'utf8')).version ?? '1.0.0');
  // Node ikilisi: arşivdeki <kök>/bin/node.
  const node = tarGirdileri(g.nodeArsivi).find((x) => x.tur === 'dosya' && /^[^/]+\/bin\/node$/.test(x.ad));
  if (!node) throw new Error('Node arşivinde bin/node bulunamadı.');
  if (!yurutulebilirIcerikMi(node.veri)) throw new Error('Node arşivindeki bin/node bir Mach-O ikilisi değil.');

  const t = new TarYazici(g.hedef, { zaman: g.zaman, seviye: g.seviye });
  let yurutulebilir = 0;
  try {
    await t.klasor(kokAd);
    await t.dosya(`${kokAd}/OKUBENI.txt`, Buffer.from(okubeni({ mimari: g.mimari, nodeSurumu: g.nodeSurumu }), 'utf8'), 0o644);
    await t.dosya(`${app}/Info.plist`, Buffer.from(infoPlist({ mimari: g.mimari, surum }), 'utf8'), 0o644);
    await t.dosya(`${app}/PkgInfo`, Buffer.from('APPL????', 'ascii'), 0o644);
    await t.dosya(`${app}/MacOS/${BASLATICI_ADI}`, Buffer.from(baslaticiBetigi(g.mimari), 'utf8'), 0o755);
    await t.dosya(`${kaynak}/runtime/node`, node.veri, 0o755);
    yurutulebilir += 2;

    // Uygulama (Windows paketiyle aynı küme). Hepsi Node ile okunur/çalıştırılır: 0644.
    for (const x of uygulamaIcerigi(g.kok)) {
      const ad = `${kaynak}/uygulama/${x.goreli}`;
      if (x.klasor) await t.klasor(ad);
      else await t.dosya(ad, readFileSync(x.kaynak), 0o644);
    }

    // Tarayıcılar: ZIP girdileri Windows diskine açılmadan, modları ve sembolik bağlantılarıyla yazılır.
    for (const tr of g.tarayicilar) {
      const onEk = `${kaynak}/tarayicilar/${tr.klasor}`;
      await t.klasor(onEk);
      for (const z of zipGirdileri(tr.zip)) {
        const ad = `${onEk}/${z.ad.replace(/^\.\//, '')}`;
        if (z.tur === 'klasor') { await t.klasor(ad); continue; }
        const veri = z.veri();
        if (z.tur === 'baglanti') { await t.baglanti(ad, veri.toString('utf8')); continue; }
        const calisir = z.mod !== null ? (z.mod & 0o111) !== 0 : yurutulebilirIcerikMi(veri);
        if (calisir) yurutulebilir++;
        await t.dosya(ad, veri, calisir ? 0o755 : 0o644);
      }
      // Playwright'ın kurulum işaretleri (Windows paketindeki klasörlerle aynı).
      await t.dosya(`${onEk}/INSTALLATION_COMPLETE`, Buffer.alloc(0), 0o644);
      await t.dosya(`${onEk}/DEPENDENCIES_VALIDATED`, Buffer.alloc(0), 0o644);
      if (tr.yurutulebilir) {
        const k = t.kayitlar.get(`${onEk}/${tr.yurutulebilir}`);
        if (!k || k.tur !== 'dosya' || k.mod !== 0o755) throw new Error(`Tarayıcı ikilisi arşivde yok ya da yürütülebilir değil: ${tr.klasor}/${tr.yurutulebilir}`);
      }
    }
  } finally {
    await t.bitir();
  }
  const kayitlar = t.kayitlar;
  let dosyaSayisi = 0, klasorSayisi = 0, baglantiSayisi = 0;
  for (const k of kayitlar.values()) {
    if (k.tur === 'dosya') dosyaSayisi++;
    else if (k.tur === 'klasor') klasorSayisi++;
    else baglantiSayisi++;
  }
  return { dosyaSayisi, klasorSayisi, baglantiSayisi, yurutulebilirSayisi: yurutulebilir, tarBayti: t.bayt, kayitlar };
}
