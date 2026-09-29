// ENTEGRASYON TÜRLERİ KATALOĞU — Ayarlar > Entegrasyonlar'da bağlanabilen uygulama türleri. Her tür:
//   tur, ad, aciklama, ikon, alanlar [{ ad, etiket, tur, gizli, zorunlu, secenekler?, yardim?, varsayilan?, enAz?, enCok? }],
//   olaylar [{ ad, etiket, aciklama }]  (bağlantının tetikleneceği Nöbetçi olayları; boş olabilir),
//   denemeHedefi(alanlar)  → kullanıcıya onayda gösterilecek hedef (gizli yol / sorgu YAZILMAZ),
//   dene(alanlar, ortam)    → bağlantı denemesi (YALNIZ kullanıcı onaylayınca çağrılır),
//   ve türe özgü eylemler (olayGonder, kayitAc).
// Yeni tür eklemek: bu listeye bir nesne eklemek yeterlidir (arayüz alan tanımlarından formu çizer).
// Alan türleri: metin | adres (http/https) | secim | onay | sayi | cok-satir. gizli: true → kasada şifreli, ekranda maskeli,
// API'den { dolu, maske } döner.
// NOT: import.meta KULLANILMAZ.
import { EntegrasyonHatasi, adresOzeti, entegrasyonIstegi, yanitOzeti } from './istek.mjs';
import { SURUCULER, veritabaniSorgusu } from './veritabani-suruculeri.mjs';

/**
 * @typedef {{ ad: string; etiket: string; tur: 'metin' | 'adres' | 'secim' | 'onay' | 'sayi' | 'cok-satir'; gizli?: boolean; zorunlu?: boolean;
 *   secenekler?: ReadonlyArray<readonly [string, string]>; yardim?: string; varsayilan?: string | number | boolean; enAz?: number; enCok?: number;
 *   yerTutucu?: string; kapatmaUyarisi?: string }} AlanTanimi
 * @typedef {{ yasakDesenleri: ReadonlyArray<{ kalip: string; desen: RegExp }>; zamanAsimiMs: number }} IstekOrtami
 * @typedef {{ basarili: boolean; mesaj: string }} DenemeSonucu
 * @typedef {{ proje: string; ortam: string | null; kosuTuru: string; durum: string; toplam: number; basarili: number; kalan: number;
 *   atlanan: number; basariOrani: number | null; bitis: string | null }} KosuOzeti
 * @typedef {{ ad: string; tur: string; icerikTuru: string; veri: Buffer }} Ek
 */

/** Gizli alan değerleri (hata mesajlarını maskelemek için). @param {EntegrasyonTuru} t @param {Record<string, unknown>} alanlar */
export function gizliDegerler(t, alanlar) {
  return t.alanlar.filter((a) => a.gizli).map((a) => alanlar[a.ad]).filter((v) => typeof v === 'string' && v.length > 0).map(String);
}

const tabanAdres = (/** @type {unknown} */ v) => String(v ?? '').trim().replace(/\/+$/, '');
const kodlu = (/** @type {unknown} */ v) => encodeURIComponent(String(v ?? '').trim());

/** @param {number} kod @param {string} govde @param {string[]} gizliler @param {string} host */
function httpHatasi(kod, govde, gizliler, host) {
  const ozet = yanitOzeti(govde, gizliler);
  const neden = kod === 401 || kod === 403 ? 'kimlik doğrulanamadı ya da yetki yok' : kod === 404 ? 'bulunamadı' : kod === 429 ? 'çok fazla istek' : kod >= 500 ? 'sunucu hatası' : 'istek reddedildi';
  return `${host}: ${neden} (HTTP ${kod})${ozet ? ` — ${ozet}` : ''}`;
}

const hostAl = (/** @type {string} */ adres) => { try { return new URL(adres).host; } catch { return '?'; } };

// ---------------------------------------------------------------------------------------
// 1) Webhook bildirimi
// ---------------------------------------------------------------------------------------

/** @param {KosuOzeti} k */
export function kosuBildirimMetni(k) {
  const oran = k.basariOrani === null ? '—' : `%${k.basariOrani}`;
  const durum = k.durum === 'tamamlandi' ? '' : ` (${{ durduruldu: 'durduruldu', zaman_asimi: 'zaman aşımı', hata: 'hatayla bitti' }[k.durum] ?? k.durum})`;
  return `Nöbetçi · Koşu bitti${durum} — Proje: ${k.proje} · Ortam: ${k.ortam ?? '—'} · Başarı: ${oran} (${k.basarili}/${k.basarili + k.kalan}) · Başarısız: ${k.kalan}` +
    (k.atlanan ? ` · Atlanan: ${k.atlanan}` : '');
}

/** @param {Record<string, unknown>} alanlar @param {string} metin @param {Record<string, unknown>} ayrinti */
function webhookGovdesi(alanlar, metin, ayrinti) {
  return JSON.stringify(alanlar.bicim === 'ayrintili' ? { text: metin, nobetci: ayrinti } : { text: metin });
}

/** @type {EntegrasyonTuru} */
const WEBHOOK = {
  tur: 'webhook',
  ad: 'Webhook bildirimi',
  ikon: 'simsek',
  aciklama: 'Koşu bitince bir adrese kısa bir JSON bildirimi gönderir. Sohbet uygulamalarının "gelen webhook" adresleriyle (ör. Slack, Teams) uyumludur. İçerik: proje, ortam, başarı oranı ve başarısız sayısı; test verisi ya da gizli değer gönderilmez.',
  alanlar: [
    { ad: 'adres', etiket: 'Webhook adresi', tur: 'adres', gizli: true, zorunlu: true, yerTutucu: 'https://…',
      yardim: 'Uygulamanın verdiği gelen webhook adresi. Adres gizli bir anahtar içerdiği için kasada şifreli saklanır ve ekranda gösterilmez.' },
    { ad: 'bicim', etiket: 'İleti biçimi', tur: 'secim', zorunlu: true, varsayilan: 'sohbet',
      secenekler: [['sohbet', 'Sohbet uygulaması (yalnız "text")'], ['ayrintili', 'Ayrıntılı JSON ("text" + "nobetci" alanları)']],
      yardim: 'Ayrıntılı JSON, metnin yanında sayıları ayrı alanlar olarak da gönderir (kendi sisteminiz işleyecekse).' },
    { ad: 'yalnizKalanVarsa', etiket: 'Yalnız başarısız test varsa gönder', tur: 'onay', varsayilan: false,
      yardim: 'Açıksa tüm testler geçtiğinde bildirim gönderilmez.' }
  ],
  olaylar: [{ ad: 'kosu-bitti', etiket: 'Koşu bitti', aciklama: 'Nöbetçi\'den başlatılan bir ekran koşusu bitince.' }],
  denemeHedefi: (a) => ({ adres: adresOzeti(String(a.adres ?? '')), aciklama: 'Bu adrese bir deneme iletisi (POST, JSON) gönderilecek.' }),
  async dene(a, o) {
    const metin = 'Nöbetçi · Bağlantı denemesi — bu bir deneme iletisidir.';
    return webhookGonder(a, metin, { olay: 'deneme' }, o);
  },
  async olayGonder(a, olay, veri, o) {
    if (olay !== 'kosu-bitti') return null;
    const k = /** @type {KosuOzeti} */ (veri);
    if (a.yalnizKalanVarsa === true && k.kalan === 0) return null;
    return webhookGonder(a, kosuBildirimMetni(k), { olay, ...k }, o);
  }
};

/** @param {Record<string, unknown>} a @param {string} metin @param {Record<string, unknown>} ayrinti @param {IstekOrtami} o @returns {Promise<DenemeSonucu>} */
async function webhookGonder(a, metin, ayrinti, o) {
  const adres = String(a.adres ?? '');
  const y = await entegrasyonIstegi({
    adres, yontem: 'POST', basliklar: { 'Content-Type': 'application/json; charset=utf-8' }, govde: webhookGovdesi(a, metin, ayrinti),
    zamanAsimiMs: o.zamanAsimiMs, yasakDesenleri: o.yasakDesenleri
  });
  if (y.durumKodu >= 200 && y.durumKodu < 300) return { basarili: true, mesaj: `${hostAl(adres)} iletiyi kabul etti (HTTP ${y.durumKodu}).` };
  return { basarili: false, mesaj: httpHatasi(y.durumKodu, y.govde, [adres], hostAl(adres)) };
}

// ---------------------------------------------------------------------------------------
// 2) İş takip sistemi (hata kaydı açma)
// ---------------------------------------------------------------------------------------

/** @param {Record<string, unknown>} a */
function takipBasliklari(a) {
  const token = String(a.apiToken ?? '');
  const kullanici = String(a.kullanici ?? '').trim();
  const yetki = a.bicim === 'azure'
    ? `Basic ${Buffer.from(`${kullanici}:${token}`).toString('base64')}`
    : kullanici ? `Basic ${Buffer.from(`${kullanici}:${token}`).toString('base64')}` : `Bearer ${token}`;
  return { Authorization: yetki };
}

/** @type {EntegrasyonTuru} */
const IS_TAKIP = {
  tur: 'is-takip',
  ad: 'İş takip sistemi (hata kaydı)',
  ikon: 'hedef',
  aciklama: 'Sonuçlar\'daki bir testten, siz isteyince iş takip sisteminde hata kaydı açar. Gönderilecek başlık ve açıklama önce gösterilir; ekran görüntüsü / video yalnız siz seçerseniz eklenir.',
  alanlar: [
    { ad: 'bicim', etiket: 'Sistem biçimi', tur: 'secim', zorunlu: true, varsayilan: 'jira',
      secenekler: [['jira', 'Jira uyumlu (REST API v2)'], ['azure', 'Azure DevOps uyumlu (iş öğesi REST API)']] },
    { ad: 'tabanAdres', etiket: 'Taban adres', tur: 'adres', zorunlu: true, yerTutucu: 'https://…',
      yardim: 'Jira: sitenin kök adresi. Azure DevOps: kuruluş adresi (…/<kuruluş>).' },
    { ad: 'projeAnahtari', etiket: 'Proje anahtarı', tur: 'metin', zorunlu: true, yardim: 'Kayıtların açılacağı proje (Jira: proje anahtarı; Azure DevOps: proje adı).' },
    { ad: 'kayitTuru', etiket: 'Kayıt türü', tur: 'metin', zorunlu: true, yardim: 'Açılacak kaydın türünün sistemdeki adı (ör. hata kaydı türünüz).' },
    { ad: 'kullanici', etiket: 'Kullanıcı / e-posta', tur: 'metin',
      yardim: 'Jira: hesabın e-postası (boşsa belirteç "Bearer" olarak gönderilir). Azure DevOps: boş bırakılabilir.' },
    { ad: 'apiToken', etiket: 'API belirteci (token)', tur: 'metin', gizli: true, zorunlu: true, yardim: 'Kasada şifreli saklanır; ekranda gösterilmez.' }
  ],
  olaylar: [],
  denemeHedefi: (a) => ({ adres: `${adresOzeti(tabanAdres(a.tabanAdres))}`, aciklama: 'Bu adrese projeyi okuyan bir deneme isteği (GET) gönderilecek; kayıt açılmaz.' }),
  async dene(a, o) {
    const taban = tabanAdres(a.tabanAdres);
    const adres = a.bicim === 'azure' ? `${taban}/_apis/projects/${kodlu(a.projeAnahtari)}?api-version=7.0` : `${taban}/rest/api/2/project/${kodlu(a.projeAnahtari)}`;
    const y = await entegrasyonIstegi({ adres, yontem: 'GET', basliklar: takipBasliklari(a), zamanAsimiMs: o.zamanAsimiMs, yasakDesenleri: o.yasakDesenleri });
    if (y.durumKodu >= 200 && y.durumKodu < 300) {
      let ad = '';
      try { ad = String(JSON.parse(y.govde).name ?? ''); } catch { ad = ''; }
      return { basarili: true, mesaj: `Bağlandı${ad ? `: proje "${ad.slice(0, 80)}" bulundu` : ''}.` };
    }
    return { basarili: false, mesaj: httpHatasi(y.durumKodu, y.govde, gizliDegerler(IS_TAKIP, a), hostAl(adres)) };
  },
  async kayitAc(a, kayit, o) {
    const taban = tabanAdres(a.tabanAdres);
    const gizliler = gizliDegerler(IS_TAKIP, a);
    const basliklar = takipBasliklari(a);
    /** @type {{ anahtar: string; adres: string | null; ekUyarilari: string[] }} */
    let sonuc;
    if (a.bicim === 'azure') {
      const adres = `${taban}/${kodlu(a.projeAnahtari)}/_apis/wit/workitems/$${kodlu(a.kayitTuru)}?api-version=7.0`;
      const aciklamaHtml = kayit.aciklama.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
      const y = await entegrasyonIstegi({
        adres, yontem: 'POST', basliklar: { ...basliklar, 'Content-Type': 'application/json-patch+json' },
        govde: JSON.stringify([{ op: 'add', path: '/fields/System.Title', value: kayit.baslik }, { op: 'add', path: '/fields/System.Description', value: aciklamaHtml }]),
        zamanAsimiMs: o.zamanAsimiMs, yasakDesenleri: o.yasakDesenleri
      });
      if (y.durumKodu < 200 || y.durumKodu >= 300) throw new EntegrasyonHatasi(`Kayıt açılamadı — ${httpHatasi(y.durumKodu, y.govde, gizliler, hostAl(adres))}`);
      const j = JSON.parse(y.govde || '{}');
      sonuc = { anahtar: String(j.id ?? ''), adres: j._links?.html?.href ? String(j._links.html.href) : `${taban}/${kodlu(a.projeAnahtari)}/_workitems/edit/${j.id}`, ekUyarilari: [] };
      for (const ek of kayit.ekler) {
        try {
          const yk = await entegrasyonIstegi({
            adres: `${taban}/${kodlu(a.projeAnahtari)}/_apis/wit/attachments?fileName=${encodeURIComponent(ek.ad)}&api-version=7.0`, yontem: 'POST',
            basliklar: { ...basliklar, 'Content-Type': 'application/octet-stream' }, govde: ek.veri, zamanAsimiMs: o.zamanAsimiMs, yasakDesenleri: o.yasakDesenleri
          });
          if (yk.durumKodu < 200 || yk.durumKodu >= 300) throw new EntegrasyonHatasi(`HTTP ${yk.durumKodu}`);
          const url = String(JSON.parse(yk.govde || '{}').url ?? '');
          const yb = await entegrasyonIstegi({
            adres: `${taban}/${kodlu(a.projeAnahtari)}/_apis/wit/workitems/${kodlu(j.id)}?api-version=7.0`, yontem: 'PATCH',
            basliklar: { ...basliklar, 'Content-Type': 'application/json-patch+json' },
            govde: JSON.stringify([{ op: 'add', path: '/relations/-', value: { rel: 'AttachedFile', url } }]), zamanAsimiMs: o.zamanAsimiMs, yasakDesenleri: o.yasakDesenleri
          });
          if (yb.durumKodu < 200 || yb.durumKodu >= 300) throw new EntegrasyonHatasi(`HTTP ${yb.durumKodu}`);
        } catch (h) { sonuc.ekUyarilari.push(`${ek.ad} eklenemedi (${/** @type {Error} */ (h).message}).`); }
      }
    } else {
      const adres = `${taban}/rest/api/2/issue`;
      const y = await entegrasyonIstegi({
        adres, yontem: 'POST', basliklar: { ...basliklar, 'Content-Type': 'application/json' },
        govde: JSON.stringify({ fields: { project: { key: String(a.projeAnahtari ?? '').trim() }, summary: kayit.baslik, description: kayit.aciklama, issuetype: { name: String(a.kayitTuru ?? '').trim() } } }),
        zamanAsimiMs: o.zamanAsimiMs, yasakDesenleri: o.yasakDesenleri
      });
      if (y.durumKodu < 200 || y.durumKodu >= 300) throw new EntegrasyonHatasi(`Kayıt açılamadı — ${httpHatasi(y.durumKodu, y.govde, gizliler, hostAl(adres))}`);
      const j = JSON.parse(y.govde || '{}');
      const anahtar = String(j.key ?? j.id ?? '');
      sonuc = { anahtar, adres: anahtar ? `${taban}/browse/${encodeURIComponent(anahtar)}` : null, ekUyarilari: [] };
      for (const ek of kayit.ekler) {
        try {
          const sinir = `----nobetci${Date.now().toString(16)}`;
          const govde = Buffer.concat([
            Buffer.from(`--${sinir}\r\nContent-Disposition: form-data; name="file"; filename="${ek.ad.replace(/["\r\n]/g, '_')}"\r\nContent-Type: ${ek.icerikTuru}\r\n\r\n`),
            ek.veri, Buffer.from(`\r\n--${sinir}--\r\n`)
          ]);
          const yk = await entegrasyonIstegi({
            adres: `${taban}/rest/api/2/issue/${encodeURIComponent(anahtar)}/attachments`, yontem: 'POST',
            basliklar: { ...basliklar, 'Content-Type': `multipart/form-data; boundary=${sinir}`, 'X-Atlassian-Token': 'no-check' }, govde,
            zamanAsimiMs: o.zamanAsimiMs, yasakDesenleri: o.yasakDesenleri
          });
          if (yk.durumKodu < 200 || yk.durumKodu >= 300) throw new EntegrasyonHatasi(`HTTP ${yk.durumKodu}`);
        } catch (h) { sonuc.ekUyarilari.push(`${ek.ad} eklenemedi (${/** @type {Error} */ (h).message}).`); }
      }
    }
    return sonuc;
  }
};

// ---------------------------------------------------------------------------------------
// 3) Veritabanı bağlantısı
// ---------------------------------------------------------------------------------------

/** Kayıtlı alanlardan sürücü ayarı. @param {Record<string, unknown>} a @returns {import('./veritabani-suruculeri.mjs').VeritabaniAyari} */
export function veritabaniAyari(a) {
  return {
    surucu: /** @type {any} */ (String(a.surucu ?? '')), sunucu: String(a.sunucu ?? '').trim(), port: a.port === null || a.port === undefined || a.port === '' ? null : Number(a.port),
    veritabani: String(a.veritabani ?? '').trim(), kullanici: String(a.kullanici ?? '').trim(), parola: typeof a.parola === 'string' ? a.parola : '',
    tls: /** @type {any} */ (String(a.tls ?? 'kapali')), zamanAsimiSn: Number(a.zamanAsimiSn) || 30, yalnizOkuma: a.yalnizOkuma !== false
  };
}

/** @type {EntegrasyonTuru} */
const VERITABANI = {
  tur: 'veritabani',
  ad: 'Veritabanı bağlantısı',
  ikon: 'veri',
  aciklama: 'SQL Server, Oracle, PostgreSQL ya da MySQL/MariaDB veritabanına bağlantı. Ekran / servis akışlarındaki SQL adımları bu bağlantıyı kullanır. Parola kasada şifreli saklanır; "Yalnız okuma" açıkken yalnız SELECT / WITH sorguları çalışır.',
  alanlar: [
    { ad: 'surucu', etiket: 'Veritabanı türü', tur: 'secim', zorunlu: true, varsayilan: 'postgres',
      secenekler: /** @type {Array<[string, string]>} */ (Object.entries(SURUCULER).map(([d, s]) => [d, s.etiket])),
      yardim: 'Sürücüler ücretsiz açık kaynak paketlerdir (mssql, oracledb — THIN mod, Instant Client gerekmez —, pg, mysql2).' },
    { ad: 'sunucu', etiket: 'Sunucu', tur: 'metin', zorunlu: true, yerTutucu: 'db.ornek.local' },
    { ad: 'port', etiket: 'Port', tur: 'sayi', enAz: 1, enCok: 65535, yardim: 'Boşsa türün varsayılan portu (SQL Server 1433, Oracle 1521, PostgreSQL 5432, MySQL 3306).' },
    { ad: 'veritabani', etiket: 'Veritabanı / servis adı', tur: 'metin', yardim: 'Oracle için servis adı.' },
    { ad: 'kullanici', etiket: 'Kullanıcı', tur: 'metin' },
    { ad: 'parola', etiket: 'Parola', tur: 'metin', gizli: true, yardim: 'Kasada şifreli saklanır; ekranda gösterilmez.' },
    { ad: 'tls', etiket: 'Şifreleme (TLS)', tur: 'secim', zorunlu: true, varsayilan: 'kapali',
      secenekler: [['kapali', 'Kapalı'], ['acik', 'Açık (sertifika doğrulanır)'], ['acik-dogrulamasiz', 'Açık (sertifika doğrulanmaz — yalnız güvendiğiniz iç ağda)']] },
    { ad: 'zamanAsimiSn', etiket: 'Zaman aşımı (sn)', tur: 'sayi', zorunlu: true, varsayilan: 30, enAz: 1, enCok: 600, yardim: 'Bağlantı ve sorgu için en çok bekleme.' },
    { ad: 'yalnizOkuma', etiket: 'Yalnız okuma', tur: 'onay', varsayilan: true,
      yardim: 'Açıkken yalnız SELECT / WITH ile başlayan tek ifade çalışır ve oturum (destekleyen sürücülerde) salt okunur açılır.',
      kapatmaUyarisi: 'Yalnız okumayı kapatırsanız bu bağlantıyı kullanan SQL adımları veri ekleyebilir, değiştirebilir ya da silebilir. Yalnız test veritabanlarında ve ne yaptığınızdan eminseniz kapatın.' }
  ],
  olaylar: [],
  denemeHedefi(a) {
    const v = veritabaniAyari(a);
    const s = SURUCULER[/** @type {keyof typeof SURUCULER} */ (v.surucu)];
    return { adres: `${v.sunucu}:${v.port || s?.port || '?'}${v.veritabani ? `/${v.veritabani}` : ''}`, aciklama: `Bu sunucuya ${s ? s.etiket : 'veritabanı'} sürücüsüyle bağlanılıp "${s ? s.deneme : 'SELECT 1'}" çalıştırılacak.` };
  },
  async dene(a, o) {
    const v = veritabaniAyari(a);
    const s = SURUCULER[/** @type {keyof typeof SURUCULER} */ (v.surucu)];
    if (!s) return { basarili: false, mesaj: 'Veritabanı türü seçilmedi.' };
    await veritabaniSorgusu({ ...v, yalnizOkuma: true }, s.deneme, {}, { zamanAsimiMs: v.zamanAsimiSn ? v.zamanAsimiSn * 1000 : o.zamanAsimiMs, satirSiniri: 1, yasakDesenleri: o.yasakDesenleri });
    return { basarili: true, mesaj: `Bağlandı: ${s.etiket} "${s.deneme}" sorgusuna yanıt verdi.` };
  }
};

/**
 * @typedef {{
 *   tur: string; ad: string; ikon: string; aciklama: string; alanlar: AlanTanimi[]; olaylar: Array<{ ad: string; etiket: string; aciklama: string }>;
 *   denemeHedefi: (alanlar: Record<string, unknown>) => { adres: string; aciklama: string };
 *   dene: (alanlar: Record<string, unknown>, ortam: IstekOrtami) => Promise<DenemeSonucu>;
 *   olayGonder?: (alanlar: Record<string, unknown>, olay: string, veri: unknown, ortam: IstekOrtami) => Promise<DenemeSonucu | null>;
 *   kayitAc?: (alanlar: Record<string, unknown>, kayit: { baslik: string; aciklama: string; ekler: Ek[] }, ortam: IstekOrtami) => Promise<{ anahtar: string; adres: string | null; ekUyarilari: string[] }>;
 * }} EntegrasyonTuru
 */

/** @type {ReadonlyArray<EntegrasyonTuru>} */
export const ENTEGRASYON_TURLERI = Object.freeze([WEBHOOK, IS_TAKIP, VERITABANI]);

/** @param {unknown} tur @returns {EntegrasyonTuru | undefined} */
export const turBul = (tur) => ENTEGRASYON_TURLERI.find((t) => t.tur === tur);

/** Arayüze giden katalog (fonksiyonlar hariç). */
export function katalogGorunumu() {
  return ENTEGRASYON_TURLERI.map((t) => ({
    tur: t.tur, ad: t.ad, ikon: t.ikon, aciklama: t.aciklama, alanlar: t.alanlar, olaylar: t.olaylar,
    hataKaydi: typeof t.kayitAc === 'function', sorgu: t.tur === 'veritabani'
  }));
}
