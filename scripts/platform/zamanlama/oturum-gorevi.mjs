// ZAMANLANMIŞ KOŞULAR — "Bilgisayar açılınca Nöbetçi arka planda başlasın" (Planlı koşular; varsayılan KAPALI; yalnız Windows).
// Windows Görev Zamanlayıcı'ya kullanıcının KENDİ hesabıyla, yönetici izni gerektirmeyen (LeastPrivilege, InteractiveToken) ve
// yalnız bu kullanıcının oturum açılışında tetiklenen (/SC ONLOGON karşılığı: LogonTrigger + UserId) bir görev eklenir.
// Görev tanımı XML ile verilir (schtasks /Create /XML): komut satırı seçenekleriyle ayarlanamayan iki varsayılan düzeltilir —
// pilde başlamama (DisallowStartIfOnBatteries) ve 72 saatlik süre sınırı (ExecutionTimeLimit PT0S: sunucu süresiz çalışır).
// Görev Nöbetçi'yi pencere / tarayıcı AÇMADAN başlatır (baslat.mjs --arka-plan; pakette Nöbetçi.exe --arka-plan).
// - Komut dizileri SAF fonksiyonlarla üretilir; yürütücü enjekte edilir (testlerde sahte). Argümanlar execFile'a DİZİ olarak
//   verilir, kabuk birleştirmesi YOKTUR. schtasks.exe tam yoluyla çağrılır (PATH'e güvenilmez).
// - Sunucu schtasks'ı yalnız Ayarlar'daki uçlardan çağırır: /Create ve /Delete yalnız kullanıcı onayıyla; /Query durum gösterimi için.
// Tipler: oturum-gorevi.d.mts.
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

export const GOREV_ADI = 'Nöbetçi (arka plan)';
export const ARKA_PLAN_BAYRAGI = '--arka-plan';
/** Paketli sürümün başlatıcısı (uygulama/ klasörünün bir üstünde). */
export const PAKET_BASLATICISI = 'Nöbetçi.exe';

/** schtasks.exe'nin tam yolu. */
export function schtasksYolu() {
  return join(process.env.SystemRoot || process.env.WINDIR || 'C:\\Windows', 'System32', 'schtasks.exe');
}

/**
 * Görevin hedefi (saf): paketli sürümde Nöbetçi.exe --arka-plan; geliştirme kopyasında proje klasöründeki node + baslat.mjs.
 * @param {{ projeKoku: string; nodeYolu: string; varMi?: (yol: string) => boolean }} g
 * @returns {{ komut: string; argumanlar: string[]; calismaKlasoru: string; paket: boolean }}
 */
export function gorevHedefi(g) {
  const varMi = g.varMi ?? existsSync;
  const exe = join(g.projeKoku, '..', PAKET_BASLATICISI);
  if (basename(g.projeKoku).toLowerCase() === 'uygulama' && varMi(exe)) {
    return { komut: exe, argumanlar: [ARKA_PLAN_BAYRAGI], calismaKlasoru: dirname(exe), paket: true };
  }
  return { komut: g.nodeYolu, argumanlar: [join(g.projeKoku, 'scripts', 'baslat.mjs'), ARKA_PLAN_BAYRAGI], calismaKlasoru: g.projeKoku, paket: false };
}

/** @param {string} m */
const xmlKacis = (m) => m.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/**
 * Windows komut satırı argümanı (Görev Zamanlayıcı "Arguments" alanı): boşluk ya da tırnak içeriyorsa tırnaklanır.
 * @param {string} a
 */
export function komutSatiriArgumani(a) {
  if (a && !/[\s"]/.test(a)) return a;
  return `"${a.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, '$1$1')}"`;
}

/**
 * Görev tanımı (Task Scheduler 1.2 XML; saf). kullanici: "ALAN\\kullanıcı".
 * @param {{ kullanici: string; komut: string; argumanlar: string[]; calismaKlasoru: string }} g
 */
export function gorevXml(g) {
  const k = xmlKacis(g.kullanici);
  return [
    '<?xml version="1.0" encoding="UTF-16"?>',
    '<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">',
    '  <RegistrationInfo>',
    `    <Description>${xmlKacis('Nöbetçi\'yi oturum açılınca arka planda (pencere açmadan) başlatır. Nöbetçi > Planlı koşular\'dan kaldırılabilir.')}</Description>`,
    '  </RegistrationInfo>',
    '  <Triggers>',
    '    <LogonTrigger>',
    '      <Enabled>true</Enabled>',
    `      <UserId>${k}</UserId>`,
    '      <Delay>PT30S</Delay>',
    '    </LogonTrigger>',
    '  </Triggers>',
    '  <Principals>',
    '    <Principal id="Author">',
    `      <UserId>${k}</UserId>`,
    '      <LogonType>InteractiveToken</LogonType>',
    '      <RunLevel>LeastPrivilege</RunLevel>',
    '    </Principal>',
    '  </Principals>',
    '  <Settings>',
    '    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>',
    '    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>',
    '    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>',
    '    <AllowHardTerminate>true</AllowHardTerminate>',
    '    <StartWhenAvailable>false</StartWhenAvailable>',
    '    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>',
    '    <IdleSettings>',
    '      <StopOnIdleEnd>false</StopOnIdleEnd>',
    '      <RestartOnIdle>false</RestartOnIdle>',
    '    </IdleSettings>',
    '    <AllowStartOnDemand>true</AllowStartOnDemand>',
    '    <Enabled>true</Enabled>',
    '    <Hidden>false</Hidden>',
    '    <RunOnlyIfIdle>false</RunOnlyIfIdle>',
    '    <WakeToRun>false</WakeToRun>',
    '    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>',
    '    <Priority>5</Priority>',
    '  </Settings>',
    '  <Actions Context="Author">',
    '    <Exec>',
    `      <Command>${xmlKacis(g.komut)}</Command>`,
    `      <Arguments>${xmlKacis(g.argumanlar.map(komutSatiriArgumani).join(' '))}</Arguments>`,
    `      <WorkingDirectory>${xmlKacis(g.calismaKlasoru)}</WorkingDirectory>`,
    '    </Exec>',
    '  </Actions>',
    '</Task>',
    ''
  ].join('\r\n');
}

/** XML dosyası içeriği: UTF-16LE + BOM (schtasks /XML'in beklediği). @param {string} xml */
export const gorevXmlBaytlari = (xml) => Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(xml, 'utf16le')]);

/** Komut dizileri (saf). @param {string} [xmlYolu] */
export const gorevKomutlari = (xmlYolu = '') => ({
  olustur: { komut: schtasksYolu(), argumanlar: ['/Create', '/TN', GOREV_ADI, '/XML', xmlYolu, '/F'] },
  sorgula: { komut: schtasksYolu(), argumanlar: ['/Query', '/TN', GOREV_ADI] },
  sil: { komut: schtasksYolu(), argumanlar: ['/Delete', '/TN', GOREV_ADI, '/F'] }
});

/** @typedef {(komut: string, argumanlar: string[]) => Promise<{ kod: number; cikti: string }>} GorevYurutucu */

/**
 * Varsayılan yürütücü: execFile (kabuk YOK, pencere gizli, 20 sn zaman aşımı). Sıfırdan farklı çıkış kodu hata DEĞİLDİR (kod döner).
 * @type {GorevYurutucu}
 */
export const varsayilanGorevYurutucu = (komut, argumanlar) => new Promise((coz) => {
  execFile(komut, argumanlar, { windowsHide: true, shell: false, timeout: 20_000, encoding: 'utf8' }, (hata, stdout, stderr) => {
    const kod = hata ? (typeof /** @type {{ code?: unknown }} */ (hata).code === 'number' ? Number(/** @type {{ code?: unknown }} */ (hata).code) : -1) : 0;
    coz({ kod, cikti: `${stdout ?? ''}${stderr ?? ''}`.trim().slice(0, 500) });
  });
});

/** Görev var mı? (schtasks /Query; çıkış kodu 0 = var.) @param {GorevYurutucu} [yurutucu] */
export async function gorevVarMi(yurutucu = varsayilanGorevYurutucu) {
  const { komut, argumanlar } = gorevKomutlari().sorgula;
  return (await yurutucu(komut, argumanlar)).kod === 0;
}

/**
 * Görevi oluşturur (XML dosyası yazılır, schtasks /Create /XML, dosya silinir) ve varlığını doğrular.
 * @param {{ xml: string; xmlYolu: string; yaz: (yol: string, veri: Buffer) => void; sil: (yol: string) => void; yurutucu?: GorevYurutucu }} g
 */
export async function gorevOlustur(g) {
  const yurutucu = g.yurutucu ?? varsayilanGorevYurutucu;
  g.yaz(g.xmlYolu, gorevXmlBaytlari(g.xml));
  let sonuc;
  try {
    const { komut, argumanlar } = gorevKomutlari(g.xmlYolu).olustur;
    sonuc = await yurutucu(komut, argumanlar);
  } finally {
    try { g.sil(g.xmlYolu); } catch { /* geçici dosya zaten yok */ }
  }
  if (sonuc.kod !== 0) throw new Error(`Windows görevi oluşturulamadı (schtasks çıkış kodu ${sonuc.kod}).`);
  if (!(await gorevVarMi(yurutucu))) throw new Error('Windows görevi oluşturuldu görünüyor ama bulunamadı.');
}

/** Görevi siler (yoksa sessizce geçer). @param {GorevYurutucu} [yurutucu] */
export async function gorevSil(yurutucu = varsayilanGorevYurutucu) {
  if (!(await gorevVarMi(yurutucu))) return false;
  const { komut, argumanlar } = gorevKomutlari().sil;
  const sonuc = await yurutucu(komut, argumanlar);
  if (sonuc.kod !== 0) throw new Error(`Windows görevi silinemedi (schtasks çıkış kodu ${sonuc.kod}).`);
  return true;
}
