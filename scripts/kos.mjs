#!/usr/bin/env node
// KOMUT SATIRI / CI KOŞUSU — "npm run kos -- --ortam TEST [seçenekler]"
// Çalışan Nöbetçi'ye (bu bilgisayarda, 127.0.0.1) bağlanır ve senaryoları arayüzdeki "Koşuyu başlat" ile AYNI yoldan koşar
// (/platform/senaryolar/calistir); sonuçlar Nöbetçi'nin Sonuçlar ekranına da düşer. Kasa Nöbetçi'de açık olmalıdır: bu komut
// parola sormaz, parola almaz, hiçbir gizli bilgiyi ekrana ya da dosyaya yazmaz.
//
// Seçenekler:
//   --ortam <ad>        (zorunlu) ortam adı ya da kimliği
//   --proje <ad>        proje adı ya da kimliği (varsayılan: Nöbetçi'deki varsayılan proje)
//   --ekran <ad>        yalnız bu ekranın senaryoları (birden çok kez verilebilir)
//   --senaryo <metin>   başlığında bu metin geçen senaryolar (birden çok kez verilebilir)
//   --hepsi             "Koşuda" kapalı olanlar da (varsayılan: yalnız "Koşuda" açık senaryolar)
//   --junit <dosya>     sonuçları JUnit XML olarak yaz (CI sistemleri için)
//   --json              özet çıktıyı JSON olarak yaz
//   --canli-onay        CANLI ortamda (Ayarlar > "Ortam türü" Canlı ya da seçilmemiş) koşmayı AÇIKÇA onaylar (verilmezse koşu başlamaz)
//   --liste             koşmadan, seçilecek senaryoları listeler
// Çıkış kodu: 0 = hepsi başarılı (ya da --liste), 1 = en az bir senaryo kaldı / çalıştırılamadı, 2 = kullanım / bağlantı hatası.
// Port: TEST_SUNUCU_PORT (varsayılan 5566).
import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { riskliOrtamMi } from './platform/guvenlik/ortam-riski.mjs';
import { etkinKosuHizi, kosuHiziOzeti } from './platform/ayarlar/kosu-hizi.mjs';

const PORT = Number(process.env.TEST_SUNUCU_PORT) || 5566;
const TABAN = `http://127.0.0.1:${PORT}`;

function argumanlar(argv) {
  /** @type {{ ortam?: string; proje?: string; ekran: string[]; senaryo: string[]; hepsi: boolean; junit?: string; json: boolean; canliOnay: boolean; liste: boolean; yardim: boolean }} */
  const a = { ekran: [], senaryo: [], hepsi: false, json: false, canliOnay: false, liste: false, yardim: false };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    const deger = () => { const v = argv[++i]; if (v === undefined || v.startsWith('--')) throw new Error(`${x} bir değer ister.`); return v; };
    if (x === '--ortam') a.ortam = deger();
    else if (x === '--proje') a.proje = deger();
    else if (x === '--ekran') a.ekran.push(deger());
    else if (x === '--senaryo') a.senaryo.push(deger());
    else if (x === '--junit') a.junit = deger();
    else if (x === '--hepsi') a.hepsi = true;
    else if (x === '--json') a.json = true;
    else if (x === '--canli-onay') a.canliOnay = true;
    else if (x === '--liste') a.liste = true;
    else if (x === '--yardim' || x === '-h' || x === '--help') a.yardim = true;
    else throw new Error(`Bilinmeyen seçenek: ${x} (--yardim)`);
  }
  return a;
}

const sade = (s) => String(s ?? '').toLocaleLowerCase('tr').trim();
const bul = (liste, aranan, ad = (x) => x.ad) => liste.find((x) => x.id === aranan) || liste.find((x) => sade(ad(x)) === sade(aranan));

async function main() {
  let a;
  try { a = argumanlar(process.argv.slice(2)); } catch (hata) { console.error(hata.message); return 2; }
  if (a.yardim || !a.ortam) {
    console.log('Kullanım: npm run kos -- --ortam <ad> [--proje <ad>] [--ekran <ad>]… [--senaryo <metin>]… [--hepsi] [--junit <dosya>] [--json] [--canli-onay] [--liste]');
    return a.yardim ? 0 : 2;
  }

  // Oturum token'ı: Nöbetçi kabuğundaki <meta> (her sunucu başlangıcında yeni; yalnız bu bilgisayardan okunabilir).
  let token;
  try {
    const html = await (await fetch(`${TABAN}/`, { signal: AbortSignal.timeout(5000) })).text();
    token = html.match(/name="oturum-tokeni"\s+content="([^"]+)"/)?.[1];
  } catch { /* aşağıda */ }
  if (!token) { console.error(`Nöbetçi'ye bağlanılamadı (${TABAN}). Önce "npm run baslat" ile başlatın.`); return 2; }
  const api = async (yol, govde) => {
    const yanit = await fetch(`${TABAN}${yol}`, govde
      ? { method: 'POST', headers: { 'X-Test-Sunucu-Token': token, 'Content-Type': 'application/json' }, body: JSON.stringify({ ...govde, token }) }
      : { headers: { 'X-Test-Sunucu-Token': token } });
    const veri = await yanit.json().catch(() => ({}));
    if (!yanit.ok || veri.basarili === false) throw Object.assign(new Error(veri.mesaj || `${yol}: HTTP ${yanit.status}`), { kod: veri.kod });
    return veri;
  };

  const durum = await api('/platform/durum').catch(() => null);
  if (durum && durum.kasa && durum.kasa.acik === false) { console.error('Kasa kilitli: Nöbetçi\'de kasayı açın, sonra yeniden deneyin.'); return 2; }

  let projeler, varsayilanId;
  try { ({ projeler, varsayilanId } = await api('/platform/projeler')); } catch (hata) { console.error(`Projeler okunamadı: ${hata.message} (kasa açık mı?)`); return 2; }
  const proje = a.proje ? bul(projeler, a.proje) : projeler.find((p) => p.id === varsayilanId) || projeler[0];
  if (!proje) { console.error(a.proje ? `Proje bulunamadı: ${a.proje}` : 'Hiç proje yok.'); return 2; }
  const { ortamlar } = await api(`/platform/ortamlar?projeId=${encodeURIComponent(proje.id)}`);
  const ortam = bul(ortamlar, a.ortam);
  if (!ortam) { console.error(`Ortam bulunamadı: ${a.ortam} (var olanlar: ${ortamlar.map((o) => o.ad).join(', ')})`); return 2; }
  // CANLI ortam: tek tanım (platform/guvenlik/ortam-riski.mjs). Sunucu ayrıca Ayarlar > İzinler > "Canlı ortamda
  // çalıştırma" iznini ve istekteki açık onayı (canliOnay) denetler; izin kapalıysa koşu başlamaz ve mesaj yazılır.
  const riskli = riskliOrtamMi(ortam);
  if (riskli && !a.canliOnay && !a.liste) {
    console.error(`Bu işlem "${ortam.ad}" (CANLI) ortamında yapılacak; istekler gerçek sisteme gider${ortam.riskli === null ? ' (ortam türü seçilmemiş: Nöbetçi > Ayarlar > Proje ve ortamlar)' : ''}. Koşmak için --canli-onay seçeneğini açıkça verin.`);
    return 2;
  }

  const veri = await api(`/platform/senaryolar?projeId=${encodeURIComponent(proje.id)}&ortamId=${encodeURIComponent(ortam.id)}`);
  const ekranAdi = new Map((veri.ekranlar || []).map((e) => [e.id, e.ad]));
  const pasif = new Set((veri.ekranlar || []).filter((e) => e.durum === 'devre_disi').map((e) => e.id));
  const ekranKimlikleri = a.ekran.map((x) => { const e = bul(veri.ekranlar || [], x); if (!e) throw new Error(`Ekran bulunamadı: ${x}`); return e.id; });
  const secilen = (veri.senaryolar || []).filter((s) =>
    (a.hepsi || s.kosuyaDahil) && !pasif.has(s.ekranId)
    && (!ekranKimlikleri.length || ekranKimlikleri.includes(s.ekranId))
    && (!a.senaryo.length || a.senaryo.some((m) => sade(s.baslik).includes(sade(m)))));
  if (!secilen.length) { console.error('Seçime uyan senaryo yok.'); return 2; }

  if (a.liste) {
    for (const s of secilen) console.log(`- ${s.baslik}  [${ekranAdi.get(s.ekranId) || '—'}]`);
    console.log(`${secilen.length} senaryo · ${proje.ad} / ${ortam.ad}`);
    return 0;
  }

  const tam = !a.ekran.length && !a.senaryo.length;
  const kosuKimligi = `cli-${randomUUID()}`;
  // Koşu hızı: Ayarlar > Koşu > Ekran senaryoları (ortamın "Koşu hızı" ezer) — arayüzdeki "Koşuyu başlat" ile aynı. En çok N senaryo
  // aynı anda istenir; sunucu aynı sınırı ve senaryolar arası beklemeyi kendisi de uygular.
  const hiz = etkinKosuHizi((await api('/platform/kosu-ayarlari').catch(() => ({ ayarlar: {} }))).ayarlar, ortam);
  const n = hiz.degerler.ekranEszamanli;
  console.log(`Nöbetçi koşusu: ${proje.ad} / ${ortam.ad} · ${secilen.length} senaryo${tam ? ' (tam koşu)' : ''}\nKoşu hızı: ${kosuHiziOzeti(hiz, 'ekran')}`);
  /** @type {Array<{ baslik: string; ekran: string; durum: string; sureMs: number; mesaj: string }>} */
  const sirali = [];
  let durduruldu = false;
  let biten = 0;
  process.on('SIGINT', () => { durduruldu = true; console.error('\nDurduruluyor: sürmekte olan senaryolar bitince koşu kesilecek.'); });
  let siradaki = 0;
  const isci = async () => { while (siradaki < secilen.length && !durduruldu) { const i = siradaki++; await tekSenaryo(i, secilen[i]); } };
  const tekSenaryo = async (i, s) => {
    const bas = Date.now();
    let durumAdi = 'hata';
    let mesaj = '';
    let calistirilamadi = false;
    try {
      const y = await api('/platform/senaryolar/calistir', {
        projeId: proje.id, ortamId: ortam.id, senaryoId: s.id, kosuId: randomUUID(),
        kosuTuru: tam ? 'tam' : 'tekil', kosuKimligi, ...(tam ? { kosuKapsami: 'Genel' } : {}), ...(riskli ? { canliOnay: true } : {})
      });
      // Hazırlığı eksik (koşuya alınmadı; "Çalıştırılamadı"): atlanan gibi sayılır, gerekçe cümlesiyle.
      calistirilamadi = y.durum === 'calistirilamadi';
      durumAdi = y.durum === 'passed' ? 'basarili' : y.durum === 'skipped' || calistirilamadi ? 'atlanan' : y.durum === 'iptal' ? 'durduruldu' : 'basarisiz';
      mesaj = y.durum === 'passed' ? '' : String((calistirilamadi && y.hataMesaji) || y.hata || y.mesaj || '').split('\n')[0].slice(0, 300);
    } catch (hata) {
      mesaj = hata.message;
      // Kapalı izin / eksik canlı onayı: diğer senaryolar da aynı nedenle başlamaz — koşu burada kesilir.
      if (hata.kod === 'IZIN_KAPALI' || hata.kod === 'CANLI_ONAY_GEREKLI') { console.error(mesaj); durduruldu = true; }
    }
    const sureMs = Date.now() - bas;
    sirali[i] = { baslik: s.baslik, ekran: ekranAdi.get(s.ekranId) || '', durum: durumAdi, sureMs, mesaj, ...(calistirilamadi ? { calistirilamadi: true } : {}) };
    const isaret = { basarili: '✓', basarisiz: '✗', atlanan: '−', durduruldu: '■', hata: '!' }[durumAdi];
    console.log(`${String(++biten).padStart(3)}/${secilen.length} ${isaret} ${s.baslik} (${(sureMs / 1000).toFixed(1)} sn)${mesaj ? `\n        ${mesaj}` : ''}`);
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(n, secilen.length)) }, isci));
  // Sonuçlar (JSON / JUnit) senaryo sırasıyla; başlamayanlar yazılmaz.
  const sonuclar = sirali.filter(Boolean);

  const say = (d) => sonuclar.filter((x) => x.durum === d).length;
  const ozet = { proje: proje.ad, ortam: ortam.ad, toplam: sonuclar.length, basarili: say('basarili'), basarisiz: say('basarisiz'), atlanan: say('atlanan'), durduruldu: say('durduruldu'), hata: say('hata'),
    ...(sonuclar.some((x) => x.calistirilamadi) ? { calistirilamadi: sonuclar.filter((x) => x.calistirilamadi).length } : {}) };
  if (a.json) console.log(JSON.stringify({ ...ozet, sonuclar }, null, 2));
  else console.log(`\nÖzet: ${ozet.basarili} başarılı, ${ozet.basarisiz} başarısız, ${ozet.atlanan} atlandı${ozet.calistirilamadi ? ` (${ozet.calistirilamadi} tanesi hazırlığı eksik olduğu için koşuya alınmadı)` : ''}${ozet.hata ? `, ${ozet.hata} çalıştırılamadı` : ''}${ozet.durduruldu ? `, ${ozet.durduruldu} durduruldu` : ''}. Ayrıntı: Nöbetçi > Sonuçlar.`);
  if (a.junit) {
    const x = (s) => String(s).replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]);
    const vakalar = sonuclar.map((r) => `  <testcase classname="${x(r.ekran || proje.ad)}" name="${x(r.baslik)}" time="${(r.sureMs / 1000).toFixed(3)}">${
      r.durum === 'basarisiz' ? `<failure message="${x(r.mesaj)}"/>` : r.durum === 'hata' ? `<error message="${x(r.mesaj)}"/>` : r.durum === 'atlanan' || r.durum === 'durduruldu' ? '<skipped/>' : ''}</testcase>`);
    writeFileSync(a.junit, `<?xml version="1.0" encoding="UTF-8"?>\n<testsuite name="${x(`Nöbetçi · ${proje.ad} / ${ortam.ad}`)}" tests="${ozet.toplam}" failures="${ozet.basarisiz}" errors="${ozet.hata}" skipped="${ozet.atlanan + ozet.durduruldu}">\n${vakalar.join('\n')}\n</testsuite>\n`, 'utf8');
    console.log(`JUnit raporu: ${a.junit}`);
  }
  return ozet.basarisiz || ozet.hata || durduruldu ? 1 : 0;
}

process.exitCode = await main().catch((hata) => { console.error(hata.message); return 2; });
